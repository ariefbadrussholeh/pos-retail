const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, like, nextNo, range, page, ymd } = require('../services/util');
const stock = require('../services/stock');
const settings = require('../services/settings');

const METHODS = ['TUNAI', 'DEBIT', 'QRIS', 'TRANSFER', 'KREDIT'];

async function loadSale(id, sid) {
  const s = await db.one(`SELECT s.*, u.name AS cashier, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, c.npwp AS customer_npwp, c.spp_to AS customer_spp_to
    FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ? AND s.store_id = ?`, [id, sid]);
  if (!s) return null;
  s.items = await db.query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [id]);
  s.payments = await db.query("SELECT * FROM payments WHERE ref_type = 'SALE' AND ref_id = ? ORDER BY id", [id]);
  s.outstanding = round2(s.status === 'VOID' ? 0 : Math.max(s.total - s.paid, 0));
  return s;
}

router.post('/', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw err(400, 'Keranjang kosong');
  if (items.length > 300) throw err(400, 'Terlalu banyak baris');
  const method = String(b.method || 'TUNAI').toUpperCase();
  if (!METHODS.includes(method)) throw err(400, 'Metode bayar tidak valid');
  const cfg = await settings.get(req.sid);
  const allowNeg = cfg.allow_negative_stock;

  const sale = await db.tx(async (t) => {
    // gabungkan baris & kunci dalam urutan id (hindari deadlock)
    const ids = [...new Set(items.map((i) => +i.product_id))].sort((a, c) => a - c);
    if (ids.some((x) => !x)) throw err(400, 'Barang tidak valid');
    const prods = new Map();
    for (const id of ids) {
      const p = await t.one('SELECT id, sku, name, unit, sell_price, wholesale_price, wholesale_min, buy_price, active FROM products WHERE id = ? AND store_id = ?', [id, req.sid]);
      if (!p) throw err(400, 'Barang tidak ditemukan');
      if (!p.active) throw err(400, `${p.name} nonaktif`);
      prods.set(id, p);
    }
    const lines = []; let subtotal = 0;
    for (const i of items) {
      const p = prods.get(+i.product_id);
      const qty = round3(num(i.qty));
      if (!(qty > 0)) throw err(400, `Qty ${p.name} harus > 0`);
      const price = (p.wholesale_min > 0 && p.wholesale_price > 0 && qty >= p.wholesale_min) ? p.wholesale_price : p.sell_price;
      const disc = round2(Math.max(num(i.discount), 0));
      const gross = round2(price * qty);
      if (disc > gross) throw err(400, `Diskon ${p.name} melebihi harga`);
      const total = round2(gross - disc);
      subtotal += total;
      lines.push({ p, qty, price, disc, total });
    }
    subtotal = round2(subtotal);
    const discount = round2(Math.max(num(b.discount), 0));
    if (discount > subtotal) throw err(400, 'Diskon melebihi subtotal');
    const base = round2(subtotal - discount);
    let tax = 0, total = base;
    if (cfg.tax_percent > 0) {
      if (cfg.tax_inclusive) tax = round2(base - base / (1 + cfg.tax_percent / 100));
      else { tax = round2(base * cfg.tax_percent / 100); total = round2(base + tax); }
    }
    let paid = round2(num(b.paid, total));
    let customer_id = b.customer_id ? +b.customer_id : null;
    let due = null;
    if (method === 'KREDIT') {
      if (!customer_id) throw err(400, 'Penjualan kredit wajib memilih pelanggan');
      paid = round2(Math.max(paid, 0));
      if (paid >= total) throw err(400, 'Untuk kredit, jumlah bayar harus kurang dari total');
      due = ymd(b.due_date);
      if (!due) { const d = new Date(); d.setDate(d.getDate() + (cfg.default_due_days || 14)); due = db.today(d); }
    } else {
      if (paid < total) throw err(400, 'Uang bayar kurang');
      if (method !== 'TUNAI') paid = total; // non tunai pas
    }
    if (customer_id && !(await t.one('SELECT id FROM customers WHERE id = ?', [customer_id]))) throw err(400, 'Pelanggan tidak ditemukan');
    const sale_no = await nextNo(t, req.sid, 'INV');
    const created_at = t.now();
    const id = await t.insert('sales', {
      store_id: req.sid, kind: 'POS', sale_no, created_at, user_id: req.user.id, customer_id, subtotal, discount, tax, total, paid,
      change_amount: method === 'TUNAI' ? round2(paid - total) : 0, method, due_date: due, status: 'DONE',
      note: b.note ? String(b.note).slice(0, 300) : null,
    });
    for (const l of lines.slice().sort((x, y) => x.p.id - y.p.id)) {
      // satu UPDATE per baris produk; baris ganda produk yang sama tetap aman
      await stock.move(t, { store_id: req.sid, product_id: l.p.id, qty: -l.qty, type: 'SALE', ref_type: 'SALE', ref_id: id, ref_no: sale_no, user_id: req.user.id, allowNegative: allowNeg });
    }
    for (const l of lines) {
      await t.insert('sale_items', { sale_id: id, product_id: l.p.id, sku: l.p.sku, name: l.p.name, unit: l.p.unit, qty: l.qty, price: l.price, cost: l.p.buy_price, discount: l.disc, total: l.total });
    }
    if (method === 'KREDIT' && paid > 0) await t.insert('payments', { ref_type: 'SALE', ref_id: id, created_at, amount: paid, method: 'TUNAI', note: 'Uang muka', user_id: req.user.id });
    return id;
  });
  res.status(201).json(await loadSale(sale, req.sid));
}));

