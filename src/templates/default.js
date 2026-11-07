// TEMPLATE BAWAAN: Invoice ("Nota Penjualan"), Surat Jalan, Permohonan Pembayaran (penjualan & pembelian).
// Dipakai semua toko yang belum memilih template lain. Warna & logo: logo dari Pengaturan toko, warna di bawah ini.
const { rp, qtyf, tgl, terbilang, taxLabel, pphLabel, refRows } = require('./util');
const settings = require('../services/settings');

const ACCENT = '#E8710A'; // warna header tabel invoice

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
    doc.rect(M, y, W, h).fill(o.accent || BAND);
    doc.fillColor(o.accent ? '#ffffff' : INK).font('Helvetica-Bold').fontSize(fs);
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
    if (o.grid) { let gx = M; for (let k = 0; k <= cols.length; k++) { doc.moveTo(gx, y).lineTo(gx, y + h).lineWidth(0.3).strokeColor(LINE).stroke(); gx += (cols[k] || {}).w || 0; } }
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

// Invoice bawaan: mengikuti layout "Nota Penjualan" (judul tengah, tabel header warna aksen, Tanda Terima / Hormat Kami)
function invoice(doc, s, d, logo) {
  const accent = ACCENT;
  const W = doc.page.width - 2 * M;
  const y0 = M; let x = M;
  if (logo) { try { doc.image(logo, M, y0, { fit: [66, 66] }); } catch (_) {} }
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(d.titles.invoice, M, y0 + 2, { width: W, align: 'center' });
  doc.fontSize(11.5).text(s.store_name, M, doc.y + 1, { width: W, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const addr = [s.address, s.city].filter(Boolean).join(', ');
  if (addr) doc.text(addr, M, doc.y, { width: W, align: 'center' });
  const contact = [s.phone && 'Telp. ' + s.phone, s.email, s.npwp && 'NPWP ' + s.npwp].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact, M, doc.y, { width: W, align: 'center' });
  const yl = Math.max(doc.y, y0 + 68) + 6;
  doc.moveTo(M, yl).lineTo(M + W, yl).lineWidth(1.4).strokeColor(INK).stroke();
  doc.moveTo(M, yl + 2.5).lineTo(M + W, yl + 2.5).lineWidth(0.4).strokeColor(INK).stroke();
  doc.y = yl + 12; doc.x = M;
  // identitas: kiri (No, Nama, alamat, kontrak) | kanan (Tanggal, jatuh tempo)
  const ym = doc.y; const wl = W * 0.6;
  const left = [['No', d.no], [d.side === 'purchase' ? 'Pemasok' : 'Nama', d.party.name]];
  if (d.party.address) left.push(['Alamat', d.party.address]);
  left.push(...refRows(d));
  kv(doc, left, M, wl, 92);
  const yEndL = doc.y; doc.y = ym;
  const right = [['Tanggal', tgl(d.date)]];
  if (d.due_date) right.push(['Jatuh Tempo', tgl(d.due_date)]);
  kv(doc, right, M + W * 0.62, W * 0.38, 70);
  doc.y = Math.max(yEndL, doc.y) + 8; doc.x = M;

  const anyDisc = d.items.some((i) => i.discount);
  const rows = d.items.map((i, n) => ({ n: n + 1, name: i.name, qty: qtyf(i.qty) + ' ' + (i.unit || ''), price: rp(i.price), disc: i.discount ? rp(i.discount) : '-', total: rp(i.total) }));
  const cols = [{ key: 'n', label: 'NO', w: 30, align: 'center' }, { key: 'name', label: 'NAMA BARANG' }, { key: 'qty', label: 'JUMLAH', w: 70, align: 'center' }, { key: 'price', label: 'HARGA SATUAN', w: 88, align: 'right' }];
  if (anyDisc) cols.push({ key: 'disc', label: 'DISKON', w: 65, align: 'right' });
  cols.push({ key: 'total', label: 'TOTAL', w: 92, align: 'right' });
  table(doc, cols, rows, { accent, grid: true });

  const t = [];
  if (d.tax || d.pph || d.discount) t.push(['Sub Total', rp(d.subtotal)]);
  if (d.discount) t.push(['Diskon', '- ' + rp(d.discount)]);
  if (d.tax) t.push([taxLabel(s, d), rp(d.tax)]);
  if (d.pph) t.push([pphLabel(d), rp(d.pph)]);
  t.push([d.tax || d.pph || d.discount ? 'TOTAL' : 'JUMLAH', rp(d.total), true]);
  if (d.paid && d.paid < d.total) { t.push(['Dibayar', rp(d.paid)]); t.push(['Sisa tagihan', rp(d.total - d.paid), true]); }
  const yTot = doc.y;
  totalsBox(doc, t);
  // catatan di kiri (kotak merah) sejajar total
  const note = s.doc_note || '* Barang yang sudah dibeli tidak bisa ditukar atau dikembalikan';
  const yAfter = doc.y;
  doc.font('Helvetica').fontSize(8);
  const nh = doc.heightOfString(note, { width: 200 }) + 10;
  doc.roundedRect(M, yTot + 2, 215, nh, 6).lineWidth(0.8).strokeColor('#D32F2F').stroke();
  doc.fillColor('#333333').text(note, M + 8, yTot + 7, { width: 200 });
  doc.y = Math.max(yAfter, yTot + nh + 6); doc.x = M;
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK).text('Terbilang: ' + terbilang(d.total), M, doc.y, { width: W });
  doc.moveDown(0.5);
  paymentInfo(doc, s, d);
  signatures(doc, d.sig.invoice.length === 2 ? ['Tanda Terima', 'Hormat Kami'] : d.sig.invoice, [null, d.sig.invoice.length === 2 ? s.signer_name : null]);
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
  kv(doc, [['Tanggal', tgl(d.date)], ['Lampiran', '1 (satu) berkas ' + (d.side === 'sale' ? 'invoice' : 'rincian pembelian')], ['Perihal', 'Permohonan Pembayaran'], ...refRows(d)], M, 330, 95);
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
    ? `Bersama surat ini kami, ${s.store_name}, mengajukan permohonan pembayaran atas transaksi pembelian barang${d.contract_no ? ' sehubungan dengan Kontrak / Surat Pesanan No. ' + d.contract_no : ''} sebagaimana rincian berikut:`
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
// Dipanggil oleh services/pdf.js. doc = PDFDocument (margin M), s = pengaturan toko, d = data dokumen.
function draw(doc, kind, s, d) {
  const logo = settings.toBuffer(s.logo);
  if (kind !== 'invoice') letterhead(doc, s, logo);
  KINDS[kind](doc, s, d, logo);
  FOOTER(doc, s, d);
}
module.exports = { label: 'Bawaan', margin: M, draw };
