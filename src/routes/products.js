const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, like, page, round2, round3 } = require('../services/util');
const stock = require('../services/stock');
const barcode = require('../services/barcode');
const settings = require('../services/settings');
const catalog = require('../services/catalog');
const ExcelJS = require('exceljs');

const COLS = 'p.id, p.sku, p.barcode, p.name, p.category_id, c.name AS category, p.unit, p.item_id, p.buy_price, p.sell_price, p.price_ekatalog, p.price_sp, p.price_langsung, p.wholesale_price, p.wholesale_min, p.min_stock, p.stock, p.active, p.no_ppn, p.no_pph';
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
    const rows = await t.query("SELECT item_id FROM products WHERE store_id = ? AND active = 1 AND (barcode IS NULL OR barcode = '') ORDER BY id", [req.sid]);
    for (const r of rows) await t.exec('UPDATE products SET barcode = ? WHERE item_id = ?', [await barcode.next(t), r.item_id]);
    return rows.length;
  });
  res.json({ filled: n });
}));

// Ekspor Excel daftar harga: harga dasar, harga e-katalog, harga SP, dan harga langsung (apa adanya dari master barang toko aktif)
router.get('/export/harga', auth, owner, wrap(async (req, res) => {
  const rows = await db.query('SELECT sku, name, unit, buy_price, price_ekatalog, price_sp, price_langsung FROM products WHERE store_id = ? AND active = 1 ORDER BY name', [req.sid]);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Harga Barang');
  ws.getCell('A1').value = 'Daftar harga barang - ' + (req.store ? req.store.name : ''); ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Per tanggal ' + db.today(); ws.getCell('A2').font = { color: { argb: 'FF787774' } };
  const head = ['No', 'SKU', 'Nama Barang', 'Satuan', 'Harga Dasar', 'Harga E-Katalog', 'Harga SP', 'Harga Langsung'];
  const hr = ws.getRow(4); head.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = { bottom: { style: 'thin' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
  rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    [i + 1, r.sku, r.name, r.unit, r.buy_price, r.price_ekatalog, r.price_sp, r.price_langsung].forEach((v, k) => { const c = row.getCell(k + 1); c.value = k >= 4 ? Number(v) : v; if (k >= 4) c.numFmt = '#,##0'; });
  });
  [6, 14, 40, 9, 14, 18, 14, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }];
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="daftar-harga_${db.today()}.xlsx"`);
  await wb.xlsx.write(res); res.end();
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
  for (const k of ['buy_price', 'sell_price', 'price_ekatalog', 'price_sp', 'price_langsung', 'wholesale_price']) if (k in b) { d[k] = round2(num(b[k])); if (d[k] < 0) throw err(400, 'Harga tidak boleh negatif'); }
  for (const k of ['wholesale_min', 'min_stock']) if (k in b) d[k] = round3(Math.max(num(b[k]), 0));
  if ('active' in b) d.active = b.active ? 1 : 0;
  for (const k of ['no_ppn', 'no_pph']) if (k in b) d[k] = b[k] ? 1 : 0;
  if (creating) {
    if (!d.name) throw err(400, 'Nama barang wajib diisi');
    if (!d.unit) d.unit = 'pcs';
  }
  if ('name' in d && !d.name) throw err(400, 'Nama barang wajib diisi');
  return d;
}

// SKU otomatis berurutan (global, SKU milik bersama); lewati yang sudah dipakai
async function autoSku(t) {
  for (let i = 0; i < 200; i++) {
    const sku = 'B' + String(await t.nextCounter('SKU')).padStart(6, '0');
    if (!(await t.one('SELECT id FROM products WHERE sku = ? OR barcode = ?', [sku, sku]))) return sku;
  }
  throw err(500, 'Gagal membuat SKU');
}
// SKU & barcode unik di seluruh toko (kecuali barang itu sendiri)
async function checkBarcode(t, code, exceptItem) {
  if (!code) return;
  const x = await t.one('SELECT id, name FROM products WHERE (barcode = ? OR sku = ?) AND item_id <> ?', [code, code, exceptItem || 0]);
  if (x) throw err(409, `Barcode sudah dipakai: ${x.name}`);
}
async function checkCategory(t, id) {
  if (id && !(await t.one('SELECT id FROM categories WHERE id = ?', [id]))) throw err(400, 'Kategori tidak ditemukan');
}
router.post('/', auth, owner, wrap(async (req, res) => {
  const d = clean(req.body, true);
  const opening = round3(num(req.body.stock));
  const cfg = await settings.get(req.sid);
  const id = await db.tx(async (t) => {
    if (!d.sku) d.sku = await autoSku(t);
    if (!d.barcode && cfg.auto_barcode) d.barcode = await barcode.next(t);
    await checkBarcode(t, d.barcode, 0);
    await checkBarcode(t, d.sku, 0);
    await checkCategory(t, d.category_id);
    d.store_id = req.sid; d.created_at = t.now(); d.stock = 0;
    const pid = await t.insert('products', d);
    await t.exec('UPDATE products SET item_id = id WHERE id = ?', [pid]);
    await catalog.fillAllStores(t); // baris untuk toko lain (stok 0)
    if (opening) await stock.move(t, { store_id: req.sid, product_id: pid, qty: opening, type: 'OPENING', note: 'Stok awal', user_id: req.user.id, allowNegative: true });
    return pid;
  });
  res.status(201).json(await db.one(`SELECT ${COLS} ${FROM} WHERE p.id = ?`, [id]));
}));

router.put('/:id', auth, owner, wrap(async (req, res) => {
  const d = clean(req.body, false);
  delete d.stock;
  const { shared, store } = catalog.split(d);
  await db.tx(async (t) => {
    const cur = await t.one('SELECT id, item_id FROM products WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    if (!cur) throw err(404, 'Barang tidak ditemukan');
    if (shared.barcode) await checkBarcode(t, shared.barcode, cur.item_id);
    if (shared.sku) await checkBarcode(t, shared.sku, cur.item_id);
    await checkCategory(t, shared.category_id);
    let k = Object.keys(shared);
    if (k.length) await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE item_id = ?`, [...k.map((c) => shared[c]), cur.item_id]);
    k = Object.keys(store);
    if (k.length) await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => store[c]), cur.id]);
  });
  res.json(await db.one(`SELECT ${COLS} ${FROM} WHERE p.id = ? AND p.store_id = ?`, [req.params.id, req.sid]));
}));

