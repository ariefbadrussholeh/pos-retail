const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, like, page } = require('../services/util');

function crud(table, fields, o = {}) {
  const r = express.Router();
  const pick = (b) => {
    const d = {};
    for (const f of fields) if (f in b) d[f] = b[f] === '' ? null : b[f];
    return d;
  };
  const need = (d, creating) => {
    for (const f of o.required || []) if ((creating || f in d) && (d[f] == null || String(d[f]).trim() === '')) throw err(400, `${f} wajib diisi`);
  };
  r.get('/', auth, wrap(async (req, res) => {
    const { limit, offset } = page(req.query, 200);
    const w = []; const p = [];
    if (req.query.q && o.search) { w.push('(' + o.search.map((c) => `LOWER(${c}) LIKE ?`).join(' OR ') + ')'); o.search.forEach(() => p.push(like(req.query.q))); }
    if (req.query.active === '1' && o.hasActive) w.push('active = 1');
    const sql = `FROM ${table}${w.length ? ' WHERE ' + w.join(' AND ') : ''}`;
    const rows = await db.query(`SELECT * ${sql} ORDER BY ${o.order || 'name'} LIMIT ? OFFSET ?`, [...p, limit, offset]);
    const total = (await db.one(`SELECT COUNT(*) AS n ${sql}`, p)).n;
    res.json({ rows, total });
  }));
  r.get('/:id', auth, wrap(async (req, res) => {
    const row = await db.one(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!row) throw err(404, 'Data tidak ditemukan');
    res.json(row);
  }));
  r.post('/', auth, o.createRole || owner, wrap(async (req, res) => {
    const d = pick(req.body); need(d, true);
    const id = await db.insert(table, d);
    res.status(201).json(await db.one(`SELECT * FROM ${table} WHERE id = ?`, [id]));
  }));
  r.put('/:id', auth, owner, wrap(async (req, res) => {
    const d = pick(req.body); need(d, false);
    const k = Object.keys(d);
    if (!k.length) throw err(400, 'Tidak ada data');
    const x = await db.exec(`UPDATE ${table} SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => d[c]), req.params.id]);
    if (!x.rowCount && !(await db.one(`SELECT id FROM ${table} WHERE id = ?`, [req.params.id]))) throw err(404, 'Data tidak ditemukan');
    res.json(await db.one(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]));
  }));
  r.delete('/:id', auth, owner, wrap(async (req, res) => {
    await db.exec(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  }));
  return r;
}
const { role } = require('../middleware/auth');
const categories = crud('categories', ['name'], { required: ['name'] });
const suppliers = crud('suppliers', ['name', 'contact', 'phone', 'email', 'address', 'npwp', 'note', 'active'], { required: ['name'], search: ['name', 'phone', 'contact'], hasActive: true });
const customers = crud('customers', ['name', 'phone', 'email', 'address', 'npwp', 'note', 'active'], { required: ['name'], search: ['name', 'phone'], hasActive: true, createRole: role('owner', 'kasir') });

// Pengguna (khusus owner)
const users = express.Router();
users.use(auth, owner);
users.get('/', wrap(async (req, res) => res.json({ rows: await db.query('SELECT id, username, name, role, active, created_at FROM users ORDER BY username') })));
users.post('/', wrap(async (req, res) => {
  const { username, name, role: rl, password } = req.body;
  if (!username || !name || !password) throw err(400, 'Username, nama, dan password wajib diisi');
  if (String(password).length < 6) throw err(400, 'Password minimal 6 karakter');
  if (!['owner', 'kasir'].includes(rl)) throw err(400, 'Role harus owner atau kasir');
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) throw err(400, 'Username 3-50 karakter (huruf, angka, . _ -)');
  const id = await db.insert('users', { username: username.toLowerCase(), name, role: rl, password_hash: bcrypt.hashSync(String(password), 10), active: 1, created_at: db.now() });
  res.status(201).json({ id });
}));
users.put('/:id', wrap(async (req, res) => {
  const id = +req.params.id; const b = req.body; const d = {};
  if ('name' in b) d.name = b.name;
  if ('role' in b) { if (!['owner', 'kasir'].includes(b.role)) throw err(400, 'Role tidak valid'); d.role = b.role; }
  if ('active' in b) d.active = b.active ? 1 : 0;
  if (b.password) { if (String(b.password).length < 6) throw err(400, 'Password minimal 6 karakter'); d.password_hash = bcrypt.hashSync(String(b.password), 10); }
  if (id === req.user.id && (d.active === 0 || (d.role && d.role !== 'owner'))) throw err(400, 'Tidak bisa menonaktifkan/menurunkan akun sendiri');
  const k = Object.keys(d);
  if (!k.length) throw err(400, 'Tidak ada data');
  await db.exec(`UPDATE users SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => d[c]), id]);
  res.json({ ok: true });
}));
module.exports = { categories, suppliers, customers, users };
