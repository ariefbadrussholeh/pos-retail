const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, like, page } = require('../services/util');

// o.shared = milik bersama semua toko (tanpa store_id)
function crud(table, fields, o = {}) {
  const r = express.Router();
  const sc = o.shared ? { where: '', and: '', args: (a) => a } : { where: ' AND store_id = ?', and: 'store_id = ?', args: (a, sid) => [...a, sid] };
  const pick = (b) => {
    const d = {};
    for (const f of fields) if (f in b) d[f] = b[f] === '' ? null : (typeof b[f] === 'boolean' ? (b[f] ? 1 : 0) : b[f]); // centang -> 1/0 (kolom SMALLINT di Postgres)
    return d;
  };
  const need = (d, creating) => {
    for (const f of o.required || []) if ((creating || f in d) && (d[f] == null || String(d[f]).trim() === '')) throw err(400, `${f} wajib diisi`);
  };
  r.get('/', auth, wrap(async (req, res) => {
    const { limit, offset } = page(req.query, 200);
    const w = o.shared ? [] : ['store_id = ?']; const p = o.shared ? [] : [req.sid];
    if (req.query.q && o.search) { w.push('(' + o.search.map((c) => `LOWER(${c}) LIKE ?`).join(' OR ') + ')'); o.search.forEach(() => p.push(like(req.query.q))); }
    if (req.query.active === '1' && o.hasActive) w.push('active = 1');
    const sql = `FROM ${table}${w.length ? ' WHERE ' + w.join(' AND ') : ''}`;
    const rows = await db.query(`SELECT * ${sql} ORDER BY ${o.order || 'name'} LIMIT ? OFFSET ?`, [...p, limit, offset]);
    const total = (await db.one(`SELECT COUNT(*) AS n ${sql}`, p)).n;
    res.json({ rows, total });
  }));
  r.get('/:id', auth, wrap(async (req, res) => {
    const row = await db.one(`SELECT * FROM ${table} WHERE id = ?${sc.where}`, sc.args([req.params.id], req.sid));
    if (!row) throw err(404, 'Data tidak ditemukan');
    res.json(row);
  }));
  r.post('/', auth, o.createRole || owner, wrap(async (req, res) => {
    const d = pick(req.body); need(d, true); if (!o.shared) d.store_id = req.sid;
    const id = await db.insert(table, d);
    res.status(201).json(await db.one(`SELECT * FROM ${table} WHERE id = ?`, [id]));
  }));
  r.put('/:id', auth, owner, wrap(async (req, res) => {
    const d = pick(req.body); need(d, false);
    const k = Object.keys(d);
    if (!k.length) throw err(400, 'Tidak ada data');
    const x = await db.exec(`UPDATE ${table} SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?${sc.where}`, sc.args([...k.map((c) => d[c]), req.params.id], req.sid));
    if (!x.rowCount && !(await db.one(`SELECT id FROM ${table} WHERE id = ?${sc.where}`, sc.args([req.params.id], req.sid)))) throw err(404, 'Data tidak ditemukan');
    res.json(await db.one(`SELECT * FROM ${table} WHERE id = ?${sc.where}`, sc.args([req.params.id], req.sid)));
  }));
  r.delete('/:id', auth, owner, wrap(async (req, res) => {
    if (o.beforeDelete) await o.beforeDelete(req.params.id);
    await db.exec(`DELETE FROM ${table} WHERE id = ?${sc.where}`, sc.args([req.params.id], req.sid));
    res.json({ ok: true });
  }));
  return r;
}
const { role } = require('../middleware/auth');
const categories = crud('categories', ['name'], { required: ['name'] });
// Pelanggan, pemasok, dan jenis dokumen milik bersama semua toko; barang & kategori per toko.
const suppliers = crud('suppliers', ['name', 'contact', 'phone', 'email', 'address', 'npwp', 'note', 'active'], { required: ['name'], search: ['name', 'phone', 'contact'], hasActive: true, shared: true });
const customers = crud('customers', ['name', 'phone', 'email', 'address', 'spp_to', 'npwp', 'note', 'active'], { required: ['name'], search: ['name', 'phone'], hasActive: true, shared: true, createRole: role('owner', 'kasir') });
const docTypes = crud('doc_types', ['name', 'active'], { required: ['name'], search: ['name'], hasActive: true, shared: true, order: 'id',
  beforeDelete: async (id) => { if (await db.one('SELECT id FROM sale_docs WHERE type_id = ?', [id])) throw err(409, 'Jenis dokumen sudah dipakai, nonaktifkan saja'); } });

// Pengguna (khusus owner)
const users = express.Router();
users.use(auth, owner);
users.get('/', wrap(async (req, res) => res.json({ rows: await db.query('SELECT u.id, u.username, u.name, u.role, u.active, u.store_id, s.name AS store_name, u.created_at FROM users u LEFT JOIN stores s ON s.id = u.store_id ORDER BY u.username') })));
async function checkStore(rl, sid) {
  if (rl === 'owner') return null; // owner bisa mengakses semua toko
  if (!sid || !(await db.one('SELECT id FROM stores WHERE id = ?', [+sid]))) throw err(400, 'Pilih toko untuk kasir');
  return +sid;
}
users.post('/', wrap(async (req, res) => {
  const { username, name, role: rl, password } = req.body;
  if (!username || !name || !password) throw err(400, 'Username, nama, dan password wajib diisi');
  if (String(password).length < 6) throw err(400, 'Password minimal 6 karakter');
  if (!['owner', 'kasir'].includes(rl)) throw err(400, 'Role harus owner atau kasir');
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) throw err(400, 'Username 3-50 karakter (huruf, angka, . _ -)');
  const store_id = await checkStore(rl, req.body.store_id);
  const id = await db.insert('users', { username: username.toLowerCase(), name, role: rl, store_id, password_hash: bcrypt.hashSync(String(password), 10), active: 1, created_at: db.now() });
  res.status(201).json({ id });
}));
users.put('/:id', wrap(async (req, res) => {
  const id = +req.params.id; const b = req.body; const d = {};
  if ('name' in b) d.name = b.name;
  if ('role' in b) { if (!['owner', 'kasir'].includes(b.role)) throw err(400, 'Role tidak valid'); d.role = b.role; }
  if ('active' in b) d.active = b.active ? 1 : 0;
  if ('role' in b || 'store_id' in b) {
    const cur = await db.one('SELECT role, store_id FROM users WHERE id = ?', [id]);
    if (!cur) throw err(404, 'Pengguna tidak ditemukan');
    d.store_id = await checkStore(d.role || cur.role, 'store_id' in b ? b.store_id : cur.store_id);
  }
  if (b.password) { if (String(b.password).length < 6) throw err(400, 'Password minimal 6 karakter'); d.password_hash = bcrypt.hashSync(String(b.password), 10); }
  if (id === req.user.id && (d.active === 0 || (d.role && d.role !== 'owner'))) throw err(400, 'Tidak bisa menonaktifkan/menurunkan akun sendiri');
  const k = Object.keys(d);
  if (!k.length) throw err(400, 'Tidak ada data');
  await db.exec(`UPDATE users SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => d[c]), id]);
  res.json({ ok: true });
}));
module.exports = { categories, suppliers, customers, docTypes, users };
