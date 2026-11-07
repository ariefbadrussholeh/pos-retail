// Membuat toko "Toko Rizky Nabila" (kode RN) lengkap dengan identitas + template Rizky (tampilan ada di src/templates/rizky.js).
// Pakai: npm run seed:rizky   (aman diulang; memperbarui pengaturan toko yang sudah ada)
// Nomor dokumen memakai kode toko: contoh "30 / X / RN / 2026". Nama penandatangan, rekening, dan telepon diisi sendiri di Pengaturan.
const db = require('../src/db');
const { ensureSchema } = require('../src/db/schema');
const settings = require('../src/services/settings');
const catalog = require('../src/services/catalog');

(async () => {
  await ensureSchema();
  let st = await db.one("SELECT id FROM stores WHERE code = 'RN'");
  if (!st) st = { id: await db.insert('stores', { code: 'RN', name: 'Toko Rizky Nabila', active: 1, created_at: db.now() }) };
  await db.tx((t) => catalog.fillAllStores(t)); // toko baru langsung punya semua barang master (stok 0)
  await settings.save(st.id, {
    store_name: 'Toko Rizky Nabila',
    address: 'Ds. Grujugan, Larangan, Pamekasan',
    tax_percent: '0', default_due_days: '14',
    doc_template: 'rizky',
  });
  console.log(`Toko Rizky Nabila siap (id ${st.id}). Pilih lewat dropdown toko di topbar panel admin.`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
