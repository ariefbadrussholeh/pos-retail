const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, like, page, round2, round3 } = require('../services/util');
const stock = require('../services/stock');
const barcode = require('../services/barcode');
const settings = require('../services/settings');

const COLS = 'p.id, p.sku, p.barcode, p.name, p.category_id, c.name AS category, p.unit, p.buy_price, p.sell_price, p.wholesale_price, p.wholesale_min, p.min_stock, p.stock, p.active';
const FROM = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id';

// Katalog ringkas untuk layar kasir (difilter di browser agar pencarian instan)
router.get('/catalog', auth, wrap(async (req, res) => {
  const rows = await db.query(`SELECT p.id, p.sku, p.barcode, p.name, p.unit, p.sell_price AS price, p.wholesale_price AS wprice, p.wholesale_min AS wmin, p.stock, c.name AS category
    ${FROM} WHERE p.active = 1 AND p.store_id = ? ORDER BY p.name`, [req.sid]);
  res.json(rows);
}));

router.get('/', auth, wrap(async (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const w = ['p.store_id = ?']; const p = [req.sid];
  if (req.query.q) { const l = like(req.query.q); w.push('(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(p.barcode) LIKE ?)'); p.push(l, l, l); }
  if (req.query.category_id) { w.push('p.category_id = ?'); p.push(req.query.category_id); }
  if (req.query.active === '1') w.push('p.active = 1');
  if (req.query.low === '1') w.push('p.stock <= p.min_stock');
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const rows = await db.query(`SELECT ${COLS} ${FROM}${where} ORDER BY p.name LIMIT ? OFFSET ?`, [...p, limit, offset]);
  const total = (await db.one(`SELECT COUNT(*) AS n ${FROM}${where}`, p)).n;
  res.json({ rows, total });
}));

// Buat satu barcode EAN-13 baru (untuk tombol "Buat otomatis" di form barang)
router.post('/barcode/next', auth, owner, wrap(async (req, res) => {
  res.json({ barcode: await db.tx((t) => barcode.next(t)) });
}));
// Beri barcode otomatis ke semua barang aktif yang belum punya
router.post('/barcode/fill', auth, owner, wrap(async (req, res) => {
  const n = await db.tx(async (t) => {
    const rows = await t.query("SELECT id FROM products WHERE store_id = ? AND active = 1 AND (barcode IS NULL OR barcode = '') ORDER BY id", [req.sid]);
    for (const r of rows) await t.exec('UPDATE products SET barcode = ? WHERE id = ?', [await barcode.next(t), r.id]);
    return rows.length;
  });
  res.json({ filled: n });
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const row = await db.one(`SELECT ${COLS} ${FROM} WHERE p.id = ? AND p.store_id = ?`, [req.params.id, req.sid]);
  if (!row) throw err(404, 'Barang tidak ditemukan');
  res.json(row);
}));

function clean(b, creating) {
  const d = {};
  const str = (k, max) => { if (k in b) d[k] = b[k] == null || b[k] === '' ? null : String(b[k]).trim().slice(0, max); };
  str('sku', 50); str('barcode', 60); str('name', 200); str('unit', 20);
  if ('category_id' in b) d.category_id = b.category_id || null;
  for (const k of ['buy_price', 'sell_price', 'wholesale_price']) if (k in b) { d[k] = round2(num(b[k])); if (d[k] < 0) throw err(400, 'Harga tidak boleh negatif'); }
  for (const k of ['wholesale_min', 'min_stock']) if (k in b) d[k] = round3(Math.max(num(b[k]), 0));
  if ('active' in b) d.active = b.active ? 1 : 0;
  if (creating) {
    if (!d.name) throw err(400, 'Nama barang wajib diisi');
    if (!d.unit) d.unit = 'pcs';
  }
  if ('name' in d && !d.name) throw err(400, 'Nama barang wajib diisi');
  return d;
}

async function autoSku(t, sid) {
  const n = await t.nextCounter(`${sid}:SKU`);
  return 'B' + String(n).padStart(6, '0');
}
async function checkBarcode(t, sid, barcode, exceptId) {
  if (!barcode) return;
  const x = await t.one('SELECT id, name FROM products WHERE store_id = ? AND (barcode = ? OR sku = ?) AND id <> ?', [sid, barcode, barcode, exceptId || 0]);
  if (x) throw err(409, `Barcode sudah dipakai: ${x.name}`);
}

