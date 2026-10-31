// Buat tabel + akun owner awal. Aman dijalankan berulang kali.
const bcrypt = require('bcryptjs');
const cfg = require('../src/config');
const db = require('../src/db');
const { createSchema } = require('../src/db/schema');

(async () => {
  console.log(`Driver: ${db.client}`);
  await createSchema();
  console.log('Tabel siap.');
  const n = await db.one('SELECT COUNT(*) AS n FROM users');
  if (!n.n) {
    await db.insert('users', {
      username: cfg.admin.user, name: cfg.admin.name, role: 'owner',
      password_hash: bcrypt.hashSync(cfg.admin.password, 10), active: 1, created_at: db.now(),
    });
    console.log(`Akun owner dibuat: ${cfg.admin.user} / ${cfg.admin.password}  (segera ganti password!)`);
  }
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
