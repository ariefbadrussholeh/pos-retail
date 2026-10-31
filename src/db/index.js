// Adapter database tipis: satu API untuk Postgres (Supabase) dan MySQL/MariaDB.
// Semua SQL ditulis dengan placeholder `?`. Timestamp dibuat oleh aplikasi (waktu lokal APP_TZ)
// dan disimpan sebagai TIMESTAMP/DATETIME tanpa zona, sehingga perilaku sama di kedua DB.
const cfg = require('../config');

const pad = (n) => String(n).padStart(2, '0');
function now(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function today(d = new Date()) { return now(d).slice(0, 10); }

function wantSsl() {
  if (cfg.dbSsl === 'true') return true;
  if (cfg.dbSsl === 'false') return false;
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(cfg.dbUrl);
}

let driver;
if (cfg.dbClient === 'mysql') {
  const mysql = require('mysql2/promise');
  const u = new URL(cfg.dbUrl);
  const pool = mysql.createPool({
    host: u.hostname, port: +u.port || 3306,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), connectionLimit: cfg.poolMax,
    dateStrings: true, decimalNumbers: true, charset: 'utf8mb4',
    ssl: wantSsl() ? { rejectUnauthorized: false } : undefined,
    multipleStatements: false,
  });
  const wrap = (c) => ({
    async query(sql, p = []) { const [r] = await c.query(sql, p); return Array.isArray(r) ? r : []; },
    async exec(sql, p = []) { const [r] = await c.query(sql, p); return { rowCount: r.affectedRows, insertId: r.insertId }; },
    async insert(table, o) {
      const k = Object.keys(o);
      const [r] = await c.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, k.map((x) => o[x]));
      return r.insertId;
    },
    async upsert(table, o, keys) {
      const k = Object.keys(o); const upd = k.filter((x) => !keys.includes(x));
      await c.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${upd.map((x) => `${x}=VALUES(${x})`).join(',')}`, k.map((x) => o[x]));
    },
    async nextCounter(key) {
      await c.query('INSERT INTO counters (k, v) VALUES (?, 1) ON DUPLICATE KEY UPDATE v = v + 1', [key]);
      const [r] = await c.query('SELECT v FROM counters WHERE k = ?', [key]);
      return r[0].v;
    },
  });
  driver = {
    ...wrap(pool),
    async tx(fn) {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const r = await fn(wrap(c));
        await c.commit();
        return r;
      } catch (e) { try { await c.rollback(); } catch (_) {} throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
} else {
  const { Pool, types } = require('pg');
  types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
  types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint
  types.setTypeParser(1114, (v) => v.slice(0, 19)); // timestamp
  types.setTypeParser(1082, (v) => v); // date
  const pool = new Pool({
    connectionString: cfg.dbUrl, max: cfg.poolMax,
    ssl: wantSsl() ? { rejectUnauthorized: false } : false,
    idleTimeoutMillis: 30000,
  });
  const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const wrap = (c) => ({
    async query(sql, p = []) { return (await c.query(conv(sql), p)).rows; },
    async exec(sql, p = []) { const r = await c.query(conv(sql), p); return { rowCount: r.rowCount, insertId: null }; },
    async insert(table, o) {
      const k = Object.keys(o);
      const r = await c.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, k.map((x) => o[x]));
      return r.rows[0].id;
    },
    async upsert(table, o, keys) {
      const k = Object.keys(o); const upd = k.filter((x) => !keys.includes(x));
      await c.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (${keys.join(',')}) DO UPDATE SET ${upd.map((x) => `${x}=EXCLUDED.${x}`).join(',')}`, k.map((x) => o[x]));
    },
    async nextCounter(key) {
      const r = await c.query('INSERT INTO counters (k, v) VALUES ($1, 1) ON CONFLICT (k) DO UPDATE SET v = counters.v + 1 RETURNING v', [key]);
      return r.rows[0].v;
    },
  });
  driver = {
    ...wrap(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(wrap(c));
        await c.query('COMMIT');
        return r;
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

driver.one = async function one(sql, p) { const r = await this.query(sql, p); return r[0] || null; };
driver.client = cfg.dbClient;
driver.now = now;
driver.today = today;
module.exports = driver;
// `one` juga tersedia di objek transaksi
const origTx = driver.tx;
driver.tx = (fn) => origTx((t) => { t.one = async (sql, p) => (await t.query(sql, p))[0] || null; t.now = now; t.today = today; return fn(t); });
