// Dokumen PDF A4: Invoice, Surat Jalan, Permohonan Pembayaran (penjualan & pembelian).
const PDFDocument = require('pdfkit');
const path = require('path');
// Font ditanam (TTF) supaya tidak bergantung pada standard-fonts pdfkit yang tidak ikut ter-bundle di Vercel
const F = (n) => path.join(__dirname, '../../fonts', n);

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
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

const M = 45; // margin
const INK = '#111111'; const MUTED = '#787774'; const LINE = '#cfcfcc'; const BAND = '#f3f2ee';

function letterhead(doc, s, logo) {
  const W = doc.page.width - 2 * M;
  let x = M; const y0 = M;
  if (logo) { try { doc.image(logo, M, y0, { fit: [64, 64] }); x = M + 76; } catch (_) {} }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(s.store_name, x, y0, { width: W - (x - M) });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  if (s.store_tagline) doc.text(s.store_tagline, x, doc.y, { width: W - (x - M) });
  const addr = [s.address, s.city].filter(Boolean).join(', ');
  if (addr) doc.text(addr, x, doc.y, { width: W - (x - M) });
  const contact = [s.phone && 'Telp. ' + s.phone, s.email, s.website].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact, x, doc.y, { width: W - (x - M) });
  if (s.npwp) doc.text('NPWP ' + s.npwp, x, doc.y, { width: W - (x - M) });
  const yEnd = Math.max(doc.y, y0 + (logo ? 64 : 0)) + 8;
  doc.moveTo(M, yEnd).lineTo(M + W, yEnd).lineWidth(1.2).strokeColor(INK).stroke();
  doc.moveTo(M, yEnd + 2.5).lineTo(M + W, yEnd + 2.5).lineWidth(0.4).strokeColor(INK).stroke();
  doc.y = yEnd + 16; doc.x = M;
  doc.fillColor(INK);
}

// Tabel dengan header berulang saat pindah halaman
function table(doc, cols, rows, o = {}) {
  const W = doc.page.width - 2 * M;
  const fixed = cols.reduce((a, c) => a + (c.w || 0), 0);
  const flex = cols.filter((c) => !c.w);
  flex.forEach((c) => { c.w = (W - fixed) / flex.length; });
  const pad = 4; const fs = o.fontSize || 9;
  const head = () => {
    const y = doc.y; const h = 20;
    doc.rect(M, y, W, h).fill(BAND);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(fs);
    let x = M;
    for (const c of cols) { doc.text(c.label, x + pad, y + 6, { width: c.w - 2 * pad, align: c.align || 'left', lineBreak: false }); x += c.w; }
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.6).strokeColor(INK).stroke();
    doc.y = y + h + 3;
  };
  head();
  doc.font('Helvetica').fontSize(fs);
  for (const r of rows) {
    const h = Math.max(...cols.map((c) => doc.heightOfString(String(r[c.key] ?? ''), { width: c.w - 2 * pad, align: c.align || 'left' }))) + 6;
    if (doc.y + h > doc.page.height - M - 40) { doc.addPage(); doc.y = M; head(); doc.font('Helvetica').fontSize(fs); }
    const y = doc.y; let x = M;
    doc.fillColor(INK);
    for (const c of cols) { doc.text(String(r[c.key] ?? ''), x + pad, y + 3, { width: c.w - 2 * pad, align: c.align || 'left' }); x += c.w; }
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.3).strokeColor(LINE).stroke();
    doc.y = y + h;
  }
  doc.moveDown(0.5);
}
function kv(doc, rows, x, w, labelW = 90) {
  for (const [k, v] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, x, y, { width: labelW });
    doc.fillColor(INK).font('Helvetica').text(': ' + v, x + labelW, y, { width: w - labelW });
    doc.y = Math.max(doc.y, y + 12);
  }
}
function totalsBox(doc, rows) {
  const W = doc.page.width - 2 * M; const w = 230; const x = M + W - w;
  if (doc.y + rows.length * 16 + 10 > doc.page.height - M - 120) doc.addPage();
  for (const [k, v, bold] of rows) {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10.5 : 9).fillColor(INK);
    doc.text(k, x, y, { width: 100 }); doc.text(v, x + 100, y, { width: w - 100, align: 'right' });
    doc.y = y + (bold ? 17 : 14);
    if (bold) { doc.moveTo(x, y - 2).lineTo(x + w, y - 2).lineWidth(0.6).strokeColor(INK).stroke(); }
  }
  doc.moveDown(0.3);
}
function signatures(doc, labels, names = []) {
  const W = doc.page.width - 2 * M; const h = 95;
  if (doc.y + h > doc.page.height - M) doc.addPage();
  const y = doc.y + 6; const cw = W / labels.length;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  labels.forEach((l, i) => {
    doc.text(l, M + i * cw, y, { width: cw, align: 'center' });
    const nm = names[i] || '';
    doc.moveTo(M + i * cw + 22, y + 70).lineTo(M + (i + 1) * cw - 22, y + 70).lineWidth(0.5).strokeColor(INK).stroke();
    if (nm) doc.text(nm, M + i * cw, y + 73, { width: cw, align: 'center' });
  });
  doc.y = y + h;
}
function title(doc, text, no) {
  const W = doc.page.width - 2 * M;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(text, M, doc.y, { width: W, align: 'center', characterSpacing: 1.5 });
  if (no) doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('No. ' + no, M, doc.y + 1, { width: W, align: 'center' });
  doc.moveDown(0.9); doc.x = M;
}
function partyBlock(doc, d) {
  const W = doc.page.width - 2 * M; const half = W / 2 - 10; const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(d.partyLabel, M, y);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(d.party.name, M, doc.y + 1, { width: half });
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  if (d.party.address) doc.text(d.party.address, M, doc.y, { width: half });
  if (d.party.phone) doc.text('Telp. ' + d.party.phone, M, doc.y, { width: half });
  const yl = doc.y;
  doc.y = y; kv(doc, d.meta, M + W / 2 + 10, W / 2 - 10, 85);
  doc.y = Math.max(yl, doc.y) + 10; doc.x = M;
}