router.post('/', auth, owner, wrap(async (req, res) => {
  const d = clean(req.body, true);
  const opening = round3(num(req.body.stock));
  const cfg = await settings.get(req.sid);
  const id = await db.tx(async (t) => {
    if (!d.sku) d.sku = await autoSku(t, req.sid);
    if (!d.barcode && cfg.auto_barcode) d.barcode = await barcode.next(t);
    await checkBarcode(t, req.sid, d.barcode, 0);
    await checkBarcode(t, req.sid, d.sku, 0);
    if (d.category_id && !(await t.one('SELECT id FROM categories WHERE id = ? AND store_id = ?', [d.category_id, req.sid]))) throw err(400, 'Kategori tidak ditemukan');
    d.store_id = req.sid;
    d.created_at = t.now();
    d.stock = 0;
    const pid = await t.insert('products', d);
    if (opening) await stock.move(t, { store_id: req.sid, product_id: pid, qty: opening, type: 'OPENING', note: 'Stok awal', user_id: req.user.id, allowNegative: true });
    return pid;
  });
  res.status(201).json(await db.one(`SELECT ${COLS} ${FROM} WHERE p.id = ?`, [id]));
}));

router.put('/:id', auth, owner, wrap(async (req, res) => {
  const d = clean(req.body, false);
  delete d.stock;
  await db.tx(async (t) => {
    if (d.barcode) await checkBarcode(t, req.sid, d.barcode, +req.params.id);
    if (d.sku) await checkBarcode(t, req.sid, d.sku, +req.params.id);
    if (d.category_id && !(await t.one('SELECT id FROM categories WHERE id = ? AND store_id = ?', [d.category_id, req.sid]))) throw err(400, 'Kategori tidak ditemukan');
    const k = Object.keys(d);
    if (k.length) await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ? AND store_id = ?`, [...k.map((c) => d[c]), req.params.id, req.sid]);
  });
  const row = await db.one(`SELECT ${COLS} ${FROM} WHERE p.id = ? AND p.store_id = ?`, [req.params.id, req.sid]);
  if (!row) throw err(404, 'Barang tidak ditemukan');
  res.json(row);
}));

// Hapus permanen hanya jika belum punya riwayat; selain itu dinonaktifkan
router.delete('/:id', auth, owner, wrap(async (req, res) => {
  const used = await db.one('SELECT COUNT(*) AS n FROM stock_moves m JOIN products p ON p.id = m.product_id WHERE m.product_id = ? AND p.store_id = ?', [req.params.id, req.sid]);
  if (used.n) {
    await db.exec('UPDATE products SET active = 0 WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    return res.json({ ok: true, deactivated: true });
  }
  await db.exec('DELETE FROM products WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
  res.json({ ok: true });
}));

// Impor massal (baris sudah di-parse dari CSV di browser). Update jika SKU/barcode cocok.
router.post('/import', auth, owner, wrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw err(400, 'Tidak ada baris');
  if (rows.length > 5000) throw err(400, 'Maksimal 5000 baris per impor');
  const result = { created: 0, updated: 0, errors: [] };
  const cfg = await settings.get(req.sid);
  await db.tx(async (t) => {
    const cats = new Map((await t.query('SELECT id, name FROM categories WHERE store_id = ?', [req.sid])).map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const b = { ...r };
        if (r.category) {
          const key = String(r.category).trim().toLowerCase();
          if (key) { if (!cats.has(key)) cats.set(key, await t.insert('categories', { store_id: req.sid, name: String(r.category).trim() })); b.category_id = cats.get(key); }
        }
        const d = clean(b, true);
        const conds = []; const cp = [];
        if (d.sku) { conds.push('sku = ?'); cp.push(d.sku); }
        if (d.barcode) { conds.push('barcode = ?'); cp.push(d.barcode); }
        const ex = conds.length ? await t.one(`SELECT id FROM products WHERE store_id = ? AND (${conds.join(' OR ')})`, [req.sid, ...cp]) : null;
        if (ex) {
          const k = Object.keys(d);
          await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => d[c]), ex.id]);
          result.updated++;
        } else {
          if (!d.sku) d.sku = await autoSku(t, req.sid);
          if (!d.barcode && cfg.auto_barcode) d.barcode = await barcode.next(t);
          d.store_id = req.sid; d.created_at = t.now(); d.stock = 0;
          const pid = await t.insert('products', d);
          const opening = round3(num(r.stock));
          if (opening) await stock.move(t, { store_id: req.sid, product_id: pid, qty: opening, type: 'OPENING', note: 'Stok awal (impor)', user_id: req.user.id, allowNegative: true });
          result.created++;
        }
      } catch (e) { result.errors.push({ row: i + 1, error: e.message }); }
    }
    if (result.errors.length) throw Object.assign(new Error('Impor dibatalkan'), { status: 422, details: result });
  });
  res.json(result);
}));
module.exports = router;
