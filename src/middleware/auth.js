const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');

const COOKIE = 'pos_token';
function sign(u) { return jwt.sign({ id: u.id, role: u.role }, cfg.jwtSecret, { expiresIn: '12h' }); }
function setCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, maxAge: 12 * 3600 * 1000 });
}
async function auth(req, res, next) {
  try {
    let token = req.cookies && req.cookies[COOKIE];
    const h = req.headers.authorization;
    if (!token && h && h.startsWith('Bearer ')) token = h.slice(7);
    if (!token) return res.status(401).json({ error: 'Belum login' });
    const p = jwt.verify(token, cfg.jwtSecret);
    const u = await db.one('SELECT id, username, name, role, active FROM users WHERE id = ?', [p.id]);
    if (!u || !u.active) return res.status(401).json({ error: 'Akun tidak aktif' });
    req.user = u;
    next();
  } catch (e) { res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' }); }
}
const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Tidak punya akses' });
const owner = role('owner');
module.exports = { auth, role, owner, sign, setCookie, COOKIE };
