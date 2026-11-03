// Penjualan Custom (di luar POS): faktur ke perusahaan/instansi dengan no. kontrak, mode pajak
// dan harga yang diatur per transaksi. Tetap mengurangi stok dan masuk laporan/piutang yang sama.
const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, nextNo, ymd } = require('../services/util');
const stock = require('../services/stock');
const settings = require('../services/settings');
const { loadSale } = require('./sales');

router.use(auth, owner);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const TAX_MODES = ['NONE', 'EXCLUDE', 'INCLUDE'];
const METHODS = ['TUNAI', 'DEBIT', 'QRIS', 'TRANSFER', 'KREDIT'];

// {n}=nomor urut 2 digit, {n3}=3 digit, {rom}=bulan romawi, {mm}, {code}=kode toko, {yyyy}, {yy}
function formatNo(fmt, n, date, code) {
  const [y, m] = date.split('-');
  return fmt.replace(/\{n3\}/g, String(n).padStart(3, '0')).replace(/\{n\}/g, String(n).padStart(2, '0'))
    .replace(/\{rom\}/g, ROMAN[+m - 1]).replace(/\{mm\}/g, m).replace(/\{code\}/g, code)
    .replace(/\{yyyy\}/g, y).replace(/\{yy\}/g, y.slice(2));
}
const counterKey = (sid, date) => `${sid}:CINV-${date.slice(0, 4)}`;

// Pratinjau nomor berikutnya (tidak menaikkan counter)
router.get('/next-no', wrap(async (req, res) => {
  const date = ymd(req.query.date) || db.today();
  const [s, c] = [await settings.get(req.sid), await db.one('SELECT v FROM counters WHERE k = ?', [counterKey(req.sid, date)])];
  res.json({ no: formatNo(s.doc_no_format, (c ? c.v : 0) + 1, date, req.store.code) });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw err(400, 'Isi minimal satu barang');
  if (items.length > 200) throw err(400, 'Terlalu banyak baris');
  const cfg = await settings.get(req.sid);
  const date = ymd(b.doc_date) || db.today();
  const tax_mode = String(b.tax_mode || 'NONE').toUpperCase();
  if (!TAX_MODES.includes(tax_mode)) throw err(400, 'Mode pajak tidak valid');
  const tax_rate = tax_mode === 'NONE' ? 0 : round2(num(b.tax_rate, cfg.custom_tax_percent));
  if (tax_rate < 0 || tax_rate > 100) throw err(400, 'Tarif pajak 0-100');
  const payMethod = String(b.method || 'TRANSFER').toUpperCase();
  if (!METHODS.includes(payMethod) || payMethod === 'KREDIT') throw err(400, 'Metode pembayaran tidak valid');

  const id = await db.tx(async (t) => {
    const customer_id = +b.customer_id || null;
    if (!customer_id) throw err(400, 'Pilih pelanggan (perusahaan/instansi)');
    if (!(await t.one('SELECT id FROM customers WHERE id = ? AND store_id = ?', [customer_id, req.sid]))) throw err(400, 'Pelanggan tidak ditemukan');
    const ids = [...new Set(items.map((i) => +i.product_id))].sort((a, c) => a - c);
    if (ids.some((x) => !x)) throw err(400, 'Barang tidak valid');
    const prods = new Map();
    for (const pid of ids) {
      const p = await t.one('SELECT id, sku, name, unit, buy_price, active FROM products WHERE id = ? AND store_id = ?', [pid, req.sid]);
      if (!p) throw err(400, 'Barang tidak ditemukan');
      if (!p.active) throw err(400, `${p.name} nonaktif`);
      prods.set(pid, p);
    }
    const lines = []; let subtotal = 0;
    for (const i of items) {
      const p = prods.get(+i.product_id);
      const qty = round3(num(i.qty)); const price = round2(num(i.price));
      if (!(qty > 0)) throw err(400, `Qty ${p.name} harus > 0`);
      if (price < 0) throw err(400, `Harga ${p.name} tidak valid`);
      const disc = round2(Math.max(num(i.discount), 0));
      const gross = round2(qty * price);
      if (disc > gross) throw err(400, `Diskon ${p.name} melebihi harga`);
      const total = round2(gross - disc); subtotal += total;
      lines.push({ p, qty, price, disc, total, name: String(i.name || '').trim().slice(0, 200) || p.name, unit: String(i.unit || '').trim().slice(0, 20) || p.unit });
    }
    subtotal = round2(subtotal);
    const discount = round2(Math.max(num(b.discount), 0));
    if (discount > subtotal) throw err(400, 'Diskon melebihi subtotal');
    const base = round2(subtotal - discount);
    let tax = 0; let total = base;
    if (tax_mode === 'EXCLUDE') { tax = round2(base * tax_rate / 100); total = round2(base + tax); }
    else if (tax_mode === 'INCLUDE') { tax = round2(base - base / (1 + tax_rate / 100)); }
    const paid = round2(Math.max(num(b.paid), 0));
    if (paid > total) throw err(400, 'Pembayaran melebihi total');
    const method = paid >= total && total > 0 ? payMethod : 'KREDIT';
    const due = ymd(b.due_date) || (method === 'KREDIT' ? (() => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + (cfg.default_due_days || 14)); return db.today(d); })() : null);

    // Nomor: isian manual, atau otomatis sesuai format toko
    let sale_no = String(b.doc_no || '').trim().slice(0, 30);
    if (sale_no) {
      if (await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, sale_no])) throw err(409, 'Nomor dokumen sudah dipakai');
    } else {
      for (let k = 0; k < 50 && !sale_no; k++) {
        const n = await t.nextCounter(counterKey(req.sid, date));
        const cand = formatNo(cfg.doc_no_format, n, date, req.store.code).slice(0, 30);
        if (!(await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, cand]))) sale_no = cand;
      }
      if (!sale_no) throw err(500, 'Gagal membuat nomor dokumen');
    }
    const clock = t.now().slice(11);
    const created_at = `${date} ${clock}`;
    const sid = await t.insert('sales', {
      store_id: req.sid, kind: 'CUSTOM', sale_no, created_at, doc_date: date, user_id: req.user.id, customer_id,
      subtotal, discount, tax, total, paid, change_amount: 0, method, due_date: due, status: 'DONE',
      contract_no: b.contract_no ? String(b.contract_no).trim().slice(0, 80) : null, contract_date: ymd(b.contract_date),
      po_ref: b.po_ref ? String(b.po_ref).trim().slice(0, 80) : null, tax_mode, tax_rate,
      spp_to: b.spp_to ? String(b.spp_to).trim().slice(0, 300) : null,
      note: b.note ? String(b.note).slice(0, 300) : null,
    });
    for (const l of lines.slice().sort((x, y) => x.p.id - y.p.id)) {
      await stock.move(t, { store_id: req.sid, product_id: l.p.id, qty: -l.qty, type: 'SALE', ref_type: 'SALE', ref_id: sid, ref_no: sale_no, note: 'Penjualan custom', user_id: req.user.id, allowNegative: cfg.allow_negative_stock });
    }
    for (const l of lines) await t.insert('sale_items', { sale_id: sid, product_id: l.p.id, sku: l.p.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, cost: l.p.buy_price, discount: l.disc, total: l.total });
    if (paid > 0) await t.insert('payments', { ref_type: 'SALE', ref_id: sid, created_at, amount: paid, method: payMethod, note: paid >= total ? 'Lunas' : 'Uang muka', user_id: req.user.id });
    return sid;
  });
  res.status(201).json(await loadSale(id, req.sid));
}));
module.exports = router; module.exports.formatNo = formatNo;
