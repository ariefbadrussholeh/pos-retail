// Membuat toko "CV Ardana Jaya Sejahtera" lengkap dengan identitas + template Ardana (tampilan ada di src/templates/ardana.js).
// Pakai: npm run seed:ardana   (aman diulang; memperbarui pengaturan toko yang sudah ada)
const db = require('../src/db');
const { ensureSchema } = require('../src/db/schema');
const settings = require('../src/services/settings');

(async () => {
  await ensureSchema();
  let st = await db.one("SELECT id FROM stores WHERE code = 'AJS'");
  if (!st) st = { id: await db.insert('stores', { code: 'AJS', name: 'CV Ardana Jaya Sejahtera', active: 1, created_at: db.now() }) };
  await settings.save(st.id, {
    store_name: 'CV Ardana Jaya Sejahtera',
    address: 'Ds. Grujugan, Kec. Larangan, Pamekasan',
    phone: '081996875314',
    bank_name: 'Bank Jatim', bank_account: '1683831065', bank_holder: 'CV Ardana Jaya Sejahtera',
    signer_name: 'ERSAD', signer_title: 'Direktur',
    tax_percent: '0', default_due_days: '50',
    doc_template: 'ardana',
  });
  console.log(`Toko Ardana siap (id ${st.id}). Pilih lewat dropdown toko di pojok kiri atas panel admin.`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
