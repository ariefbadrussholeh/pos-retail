const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, sign, setCookie, COOKIE } = require('../middleware/auth');
const { wrap, err } = require('../services/util');

const fails = new Map(); // ip+user -> {n, until}
router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const key = req.ip + '|' + username;
  const f = fails.get(key);
  if (f && f.n >= 5 && f.until > Date.now()) throw err(429, 'Terlalu banyak percobaan, coba lagi beberapa menit');
  const u = await db.one('SELECT * FROM users WHERE LOWER(username) = ?', [username]);
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 5 * 60000 });
    throw err(401, 'Username atau password salah');
  }
  fails.delete(key);
  setCookie(res, sign(u));
  res.json({ id: u.id, username: u.username, name: u.name, role: u.role });
}));
router.post('/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
router.get('/me', auth, (req, res) => res.json(req.user));
router.post('/password', auth, wrap(async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!new_password || String(new_password).length < 6) throw err(400, 'Password baru minimal 6 karakter');
  const u = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(String(old_password || ''), u.password_hash)) throw err(400, 'Password lama salah');
  await db.exec('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(new_password), 10), req.user.id]);
  res.json({ ok: true });
}));
module.exports = router;
