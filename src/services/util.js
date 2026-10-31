const db = require('../db');
const err = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const like = (q) => `%${String(q).toLowerCase().replace(/[%_\\]/g, '')}%`;
const ymd = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);

// Nomor dokumen harian: PREFIX-YYYYMMDD-0001
async function nextNo(t, prefix, date) {
  const d = (date || db.today()).replace(/-/g, '');
  const n = await t.nextCounter(`${prefix}-${d}`);
  return `${prefix}-${d}-${String(n).padStart(4, '0')}`;
}
// Rentang tanggal -> [from 00:00:00, to+1 00:00:00)
function range(q) {
  const from = ymd(q.from) || db.today();
  const to = ymd(q.to) || from;
  const next = new Date(to + 'T00:00:00'); next.setDate(next.getDate() + 1);
  return { from, to, f: from + ' 00:00:00', t: db.today(next) + ' 00:00:00' };
}
function page(q, def = 50) {
  const limit = Math.min(Math.max(parseInt(q.limit) || def, 1), 500);
  const offset = (Math.max(parseInt(q.page) || 1, 1) - 1) * limit;
  return { limit, offset };
}
module.exports = { err, wrap, num, round2, round3, like, ymd, nextNo, range, page };
