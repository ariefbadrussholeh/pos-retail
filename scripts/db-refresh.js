// Migrasi ulang dari nol (seperti "migrate:refresh"): HAPUS SEMUA TABEL aplikasi lalu buat ulang + akun owner awal.
// SEMUA DATA HILANG. Cadangkan dulu (menu Backup & Restore) bila ada data penting.
//
// Pakai:
//   npm run db:refresh                      tanya konfirmasi, lalu tabel kosong + akun owner
//   npm run db:refresh -- --seed            + data contoh (scripts/seed.js)
//   npm run db:refresh -- --ecatalog        + master barang dari Excel e-katalog
//   npm run db:refresh -- --ardana --rizky  + toko CV Ardana Jaya Sejahtera / Toko Rizky Nabila
//   npm run db:refresh -- --yes             tanpa konfirmasi (untuk skrip/CI)
// Opsi seeder bisa digabung; urutan jalan: seed, ecatalog, ardana, rizky.
// Hanya menghapus tabel milik aplikasi (daftar TABLES di src/db/schema.js), bukan seluruh database.
const readline = require('readline');
const path = require('path');
const { execFileSync } = require('child_process');
const cfg = require('../src/config');
const db = require('../src/db');
const { TABLES } = require('../src/db/schema');

const args = new Set(process.argv.slice(2));
const SEEDS = [['--seed', 'seed.js'], ['--ecatalog', 'seed-ecatalog.js'], ['--ardana', 'seed-ardana.js'], ['--rizky', 'seed-rizky.js']];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (f) => { await pause(700); execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env }); }; // jeda singkat: beberapa server Postgres kecil butuh waktu melepas koneksi lama

function target() {
  try { const u = new URL(cfg.dbUrl); return `${u.protocol.replace(':', '')}://${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`; } catch (_) { return '(DATABASE_URL tidak terbaca)'; }
}
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

(async () => {
  for (const a of args) if (a !== '--yes' && !SEEDS.some(([f]) => f === a)) { console.error(`Opsi tidak dikenal: ${a}`); process.exit(2); }
  console.log(`Driver : ${db.client}\nTarget : ${target()}\nAksi   : hapus ${TABLES.length} tabel aplikasi lalu buat ulang`);
  if (!args.has('--yes')) {
    if (!process.stdin.isTTY) { console.error('Terminal tidak interaktif. Tambahkan --yes untuk melanjutkan tanpa konfirmasi.'); process.exit(2); }
    if ((await ask('Semua data akan HILANG. Ketik REFRESH untuk melanjutkan: ')) !== 'REFRESH') { console.log('Dibatalkan.'); await db.close(); return; }
  }
  const drop = [...TABLES, 'settings'].reverse(); // anak dulu, lalu induk
  if (db.client === 'pg') { for (const t of drop) await db.exec(`DROP TABLE IF EXISTS ${t} CASCADE`); }
  else await db.tx(async (t) => { await t.exec('SET FOREIGN_KEY_CHECKS = 0'); for (const x of drop) await t.exec(`DROP TABLE IF EXISTS ${x}`); await t.exec('SET FOREIGN_KEY_CHECKS = 1'); });
  console.log('Tabel dihapus.');
  await db.close();
  await run('init-db.js');
  for (const [flag, file] of SEEDS) if (args.has(flag)) await run(file);
  console.log('Refresh selesai.');
})().catch((e) => { console.error(e); process.exit(1); });
