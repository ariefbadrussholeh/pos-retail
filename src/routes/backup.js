// Backup & restore keseluruhan data (semua toko). Format: JSON yang di-gzip, lintas Postgres/MySQL.
const router = require('express').Router();
const express = require('express');
const zlib = require('zlib');
const db = require('../db');
const { TABLES, VERSION, seedDocTypes } = require('../db/schema');
const stores = require('../services/stores');
const settings = require('../services/settings');
const { auth, owner } = require('../middleware/auth');
const { wrap, err } = require('../services/util');

router.use(auth, owner);
const DATA_TABLES = TABLES.filter((t) => t !== 'app_meta'); // urutan sudah mengikuti dependensi FK

router.get('/', wrap(async (req, res) => {
  const stamp = db.now().replace(/[-: ]/g, '').slice(0, 12);
  res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="backup-pos-${stamp}.json.gz"` });
  const gz = zlib.createGzip(); gz.pipe(res);
  const write = (s) => new Promise((ok) => (gz.write(s) ? ok() : gz.once('drain', ok)));
  await write(`{"app":"pos-retail","schema":${VERSION},"exported_at":${JSON.stringify(db.now())},"driver":"${db.client}","tables":{`);
  let first = true;
  for (const t of DATA_TABLES) {
    await write(`${first ? '' : ','}${JSON.stringify(t)}:[`);
    first = false;
    if (t === 'sale_docs') { // berkas besar: baca per beberapa baris agar memori kecil
      let last = 0; let n = 0;
      for (;;) {
        const rows = await db.query('SELECT * FROM sale_docs WHERE id > ? ORDER BY id LIMIT 10', [last]);
        if (!rows.length) break;
        await write((n++ ? ',' : '') + rows.map((r) => JSON.stringify(r)).join(','));
        last = rows[rows.length - 1].id;
      }
    } else {
      const rows = await db.query(`SELECT * FROM ${t}`);
      for (let i = 0; i < rows.length; i += 500) await write((i ? ',' : '') + rows.slice(i, i + 500).map((r) => JSON.stringify(r)).join(','));
    }
    await write(']');
  }
  await write('}}');
  gz.end();
}));

async function columnsOf(t, table) {
  const q = db.client === 'pg'
    ? 'SELECT column_name AS c FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()'
    : 'SELECT column_name AS c FROM information_schema.columns WHERE table_name = ? AND table_schema = DATABASE()';
  return new Set((await t.query(q, [table])).map((r) => r.c));
}

// Ganti seluruh isi database dengan file backup. Wajib ?confirm=RESTORE.
router.post('/restore', express.raw({ type: () => true, limit: '60mb' }), wrap(async (req, res) => {
  if (req.query.confirm !== 'RESTORE') throw err(400, 'Konfirmasi RESTORE diperlukan');
  let buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw err(400, 'File backup kosong');
  try { if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf); } catch (e) { throw err(400, 'File backup rusak (gagal membuka gzip)'); }
  let data;
  try { data = JSON.parse(buf.toString('utf8')); } catch (e) { throw err(400, 'File backup bukan JSON yang valid'); }
  if (!data || data.app !== 'pos-retail' || typeof data.tables !== 'object') throw err(400, 'Ini bukan file backup aplikasi ini');
  if (data.schema > VERSION) throw err(400, 'Backup berasal dari versi aplikasi yang lebih baru');
  const T = data.tables;
  if (!Array.isArray(T.stores) || !T.stores.length) throw err(400, 'Backup tidak memuat data toko');
  if (!Array.isArray(T.users) || !T.users.some((u) => u.role === 'owner' && u.active)) throw err(400, 'Backup tidak memuat akun owner aktif');

  const counts = {};
  await db.tx(async (t) => {
    for (const tb of [...DATA_TABLES].reverse()) await t.exec(`DELETE FROM ${tb}`);
    for (const tb of DATA_TABLES) {
      const rows = Array.isArray(T[tb]) ? T[tb] : [];
      counts[tb] = rows.length;
      if (!rows.length) continue;
      const cols = await columnsOf(t, tb);
      const keys = Object.keys(rows[0]).filter((k) => cols.has(k));
      const per = Math.max(1, Math.floor(30000 / keys.length));
      const big = tb === 'sale_docs' ? 1 : per; // satu berkas per INSERT (ukuran paket)
      for (let i = 0; i < rows.length; i += big) {
        const chunk = rows.slice(i, i + big);
        const ph = '(' + keys.map(() => '?').join(',') + ')';
        await t.exec(`INSERT INTO ${tb} (${keys.join(',')}) VALUES ${chunk.map(() => ph).join(',')}`, chunk.flatMap((r) => keys.map((k) => (r[k] === undefined ? null : r[k]))));
      }
    }
    if (db.client === 'pg') {
      for (const tb of DATA_TABLES) {
        if (['store_settings', 'counters'].includes(tb)) continue;
        await t.exec(`SELECT setval(pg_get_serial_sequence('${tb}', 'id'), COALESCE((SELECT MAX(id) FROM ${tb}), 1), (SELECT MAX(id) IS NOT NULL FROM ${tb}))`);
      }
    }
  });
  await seedDocTypes(); // backup lama (v1.3) belum punya jenis dokumen
  stores.clear(); settings.clearCache();
  res.json({ ok: true, counts });
}));
module.exports = router;
