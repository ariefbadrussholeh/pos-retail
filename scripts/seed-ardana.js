// Membuat toko "CV Ardana Jaya Sejahtera" lengkap dengan identitas + template Ardana (gambar dari assets/ardana).
// Pakai: npm run seed:ardana   (aman diulang; memperbarui pengaturan toko yang sudah ada)
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { ensureSchema } = require('../src/db/schema');
const settings = require('../src/services/settings');

const dataUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../assets/ardana', f)).toString('base64');
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
    tax_percent: '0', custom_tax_percent: '11', default_due_days: '50',
    doc_template: 'ardana', doc_accent: '#F47920', doc_accent2: '#1F3864',
    doc_no_format: '{n} / {rom} / {code} / {yyyy}',
    logo: dataUrl('logo.png'), tpl_header: dataUrl('header.png'), tpl_footer: dataUrl('footer.png'), tpl_phone_icon: dataUrl('phone.png'),
  });
  console.log(`Toko Ardana siap (id ${st.id}). Pilih lewat dropdown toko di pojok kiri atas panel admin.`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