// Hapus permanen hanya jika belum punya riwayat di toko mana pun; selain itu dinonaktifkan (semua toko)
router.delete('/:id', auth, owner, wrap(async (req, res) => {
  const cur = await db.one('SELECT id, item_id FROM products WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
  if (!cur) throw err(404, 'Barang tidak ditemukan');
  const q = (tb) => db.one(`SELECT COUNT(*) AS n FROM ${tb} x JOIN products p ON p.id = x.product_id WHERE p.item_id = ?`, [cur.item_id]);
  const used = (await q('stock_moves')).n + (await q('sale_items')).n + (await q('purchase_items')).n;
  if (used) {
    await db.exec('UPDATE products SET active = 0 WHERE item_id = ?', [cur.item_id]);
    return res.json({ ok: true, deactivated: true });
  }
  await db.exec('DELETE FROM products WHERE item_id = ?', [cur.item_id]);
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
    const cats = new Map((await t.query('SELECT id, name FROM categories')).map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const b = { ...r };
        if (r.category) {
          const key = String(r.category).trim().toLowerCase();
          if (key) { if (!cats.has(key)) cats.set(key, await t.insert('categories', { name: String(r.category).trim() })); b.category_id = cats.get(key); }
        }
        const d = clean(b, true);
        const conds = []; const cp = [];
        if (d.sku) { conds.push('sku = ?'); cp.push(d.sku); }
        if (d.barcode) { conds.push('barcode = ?'); cp.push(d.barcode); }
        const ex = conds.length ? await t.one(`SELECT id, item_id FROM products WHERE store_id = ? AND (${conds.join(' OR ')})`, [req.sid, ...cp]) : null;
        if (ex) {
          const { shared, store } = catalog.split(d);
          let k = Object.keys(shared);
          if (k.length) await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE item_id = ?`, [...k.map((c) => shared[c]), ex.item_id]);
          k = Object.keys(store);
          if (k.length) await t.exec(`UPDATE products SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => store[c]), ex.id]);
          result.updated++;
        } else {
          if (!d.sku) d.sku = await autoSku(t);
          if (!d.barcode && cfg.auto_barcode) d.barcode = await barcode.next(t);
          await checkBarcode(t, d.sku, 0); await checkBarcode(t, d.barcode, 0);
          d.store_id = req.sid; d.created_at = t.now(); d.stock = 0;
          const pid = await t.insert('products', d);
          await t.exec('UPDATE products SET item_id = id WHERE id = ?', [pid]);
          const opening = round3(num(r.stock));
          if (opening) await stock.move(t, { store_id: req.sid, product_id: pid, qty: opening, type: 'OPENING', note: 'Stok awal (impor)', user_id: req.user.id, allowNegative: true });
          result.created++;
        }
      } catch (e) { result.errors.push({ row: i + 1, error: e.message }); }
    }
    if (result.errors.length) throw Object.assign(new Error('Impor dibatalkan'), { status: 422, details: result });
    await catalog.fillAllStores(t);
  });
  res.json(result);
}));
module.exports = router;