router.get('/', auth, wrap(async (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const r = range(req.query);
  const w = ['s.store_id = ?', 's.created_at >= ?', 's.created_at < ?']; const p = [req.sid, r.f, r.t];
  if (req.query.kind) { w.push('s.kind = ?'); p.push(String(req.query.kind).toUpperCase()); }
  if (req.user.role !== 'owner') { w.push('s.user_id = ?'); p.push(req.user.id); }
  if (req.query.q) { w.push('(LOWER(s.sale_no) LIKE ? OR LOWER(c.name) LIKE ?)'); p.push(like(req.query.q), like(req.query.q)); }
  if (req.query.status) { w.push('s.status = ?'); p.push(req.query.status); }
  if (req.query.unpaid === '1') { w.push("s.status = 'DONE' AND s.paid < s.total"); }
  const from = `FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE ${w.join(' AND ')}`;
  const rows = await db.query(`SELECT s.id, s.sale_no, s.created_at, s.kind, s.contract_no, s.po_ref, s.total, s.paid, s.method, s.status, s.due_date, u.name AS cashier, c.name AS customer_name ${from} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  const agg = await db.one(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN s.status = 'DONE' THEN s.total ELSE 0 END), 0) AS sum ${from}`, p);
  res.json({ rows, total: agg.n, sum: agg.sum });
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const s = await loadSale(req.params.id, req.sid);
  if (!s) throw err(404, 'Transaksi tidak ditemukan');
  if (req.user.role !== 'owner' && s.user_id !== req.user.id) throw err(403, 'Tidak punya akses');
  res.json(s);
}));

// Batalkan transaksi (owner): stok dikembalikan
router.post('/:id/void', auth, owner, wrap(async (req, res) => {
  await db.tx(async (t) => {
    const s = await t.one('SELECT * FROM sales WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    if (!s) throw err(404, 'Transaksi tidak ditemukan');
    const flip = await t.exec("UPDATE sales SET status = 'VOID', void_at = ?, void_by = ? WHERE id = ? AND status = 'DONE'", [t.now(), req.user.id, s.id]);
    if (!flip.rowCount) throw err(409, 'Transaksi sudah dibatalkan');
    const items = await t.query('SELECT product_id, qty FROM sale_items WHERE sale_id = ? ORDER BY product_id', [s.id]);
    for (const i of items) await stock.move(t, { store_id: req.sid, product_id: i.product_id, qty: i.qty, type: 'SALE_VOID', ref_type: 'SALE', ref_id: s.id, ref_no: s.sale_no, note: req.body.reason || 'Batal transaksi', user_id: req.user.id, allowNegative: true });
  });
  res.json(await loadSale(req.params.id, req.sid));
}));

// Pelunasan piutang (owner)
router.post('/:id/payments', auth, owner, wrap(async (req, res) => {
  const amount = round2(num(req.body.amount));
  if (!(amount > 0)) throw err(400, 'Nominal tidak valid');
  await db.tx(async (t) => {
    const s = await t.one('SELECT id, total, paid, status FROM sales WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    if (!s || s.status !== 'DONE') throw err(409, 'Transaksi tidak valid');
    if (amount > round2(s.total - s.paid)) throw err(400, 'Nominal melebihi sisa tagihan');
    await t.exec('UPDATE sales SET paid = paid + ? WHERE id = ?', [amount, s.id]);
    await t.insert('payments', { ref_type: 'SALE', ref_id: s.id, created_at: t.now(), amount, method: String(req.body.method || 'TUNAI').toUpperCase().slice(0, 12), note: req.body.note ? String(req.body.note).slice(0, 300) : null, user_id: req.user.id });
  });
  res.json(await loadSale(req.params.id, req.sid));
}));
module.exports = router; module.exports.loadSale = loadSale;
