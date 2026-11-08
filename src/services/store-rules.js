// ATURAN KHUSUS TOKO (di-hardcode per kode toko). Kunci = kode toko (lihat menu Toko).
//
// fakturTypes : jenis Penjualan Faktur yang tersedia di toko itu (INAPROC | SP | LANGSUNG).
//               Jenis lain disembunyikan di form dan ditolak server.
//
// reportRefs  : kolom nomor di laporan "Rincian Transaksi Penjualan". 'invoice' = nomor invoice/transaksi, 'contract' = No. Pesanan / SP.
//               Bila tidak diisi, kedua kolom tampil.
//
// Toko yang tidak terdaftar di sini memakai semua jenis dan kedua kolom.
//
// CARA MENGHILANGKAN: hapus properti yang bersangkutan di baris toko itu (mis. buang `fakturTypes: [...]` atau `reportRefs: [...]`),
// atau hapus seluruh baris toko, lalu restart aplikasi. Tidak ada perubahan data.
// Kode toko Ardana = AJS, Rizky Nabila = RN (lihat menu Toko).
const ALL = ['INAPROC', 'SP', 'LANGSUNG'];
const RULES = {
  RN: { fakturTypes: ['LANGSUNG'], reportRefs: ['invoice'] },
  AJS: { reportRefs: ['contract'] },
};
const fakturTypes = (code) => (RULES[String(code || '').toUpperCase()] || {}).fakturTypes || ALL;
const reportRefs = (code) => (RULES[String(code || '').toUpperCase()] || {}).reportRefs || ['invoice', 'contract'];
module.exports = { fakturTypes, reportRefs, RULES, ALL };
