// DAFTAR TEMPLATE DOKUMEN (invoice, surat jalan, SPP).
// Menambah template baru:
//   1. Salin src/templates/ardana.js menjadi src/templates/<nama>.js lalu ubah layout/warna/gambarnya
//      (gambar taruh di folder src/templates/<nama>/).
//   2. Daftarkan satu baris di bawah ini.
//   3. Di aplikasi: Pengaturan > Template dokumen, pilih template untuk toko yang diinginkan.
// Setiap template mengekspor { label, margin, draw(doc, kind, s, d) }; kind = invoice | delivery | payment-request.
module.exports = {
  default: require('./default'),
  ardana: require('./ardana'),
  rizky: require('./rizky'),
  // contoh: tokoabc: require('./tokoabc'),
};
