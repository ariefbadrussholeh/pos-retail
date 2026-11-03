// Daftar toko di memori (jarang berubah); dibersihkan setiap ada perubahan toko.
const db = require('../db');
let cache = null; let at = 0;
async function all() {
  if (!cache || Date.now() - at > 15000) { cache = await db.query('SELECT id, code, name, active FROM stores ORDER BY id'); at = Date.now(); }
  return cache;
}
const clear = () => { cache = null; };
module.exports = { all, clear };
