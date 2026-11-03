const router = require('express').Router();
const ExcelJS = require('exceljs');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, range, round2 } = require('../services/util');
const settings = require('../services/settings');

router.use(auth, owner);

const C = (key, label, type = 'text', sum = false) => ({ key, label, type, sum });
const DONE = "s.store_id = ? AND s.status = 'DONE'"; // param pertama selalu id toko

const REPORTS = {
  sales_daily: {
    title: 'Penjualan Harian', ranged: true,
    cols: [C('date', 'Tanggal', 'date'), C('trx', 'Transaksi', 'int', true), C('subtotal', 'Subtotal', 'money', true), C('discount', 'Diskon', 'money', true), C('tax', 'Pajak', 'money', true), C('total', 'Total', 'money', true), C('profit', 'Laba Kotor', 'money', true)],
    async run(q, r, sid) {
      const rows = await db.query(`SELECT DATE(s.created_at) AS date, COUNT(*) AS trx, SUM(s.subtotal) AS subtotal, SUM(s.discount) AS discount, SUM(s.tax) AS tax, SUM(s.total) AS total
        FROM sales s WHERE ${DONE} AND s.created_at >= ? AND s.created_at < ? GROUP BY DATE(s.created_at) ORDER BY DATE(s.created_at)`, [sid, r.f, r.t]);
      const m = await db.query(`SELECT DATE(s.created_at) AS date, SUM(i.total - i.cost * i.qty) AS margin FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE ${DONE} AND s.created_at >= ? AND s.created_at < ? GROUP BY DATE(s.created_at)`, [sid, r.f, r.t]);
      const mm = new Map(m.map((x) => [x.date, x.margin]));
      return rows.map((x) => ({ ...x, profit: round2((mm.get(x.date) || 0) - x.discount) }));
    },
  },
  sales_detail: {
    title: 'Rincian Transaksi Penjualan', ranged: true,
    cols: [C('sale_no', 'No. Transaksi'), C('created_at', 'Waktu', 'datetime'), C('kind', 'Jenis'), C('cashier', 'Kasir'), C('customer', 'Pelanggan'), C('method', 'Metode'), C('status', 'Status'), C('subtotal', 'Subtotal', 'money', true), C('discount', 'Diskon', 'money', true), C('tax', 'Pajak', 'money', true), C('total', 'Total', 'money', true), C('paid', 'Dibayar', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT s.sale_no, s.created_at, s.kind, u.name AS cashier, c.name AS customer, s.method, s.status, s.subtotal, s.discount, s.tax, s.total, s.paid
      FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.store_id = ? AND s.created_at >= ? AND s.created_at < ? ORDER BY s.id`, [sid, r.f, r.t]),
  },
  sales_items: {
    title: 'Penjualan per Barang', ranged: true,
    cols: [C('sku', 'SKU'), C('name', 'Nama Barang'), C('unit', 'Satuan'), C('qty', 'Qty', 'qty', true), C('revenue', 'Penjualan', 'money', true), C('cost', 'HPP', 'money', true), C('profit', 'Laba Kotor', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT i.sku, i.name, i.unit, SUM(i.qty) AS qty, SUM(i.total) AS revenue, SUM(i.cost * i.qty) AS cost, SUM(i.total - i.cost * i.qty) AS profit
      FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${DONE} AND s.created_at >= ? AND s.created_at < ?
      GROUP BY i.product_id, i.sku, i.name, i.unit ORDER BY SUM(i.total) DESC`, [sid, r.f, r.t]),
  },
  sales_cashier: {
    title: 'Penjualan per Kasir', ranged: true,
    cols: [C('cashier', 'Kasir'), C('trx', 'Transaksi', 'int', true), C('total', 'Total', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT u.name AS cashier, COUNT(*) AS trx, SUM(s.total) AS total FROM sales s JOIN users u ON u.id = s.user_id
      WHERE ${DONE} AND s.created_at >= ? AND s.created_at < ? GROUP BY u.id, u.name ORDER BY SUM(s.total) DESC`, [sid, r.f, r.t]),
  },
  stock: {
    title: 'Stok Barang Saat Ini',
    cols: [C('sku', 'SKU'), C('barcode', 'Barcode'), C('name', 'Nama Barang'), C('category', 'Kategori'), C('unit', 'Satuan'), C('stock', 'Stok', 'qty', true), C('buy_price', 'Harga Beli', 'money'), C('value', 'Nilai Stok', 'money', true), C('sell_price', 'Harga Jual', 'money')],
    run: (q, r, sid) => db.query(`SELECT p.sku, p.barcode, p.name, c.name AS category, p.unit, p.stock, p.buy_price, p.stock * p.buy_price AS value, p.sell_price
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.store_id = ? AND p.active = 1 ${q.category_id ? 'AND p.category_id = ?' : ''} ORDER BY p.name`, q.category_id ? [sid, q.category_id] : [sid]),
  },
  low_stock: {
    title: 'Stok Menipis',
    cols: [C('sku', 'SKU'), C('name', 'Nama Barang'), C('category', 'Kategori'), C('unit', 'Satuan'), C('stock', 'Stok', 'qty'), C('min_stock', 'Stok Minimum', 'qty'), C('short', 'Kekurangan', 'qty')],
    run: (q, r, sid) => db.query(`SELECT p.sku, p.name, c.name AS category, p.unit, p.stock, p.min_stock, p.min_stock - p.stock AS short
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.store_id = ? AND p.active = 1 AND p.stock <= p.min_stock ORDER BY p.stock - p.min_stock, p.name`, [sid]),
  },
  purchases: {
    title: 'Pembelian', ranged: true, dateOnly: true,
    cols: [C('po_no', 'No. Pembelian'), C('date', 'Tanggal', 'date'), C('supplier', 'Pemasok'), C('supplier_ref', 'No. Faktur Pemasok'), C('status', 'Status'), C('total', 'Total', 'money', true), C('paid', 'Dibayar', 'money', true), C('outstanding', 'Sisa Hutang', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT p.po_no, p.date, s.name AS supplier, p.supplier_ref, p.status, p.total, p.paid, CASE WHEN p.status = 'CANCELLED' THEN 0 ELSE p.total - p.paid END AS outstanding
      FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.store_id = ? AND p.date >= ? AND p.date <= ? ORDER BY p.id`, [sid, r.from, r.to]),
  },
  receipts: {
    title: 'Penerimaan Barang', ranged: true, dateOnly: true,
    cols: [C('gr_no', 'No. Penerimaan'), C('date', 'Tanggal', 'date'), C('po_no', 'No. Pembelian'), C('supplier', 'Pemasok'), C('supplier_do', 'SJ Pemasok'), C('status', 'Status'), C('sku', 'SKU'), C('name', 'Barang'), C('qty', 'Qty', 'qty'), C('price', 'Harga', 'money'), C('total', 'Nilai', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT g.gr_no, g.date, pu.po_no, s.name AS supplier, g.supplier_do, g.status, p.sku, i.name, i.qty, i.price, i.qty * i.price AS total
      FROM goods_receipt_items i JOIN goods_receipts g ON g.id = i.receipt_id JOIN purchases pu ON pu.id = g.purchase_id JOIN suppliers s ON s.id = g.supplier_id JOIN products p ON p.id = i.product_id
      WHERE g.store_id = ? AND g.date >= ? AND g.date <= ? ORDER BY g.id, i.id`, [sid, r.from, r.to]),
  },
  opnames: {
    title: 'Stok Opname', ranged: true, dateOnly: true,
    cols: [C('opname_no', 'No. Opname'), C('date', 'Tanggal', 'date'), C('name', 'Barang'), C('unit', 'Satuan'), C('system_qty', 'Stok Sistem', 'qty'), C('counted_qty', 'Hasil Hitung', 'qty'), C('diff', 'Selisih', 'qty'), C('value', 'Nilai Selisih', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT o.opname_no, o.date, i.name, i.unit, i.system_qty, i.counted_qty, i.diff, i.diff * i.cost AS value
      FROM opname_items i JOIN opnames o ON o.id = i.opname_id WHERE o.store_id = ? AND o.date >= ? AND o.date <= ? ORDER BY o.id, i.id`, [sid, r.from, r.to]),
  },
  receivables: {
    title: 'Piutang Pelanggan',
    cols: [C('sale_no', 'No. Transaksi'), C('date', 'Tanggal', 'date'), C('customer', 'Pelanggan'), C('due_date', 'Jatuh Tempo', 'date'), C('total', 'Total', 'money', true), C('paid', 'Dibayar', 'money', true), C('outstanding', 'Sisa', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT s.sale_no, DATE(s.created_at) AS date, c.name AS customer, s.due_date, s.total, s.paid, s.total - s.paid AS outstanding
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.store_id = ? AND s.status = 'DONE' AND s.paid < s.total ORDER BY s.due_date, s.id`, [sid]),
  },
  payables: {
    title: 'Hutang Pemasok',
    cols: [C('po_no', 'No. Pembelian'), C('date', 'Tanggal', 'date'), C('supplier', 'Pemasok'), C('supplier_ref', 'No. Faktur'), C('due_date', 'Jatuh Tempo', 'date'), C('total', 'Total', 'money', true), C('paid', 'Dibayar', 'money', true), C('outstanding', 'Sisa', 'money', true)],
    run: (q, r, sid) => db.query(`SELECT p.po_no, p.date, s.name AS supplier, p.supplier_ref, p.due_date, p.total, p.paid, p.total - p.paid AS outstanding
      FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.store_id = ? AND p.status <> 'CANCELLED' AND p.paid < p.total ORDER BY p.due_date, p.id`, [sid]),
  },
};

function meta(req) {
  const rep = REPORTS[req.params.name];
  if (!rep) throw err(404, 'Laporan tidak ditemukan');
  return rep;
}
router.get('/', (req, res) => res.json(Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title, ranged: !!r.ranged, category: id === 'stock' || id === 'low_stock' }))));
router.get('/:name', wrap(async (req, res) => {
  const rep = meta(req); const r = range(req.query);
  res.json({ title: rep.title, cols: rep.cols, rows: await rep.run(req.query, r, req.sid), from: r.from, to: r.to, ranged: !!rep.ranged });
}));

router.get('/:name/excel', wrap(async (req, res) => {
  const rep = meta(req); const r = range(req.query);
  const rows = await rep.run(req.query, r, req.sid);
  const s = await settings.get(req.sid);
  const wb = new ExcelJS.Workbook(); wb.creator = s.store_name; wb.created = new Date();
  const ws = wb.addWorksheet(rep.title.slice(0, 30), { views: [{ state: 'frozen', ySplit: 5 }] });
  const n = rep.cols.length;
  ws.addRow([s.store_name]).font = { bold: true, size: 14 };
  ws.addRow([rep.title]).font = { bold: true, size: 12 };
  ws.addRow([rep.ranged ? `Periode: ${r.from} s/d ${r.to}` : `Per tanggal: ${db.today()}`]);
  ws.addRow([`Dicetak: ${db.now()}`]).font = { color: { argb: 'FF787774' } };
  const head = ws.addRow(rep.cols.map((c) => c.label));
  head.font = { bold: true }; head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F6F3' } }; c.border = { bottom: { style: 'thin' }, top: { style: 'thin' } }; });
  const fmt = { money: '#,##0', int: '#,##0', qty: '#,##0.###' };
  rep.cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(12, c.label.length + 4); if (fmt[c.type]) col.numFmt = fmt[c.type]; if (fmt[c.type]) col.alignment = { horizontal: 'right' }; });
  for (const row of rows) ws.addRow(rep.cols.map((c) => row[c.key] ?? null));
  // lebar kolom mengikuti isi
  rep.cols.forEach((c, i) => { let w = c.label.length + 4; for (const row of rows.slice(0, 300)) w = Math.max(w, String(row[c.key] ?? '').length + 2); ws.getColumn(i + 1).width = Math.min(w, 45); });
  const sums = rep.cols.map((c) => (c.sum ? rows.reduce((a, x) => a + (+x[c.key] || 0), 0) : null));
  if (sums.some((x) => x != null)) {
    const t = ws.addRow(rep.cols.map((c, i) => (i === 0 ? 'TOTAL' : sums[i] == null ? null : round2(sums[i]))));
    t.font = { bold: true }; t.eachCell((c) => { c.border = { top: { style: 'thin' } }; });
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${req.params.name}_${r.from}${rep.ranged ? '_' + r.to : ''}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

// ---------- Dashboard ----------
const dash = require('express').Router();
dash.use(auth, owner);
dash.get('/', wrap(async (req, res) => {
  const today = db.today();
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return db.today(x); };
  const d6 = d(-6); const tomorrow = d(1);
  const [t0, t1] = [today + ' 00:00:00', tomorrow + ' 00:00:00'];
  const sid = req.sid;
  const sumDay = (a, b) => db.one(`SELECT COUNT(*) AS trx, COALESCE(SUM(total), 0) AS total FROM sales WHERE store_id = ? AND status = 'DONE' AND created_at >= ? AND created_at < ?`, [sid, a, b]);
  const [now, yest] = await Promise.all([sumDay(t0, t1), sumDay(d(-1) + ' 00:00:00', t0)]);
  const margin = await db.one(`SELECT COALESCE(SUM(i.total - i.cost * i.qty), 0) AS m FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.store_id = ? AND s.status = 'DONE' AND s.created_at >= ? AND s.created_at < ?`, [sid, t0, t1]);
  const disc = await db.one(`SELECT COALESCE(SUM(discount), 0) AS d FROM sales WHERE store_id = ? AND status = 'DONE' AND created_at >= ? AND created_at < ?`, [sid, t0, t1]);
  const series = await db.query(`SELECT DATE(created_at) AS date, SUM(total) AS total FROM sales WHERE store_id = ? AND status = 'DONE' AND created_at >= ? AND created_at < ? GROUP BY DATE(created_at)`, [sid, d6 + ' 00:00:00', t1]);
  const sm = new Map(series.map((x) => [x.date, x.total]));
  const days = []; for (let i = 6; i >= 0; i--) { const k = d(-i); days.push({ date: k, total: sm.get(k) || 0 }); }
  const top = await db.query(`SELECT i.name, SUM(i.qty) AS qty, SUM(i.total) AS revenue FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.store_id = ? AND s.status = 'DONE' AND s.created_at >= ? AND s.created_at < ? GROUP BY i.product_id, i.name ORDER BY SUM(i.total) DESC LIMIT 5`, [sid, d6 + ' 00:00:00', t1]);
  const low = await db.one('SELECT COUNT(*) AS n FROM products WHERE store_id = ? AND active = 1 AND stock <= min_stock', [sid]);
  const lowList = await db.query('SELECT name, stock, min_stock, unit FROM products WHERE store_id = ? AND active = 1 AND stock <= min_stock ORDER BY stock - min_stock LIMIT 5', [sid]);
  const val = await db.one('SELECT COALESCE(SUM(stock * buy_price), 0) AS v, COUNT(*) AS n FROM products WHERE store_id = ? AND active = 1', [sid]);
  const ar = await db.one("SELECT COALESCE(SUM(total - paid), 0) AS v, COUNT(*) AS n FROM sales WHERE store_id = ? AND status = 'DONE' AND paid < total", [sid]);
  const ap = await db.one("SELECT COALESCE(SUM(total - paid), 0) AS v, COUNT(*) AS n FROM purchases WHERE store_id = ? AND status <> 'CANCELLED' AND paid < total", [sid]);
  const open = await db.one("SELECT COUNT(*) AS n FROM purchases WHERE store_id = ? AND status IN ('OPEN','PARTIAL')", [sid]);
  const recent = await db.query(`SELECT s.id, s.sale_no, s.created_at, s.total, s.method, s.status, u.name AS cashier FROM sales s JOIN users u ON u.id = s.user_id WHERE s.store_id = ? ORDER BY s.id DESC LIMIT 8`, [sid]);
  res.json({
    today: { total: now.total, trx: now.trx, avg: now.trx ? round2(now.total / now.trx) : 0, profit: round2(margin.m - disc.d), yesterday: yest.total },
    days, top, low_count: low.n, low_list: lowList, stock_value: val.v, product_count: val.n,
    receivable: ar, payable: ap, open_purchases: open.n, recent,
  });
}));
module.exports = router; module.exports.dashboard = dash;