const FOOTER = (doc, s, d) => {
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.text(`${d.docTitle} ${d.no}  -  Halaman ${i + 1} dari ${range.count}`, M, doc.page.height - 30, { width: doc.page.width - 2 * M, align: 'center', lineBreak: false });
  }
};

function invoice(doc, s, d) {
  title(doc, d.titles.invoice, d.no);
  partyBlock(doc, d);
  const rows = d.items.map((i, n) => ({ n: n + 1, name: i.name + (i.sku ? `\n${i.sku}` : ''), qty: qtyf(i.qty) + ' ' + (i.unit || ''), price: rp(i.price), disc: i.discount ? rp(i.discount) : '-', total: rp(i.total) }));
  table(doc, [{ key: 'n', label: 'No', w: 28 }, { key: 'name', label: 'Nama Barang' }, { key: 'qty', label: 'Qty', w: 62, align: 'right' }, { key: 'price', label: 'Harga', w: 72, align: 'right' }, { key: 'disc', label: 'Diskon', w: 60, align: 'right' }, { key: 'total', label: 'Jumlah', w: 80, align: 'right' }], rows);
  const t = [['Subtotal', rp(d.subtotal)]];
  if (d.discount) t.push(['Diskon', '- ' + rp(d.discount)]);
  if (d.tax) t.push([s.tax_label + (s.tax_inclusive ? ' (termasuk)' : ''), rp(d.tax)]);
  t.push(['TOTAL', rp(d.total), true]);
  if (d.paid) t.push(['Dibayar', rp(d.paid)]);
  if (d.paid && d.total - d.paid > 0) t.push(['Sisa tagihan', rp(d.total - d.paid), true]);
  totalsBox(doc, t);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK).text('Terbilang: ' + terbilang(d.total), M, doc.y, { width: doc.page.width - 2 * M });
  doc.moveDown(0.6);
  paymentInfo(doc, s, d);
  if (s.doc_note) { doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(s.doc_note, M, doc.y, { width: doc.page.width - 2 * M }); doc.moveDown(0.4); }
  signatures(doc, d.sig.invoice, [null, d.sig.invoice.length === 2 ? s.signer_name : null]);
}
function paymentInfo(doc, s, d) {
  if (d.side === 'purchase') return;
  if (s.bank_name || s.bank_account) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Pembayaran ke:', M, doc.y);
    doc.font('Helvetica').text(`${s.bank_name} ${s.bank_account}${s.bank_holder ? ' a.n. ' + s.bank_holder : ''}`, M, doc.y);
    doc.moveDown(0.5);
  }
}
function delivery(doc, s, d) {
  title(doc, 'SURAT JALAN', 'SJ/' + d.no);
  partyBlock(doc, { ...d, meta: d.metaDelivery });
  const rows = d.items.map((i, n) => ({ n: n + 1, sku: i.sku || '', name: i.name, qty: qtyf(i.qty), unit: i.unit || '', note: '' }));
  table(doc, [{ key: 'n', label: 'No', w: 28 }, { key: 'sku', label: 'Kode', w: 80 }, { key: 'name', label: 'Nama Barang' }, { key: 'qty', label: 'Qty', w: 60, align: 'right' }, { key: 'unit', label: 'Satuan', w: 55 }, { key: 'note', label: 'Keterangan', w: 90 }], rows);
  const tq = d.items.reduce((a, i) => a + Number(i.qty), 0);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`Total ${d.items.length} jenis barang, ${qtyf(tq)} unit`, M, doc.y);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Barang telah diterima dalam keadaan baik dan jumlah sesuai. Mohon periksa saat barang diterima.', M, doc.y, { width: doc.page.width - 2 * M });
  doc.moveDown(0.6);
  signatures(doc, d.sig.delivery);
}
function paymentRequest(doc, s, d) {
  const W = doc.page.width - 2 * M;
  const owed = Math.max(d.total - d.paid, 0);
  title(doc, 'PERMOHONAN PEMBAYARAN', 'PP/' + d.no);
  kv(doc, [['Tanggal', tgl(d.date)], ['Lampiran', '1 (satu) berkas ' + (d.side === 'sale' ? 'invoice' : 'rincian pembelian')], ['Perihal', 'Permohonan Pembayaran']], M, 300, 70);
  doc.moveDown(0.8);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text('Kepada Yth.', M, doc.y);
  doc.font('Helvetica-Bold').text(d.side === 'sale' ? d.party.name : 'Bagian Keuangan', M, doc.y);
  doc.font('Helvetica');
  if (d.side === 'sale' && d.party.address) doc.text(d.party.address, M, doc.y, { width: 300 });
  doc.text('di tempat', M, doc.y);
  doc.moveDown(0.9);
  doc.text('Dengan hormat,', M, doc.y);
  doc.moveDown(0.4);
  const intro = d.side === 'sale'
    ? `Bersama surat ini kami, ${s.store_name}, mengajukan permohonan pembayaran atas transaksi pembelian barang sebagaimana rincian berikut:`
    : `Bersama surat ini kami mengajukan permohonan agar dilakukan pembayaran kepada pemasok ${d.party.name} atas pembelian barang sebagaimana rincian berikut:`;
  doc.text(intro, M, doc.y, { width: W, align: 'justify', lineGap: 2 });
  doc.moveDown(0.7);
  table(doc, [{ key: 'no', label: d.side === 'sale' ? 'No. Invoice' : 'No. Pembelian', w: 112 }, { key: 'date', label: 'Tanggal', w: 82 }, { key: 'due', label: 'Jatuh Tempo', w: 82 }, { key: 'total', label: 'Total', w: 72, align: 'right' }, { key: 'paid', label: 'Dibayar', w: 68, align: 'right' }, { key: 'owed', label: 'Dimohonkan', w: 89, align: 'right' }],
    [{ no: d.no, date: tgl(d.date).replace(/^(\d+) (\w{3})\w* /, '$1 $2 '), due: tgl(d.due_date).replace(/^(\d+) (\w{3})\w* /, '$1 $2 '), total: rp(d.total), paid: rp(d.paid), owed: rp(owed) }], { fontSize: 9 });
  doc.font('Helvetica-Bold').fontSize(10.5).text(`Jumlah yang dimohonkan: ${rp(owed)}`, M, doc.y);
  doc.font('Helvetica-Oblique').fontSize(9.5).text(`(${terbilang(owed)})`, M, doc.y + 1);
  doc.moveDown(0.8);
  doc.font('Helvetica').fontSize(10).fillColor(INK);
  if (d.side === 'sale' && (s.bank_name || s.bank_account)) {
    doc.text('Pembayaran dapat ditransfer ke rekening berikut:', M, doc.y);
    kv(doc, [['Bank', s.bank_name || '-'], ['No. Rekening', s.bank_account || '-'], ['Atas Nama', s.bank_holder || s.store_name]], M + 14, 320, 80);
    doc.moveDown(0.6);
  }
  doc.text('Demikian permohonan ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.', M, doc.y, { width: W, align: 'justify', lineGap: 2 });
  doc.moveDown(1.2);
  const h = 95; if (doc.y + h > doc.page.height - M) doc.addPage();
  const x = M + W - 200; const y = doc.y;
  doc.text(`${s.city ? s.city + ', ' : ''}${tgl(d.date)}`, x, y, { width: 200, align: 'center' });
  doc.text('Hormat kami,', x, doc.y, { width: 200, align: 'center' });
  const ly = y + 82;
  doc.moveTo(x + 20, ly).lineTo(x + 180, ly).lineWidth(0.5).strokeColor(INK).stroke();
  doc.font('Helvetica-Bold').text(s.signer_name || s.store_name, x, ly + 3, { width: 200, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(s.signer_title || '', x, doc.y, { width: 200, align: 'center' });
}

const KINDS = { invoice, delivery, 'payment-request': paymentRequest };
function render(kind, s, logo, d) {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, font: F('Regular.ttf'), info: { Title: `${kind} ${d.no}`, Author: s.store_name } });
  doc.registerFont('Helvetica', F('Regular.ttf'));
  doc.registerFont('Helvetica-Bold', F('Bold.ttf'));
  doc.registerFont('Helvetica-Oblique', F('Italic.ttf'));
  letterhead(doc, s, logo);
  d.docTitle = { invoice: 'Invoice', delivery: 'Surat Jalan', 'payment-request': 'Permohonan Pembayaran' }[kind];
  KINDS[kind](doc, s, d);
  FOOTER(doc, s, d);
  doc.end();
  return doc;
}
module.exports = { render, terbilang, KINDS };
