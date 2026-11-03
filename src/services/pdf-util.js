// Pembantu bersama untuk template PDF
const path = require('path');
// Font ditanam (TTF) supaya tidak bergantung pada standard-fonts pdfkit yang tidak ikut ter-bundle di Vercel
const F = (n) => path.join(__dirname, '../../fonts', n);
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const num = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
const qtyf = (n) => (Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const tgl = (s) => { if (!s) return '-'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${+d} ${BULAN[+m - 1]} ${y}`; };

const SAT = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function tb(n) {
  n = Math.floor(n);
  if (n < 12) return SAT[n];
  if (n < 20) return tb(n - 10) + ' belas';
  if (n < 100) return tb(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + tb(n % 10) : '');
  if (n < 200) return 'seratus' + (n > 100 ? ' ' + tb(n - 100) : '');
  if (n < 1000) return tb(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + tb(n % 100) : '');
  if (n < 2000) return 'seribu' + (n > 1000 ? ' ' + tb(n - 1000) : '');
  if (n < 1e6) return tb(Math.floor(n / 1e3)) + ' ribu' + (n % 1e3 ? ' ' + tb(n % 1e3) : '');
  if (n < 1e9) return tb(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + tb(n % 1e6) : '');
  if (n < 1e12) return tb(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + tb(n % 1e9) : '');
  return tb(Math.floor(n / 1e12)) + ' triliun' + (n % 1e12 ? ' ' + tb(n % 1e12) : '');
}
function terbilang(n) {
  const s = Math.round(Number(n) || 0) === 0 ? 'nol' : tb(Math.abs(Math.round(n)));
  return s.charAt(0).toUpperCase() + s.slice(1) + ' rupiah';
}
const hex = (c, d) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : d);
// Nama pajak untuk ringkasan: "PPN 11%" / "PPN 11% (termasuk)"
function taxLabel(s, d) {
  const rate = d.tax_rate || s.tax_percent || 0;
  const incl = d.tax_mode ? d.tax_mode === 'INCLUDE' : s.tax_inclusive;
  return `${s.tax_label || 'PPN'}${rate ? ' ' + rate + '%' : ''}${incl ? ' (termasuk)' : ''}`;
}
// Baris referensi tambahan (kontrak, surat pesanan) bila ada
function refRows(d) {
  const r = [];
  if (d.contract_no) r.push(['No. Kontrak', d.contract_no + (d.contract_date ? ' / ' + tgl(d.contract_date) : '')]);
  if (d.po_ref) r.push(['No. Surat Pesanan', d.po_ref]);
  return r;
}
module.exports = { F, BULAN, rp, num, qtyf, tgl, terbilang, hex, taxLabel, refRows };
