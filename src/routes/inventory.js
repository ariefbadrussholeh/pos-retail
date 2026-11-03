const express = require('express');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, like, nextNo, range, page, ymd } = require('../services/util');
const stock = require('../services/stock');

const opnames = express.Router();
const stockR = express.Router();
opnames.use(auth, owner);
stockR.use(auth, owner);

// Lembar hitung: daftar barang + stok sistem saat ini
opnames.get('/sheet', wrap(async (req, res) => {
  const w = ['p.active = 1', 'p.store_id = ?']; const p = [req.sid];
  if (req.query.category_id) { w.push('p.category_id = ?'); p.push(req.query.category_id); }
  if (req.query.q) { w.push('(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(p.barcode) LIKE ?)'); const l = like(req.query.q); p.push(l, l, l); }
  res.json(await db.query(`SELECT p.id, p.sku, p.barcode, p.name, p.unit, p.stock, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${w.join(' AND ')} ORDER BY c.name, p.name`, p));
}));

opnames.get('/', wrap(async (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const rows = await db.query(`SELECT o.id, o.opname_no, o.date, o.note, u.name AS user_name,
      (SELECT COUNT(*) FROM opname_items i WHERE i.opname_id = o.id) AS items,
      (SELECT COALESCE(SUM(i.diff * i.cost), 0) FROM opname_items i WHERE i.opname_id = o.id) AS diff_value
    FROM opnames o LEFT JOIN users u ON u.id = o.user_id WHERE o.store_id = ? ORDER BY o.id DESC LIMIT ? OFFSET ?`, [req.sid, limit, offset]);
  res.json({ rows, total: (await db.one('SELECT COUNT(*) AS n FROM opnames WHERE store_id = ?', [req.sid])).n });
}));
opnames.get('/:id', wrap(async (req, res) => {
  const o = await db.one('SELECT o.*, u.name AS user_name FROM opnames o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? AND o.store_id = ?', [req.params.id, req.sid]);
  if (!o) throw err(404, 'Opname tidak ditemukan');
  o.items = await db.query('SELECT * FROM opname_items WHERE opname_id = ? ORDER BY id', [o.id]);
  res.json(o);
}));

// Simpan = langsung berlaku (tanpa approval). Selisih dihitung terhadap stok saat disimpan.
opnames.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const items = (Array.isArray(b.items) ? b.items : []).filter((i) => i.counted !== '' && i.counted != null);
  if (!items.length) throw err(400, 'Isi minimal satu hasil hitung');
  const seen = new Set();
  for (const i of items) { if (seen.has(+i.product_id)) throw err(400, 'Barang dobel dalam satu opname'); seen.add(+i.product_id); }
  const id = await db.tx(async (t) => {
    const date = ymd(b.date) || t.today();
    const no = await nextNo(t, req.sid, 'OP', date);
    const oid = await t.insert('opnames', { store_id: req.sid, opname_no: no, created_at: t.now(), date, note: b.note ? String(b.note).slice(0, 300) : null, user_id: req.user.id });
    for (const i of items.sort((a, c) => a.product_id - c.product_id)) {
      const counted = round3(num(i.counted, NaN));
      if (!(counted >= 0)) throw err(400, 'Hasil hitung tidak valid');
      const p = await t.one('SELECT id, name, unit, stock, buy_price FROM products WHERE id = ? AND store_id = ?', [+i.product_id, req.sid]);
      if (!p) throw err(400, 'Barang tidak ditemukan');
      const diff = round3(counted - p.stock);
      await t.insert('opname_items', { opname_id: oid, product_id: p.id, name: p.name, unit: p.unit, system_qty: p.stock, counted_qty: counted, diff, cost: p.buy_price });
      if (diff !== 0) await stock.move(t, { store_id: req.sid, product_id: p.id, qty: diff, type: 'OPNAME', ref_type: 'OPNAME', ref_id: oid, ref_no: no, note: b.note || null, user_id: req.user.id, allowNegative: true });
    }
    return oid;
  });
  res.status(201).json(await db.one('SELECT * FROM opnames WHERE id = ?', [id]));
}));

// ---------- Stok ----------
stockR.get('/card', wrap(async (req, res) => {
  const pid = +req.query.product_id;
  if (!pid) throw err(400, 'Pilih barang');
  const r = range(req.query);
  const product = await db.one('SELECT id, sku, name, unit, stock FROM products WHERE id = ? AND store_id = ?', [pid, req.sid]);
  if (!product) throw err(404, 'Barang tidak ditemukan');
  const opening = await db.one('SELECT balance FROM stock_moves WHERE product_id = ? AND created_at < ? ORDER BY id DESC LIMIT 1', [pid, r.f]);
  const rows = await db.query('SELECT m.*, u.name AS user_name FROM stock_moves m LEFT JOIN users u ON u.id = m.user_id WHERE m.product_id = ? AND m.created_at >= ? AND m.created_at < ? ORDER BY m.id', [pid, r.f, r.t]);
  res.json({ product, opening: opening ? opening.balance : 0, rows });
}));
// Penyesuaian cepat (rusak/hilang/dll)
stockR.post('/adjust', wrap(async (req, res) => {
  const qty = round3(num(req.body.qty));
  if (!qty) throw err(400, 'Qty tidak boleh 0');
  if (!req.body.note) throw err(400, 'Alasan wajib diisi');
  const bal = await db.tx((t) => stock.move(t, { store_id: req.sid, product_id: +req.body.product_id, qty, type: 'ADJUST', note: req.body.note, user_id: req.user.id, allowNegative: true }));
  res.json({ balance: bal });
}));
module.exports = { opnames, stock: stockR };
