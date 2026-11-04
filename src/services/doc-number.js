// FORMAT NOMOR DOKUMEN Penjualan INAPROC (sama untuk semua toko). Ubah FORMAT di bawah bila perlu.
// Token: {n} nomor urut 2 digit | {n3} 3 digit | {rom} bulan romawi | {mm} bulan angka | {code} kode toko | {yyyy} tahun | {yy} 2 digit tahun
// Nomor urut mulai dari 1 lagi setiap tahun, per toko. Contoh hasil: 03 / X / AJS / 2026
const FORMAT = '{n} / {rom} / {code} / {yyyy}';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function formatNo(n, date, code) {
  const [y, m] = date.split('-');
  return FORMAT.replace(/\{n3\}/g, String(n).padStart(3, '0')).replace(/\{n\}/g, String(n).padStart(2, '0'))
    .replace(/\{rom\}/g, ROMAN[+m - 1]).replace(/\{mm\}/g, m).replace(/\{code\}/g, code)
    .replace(/\{yyyy\}/g, y).replace(/\{yy\}/g, y.slice(2));
}
const counterKey = (sid, date) => `${sid}:CINV-${date.slice(0, 4)}`;
module.exports = { FORMAT, formatNo, counterKey };
