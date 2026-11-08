// ATURAN KHUSUS TOKO (di-hardcode per kode toko). Kunci = kode toko (lihat menu Toko).
//
// fakturTypes : jenis Penjualan Faktur yang tersedia di toko itu (INAPROC | SP | LANGSUNG).
//               Jenis lain disembunyikan di form dan ditolak server.
//
// Toko yang tidak terdaftar di sini memakai semua jenis.
//
// CARA MENGHILANGKAN pembatasan Toko Rizky Nabila (RN): hapus baris `RN: {...}` di bawah ini (atau ganti
// fakturTypes menjadi ['INAPROC', 'SP', 'LANGSUNG']), lalu restart aplikasi. Tidak ada perubahan data.
const ALL = ['INAPROC', 'SP', 'LANGSUNG'];
const RULES = {
  RN: { fakturTypes: ['LANGSUNG'] },
};
const fakturTypes = (code) => (RULES[String(code || '').toUpperCase()] || {}).fakturTypes || ALL;
module.exports = { fakturTypes, RULES, ALL };
