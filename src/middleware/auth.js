const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');
const stores = require('../services/stores');

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
    const u = await db.one('SELECT id, username, name, role, active, store_id FROM users WHERE id = ?', [p.id]);
    if (!u || !u.active) return res.status(401).json({ error: 'Akun tidak aktif' });
    req.user = u;
    // Toko aktif: kasir terkunci ke tokonya; owner memilih lewat header X-Store (atau ?store=), default toko aktif pertama
    const list = await stores.all();
    let st;
    if (u.role === 'owner') {
      const want = +req.headers['x-store'] || +req.query.store || 0;
      st = want ? list.find((s) => s.id === want) : (list.find((s) => s.active) || list[0]);
      if (!st) return res.status(400).json({ error: 'Toko tidak ditemukan' });
    } else {
      st = list.find((s) => s.id === u.store_id);
      if (!st) return res.status(403).json({ error: 'Akun belum ditempatkan di toko' });
      if (!st.active) return res.status(403).json({ error: 'Toko ini sedang dinonaktifkan' });
    }
    req.sid = st.id; req.store = st;
    next();
  } catch (e) { res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' }); }
}
const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Tidak punya akses' });
const owner = role('owner');
module.exports = { auth, role, owner, sign, setCookie, COOKIE };
