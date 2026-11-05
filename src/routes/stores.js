// Kelola toko (khusus owner). Toko tidak dihapus, hanya dinonaktifkan, supaya riwayat tetap utuh.
const router = require('express').Router();
const db = require('../db');
const settings = require('../services/settings');
const stores = require('../services/stores');
const { auth, owner } = require('../middleware/auth');
const { wrap, err } = require('../services/util');

router.use(auth, owner);
const codeOf = (v) => {
  const c = String(v || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(c)) throw err(400, 'Kode toko 1-8 karakter huruf/angka (contoh: AJS)');
  return c;
};
router.get('/', wrap(async (req, res) => {
  const rows = await db.query(`SELECT s.id, s.code, s.name, s.active, s.created_at,
    (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.active = 1) AS products,
    (SELECT COUNT(*) FROM sales x WHERE x.store_id = s.id) AS sales,
    (SELECT COUNT(*) FROM users u WHERE u.store_id = s.id AND u.active = 1) AS users
    FROM stores s ORDER BY s.id`);
  res.json({ rows });
}));
router.post('/', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 150);
  if (!name) throw err(400, 'Nama toko wajib diisi');
  const code = codeOf(req.body.code);
  const from = +req.body.copy_from || 0;
  const id = await db.tx(async (t) => {
    if (await t.one('SELECT id FROM stores WHERE code = ?', [code])) throw err(409, 'Kode toko sudah dipakai');
    const sid = await t.insert('stores', { code, name, active: 1, created_at: t.now() });
    await require('../services/catalog').fillAllStores(t); // toko baru langsung punya semua barang (stok 0)
    if (from) { // salin pengaturan (identitas, pajak, template, gambar) dari toko lain
      for (const r of await t.query('SELECT k, v FROM store_settings WHERE store_id = ?', [from])) await t.upsert('store_settings', { store_id: sid, k: r.k, v: r.v }, ['store_id', 'k']);
    }
    await t.upsert('store_settings', { store_id: sid, k: 'store_name', v: name }, ['store_id', 'k']);
    return sid;
  });
  stores.clear(); settings.clearCache();
  res.status(201).json({ id });
}));
router.put('/:id', wrap(async (req, res) => {
  const id = +req.params.id; const b = req.body; const d = {};
  if ('code' in b) d.code = codeOf(b.code);
  if ('name' in b) { d.name = String(b.name || '').trim().slice(0, 150); if (!d.name) throw err(400, 'Nama toko wajib diisi'); }
  if ('active' in b) d.active = b.active ? 1 : 0;
  const cur = await db.one('SELECT id FROM stores WHERE id = ?', [id]);
  if (!cur) throw err(404, 'Toko tidak ditemukan');
  if (d.active === 0 && (await db.one('SELECT COUNT(*) AS n FROM stores WHERE active = 1 AND id <> ?', [id])).n === 0) throw err(400, 'Minimal satu toko harus aktif');
  if (d.code && await db.one('SELECT id FROM stores WHERE code = ? AND id <> ?', [d.code, id])) throw err(409, 'Kode toko sudah dipakai');
  const k = Object.keys(d);
  if (!k.length) throw err(400, 'Tidak ada data');
  await db.exec(`UPDATE stores SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => d[c]), id]);
  if (d.name) await db.upsert('store_settings', { store_id: id, k: 'store_name', v: d.name }, ['store_id', 'k']);
  stores.clear(); settings.clearCache();
  res.json({ ok: true });
}));
module.exports = router;
