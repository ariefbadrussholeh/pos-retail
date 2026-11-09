// FORMAT NOMOR DOKUMEN Penjualan INAPROC (sama untuk semua toko). Ubah FORMAT di bawah bila perlu.
// Token: {n} nomor urut 2 digit | {n3} 3 digit | {rom} bulan romawi | {mm} bulan angka | {code} kode toko | {yyyy} tahun | {yy} 2 digit tahun
// Nomor urut mulai dari 1 lagi setiap tahun, per toko. Contoh hasil: 03 / X / AJS / 2026
// Nomor berikutnya = nomor TERBESAR yang masih ada di toko itu pada tahun tersebut + 1 (dihitung dari data yang ada).
// Jadi bila faktur terakhir dihapus, nomornya dipakai lagi; bila yang dihapus di tengah, nomor berikutnya tetap melanjutkan yang terbesar.
const FORMAT = '{n}/{rom}/{code}/{yyyy}';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function formatNo(n, date, code) {
  const [y, m] = date.split('-');
  return FORMAT.replace(/\{n3\}/g, String(n).padStart(3, '0')).replace(/\{n\}/g, String(n).padStart(2, '0'))
    .replace(/\{rom\}/g, ROMAN[+m - 1]).replace(/\{mm\}/g, m).replace(/\{code\}/g, code)
    .replace(/\{yyyy\}/g, y).replace(/\{yy\}/g, y.slice(2));
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Regex pengurai nomor dokumen sesuai FORMAT, untuk toko dan tahun tertentu; grup 1 = nomor urut
function parser(date, code) {
  const y = date.slice(0, 4);
  const src = esc(FORMAT).replace(/\\\{n3\\\}|\\\{n\\\}/g, '(\\d+)').replace(/\\\{rom\\\}/g, '[IVX]+').replace(/\\\{mm\\\}/g, '\\d{2}')
    .replace(/\\\{code\\\}/g, esc(code)).replace(/\\\{yyyy\\\}/g, y).replace(/\\\{yy\\\}/g, y.slice(2));
  return new RegExp('^' + src + '$');
}
// q = db atau transaksi (t). Mengembalikan nomor urut berikutnya dan teks nomornya.
async function nextNo(q, sid, date, code) {
  const re = parser(date, code);
  const rows = await q.query("SELECT sale_no FROM sales WHERE store_id = ? AND kind <> 'POS'", [sid]);
  let max = 0;
  for (const r of rows) { const m = re.exec(String(r.sale_no)); if (m && +m[1] > max) max = +m[1]; }
  return { n: max + 1, no: formatNo(max + 1, date, code) };
}
const counterKey = (sid, date) => `${sid}:CINV-${date.slice(0, 4)}`;
module.exports = { FORMAT, formatNo, counterKey, nextNo };
