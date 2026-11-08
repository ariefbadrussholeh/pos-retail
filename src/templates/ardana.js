// TEMPLATE "ARDANA" (CV Ardana Jaya Sejahtera): kop berlogo, ornamen kanan atas, strip footer penuh, ucapan terima kasih.
// Tampilan tetap (logo, warna, ornamen ada di folder ./ardana dan konstanta di bawah). Nama, alamat, telepon,
// rekening, dan penandatangan tetap diambil dari Pengaturan toko. Dipilih per toko di Pengaturan > Template dokumen.
const fs = require('fs');
const path = require('path');
const { num, qtyf, tgl, terbilang, taxLabel, pphLabel, refRows, markName, exemptNote } = require('./util');

const A = (f) => fs.readFileSync(path.join(__dirname, 'ardana', f)); // gambar template
const IMG = { logo: A('logo.png'), header: A('header.png'), footer: A('footer.png'), icon: A('phone.png') };
const COLOR = { accent: '#F47920', navy: '#1F3864' };
const THANKS = ['TERIMA KASIH', 'ATAS PEMBELIAN ANDA'];

const PW = 595.28; const PH = 841.89; const X0 = 50; const X1 = PW - 50; const W = X1 - X0;
const LIMIT = 700;      // batas bawah isi (di atas ornamen bawah)
const FOOT_H = PW * 263 / 1400; // tinggi strip footer saat selebar halaman
const NEXT_TOP = 150;   // awal isi di halaman lanjutan (di bawah ornamen atas)

function palette() {
  return { accent: COLOR.accent, navy: COLOR.navy, ink: '#222222', body: '#4A4A4A', line: '#9A9A9A', shade: '#F2F2F2' };
}
// Referensi untuk kop kanan: label singkat agar tidak membungkus
function metaRefs(d) {
  const r = [];
  if (d.contract_no) r.push(['No. Kontrak/SP', d.contract_no]);
  if (d.contract_date) r.push(['Tgl. Kontrak/SP', tgl(d.contract_date)]);
  return r;
}
function img(doc, buf, x, y, o) { if (!buf) return; try { doc.image(buf, x, y, o); } catch (_) { /* gambar rusak diabaikan */ } }

// Ornamen & ucapan di setiap halaman
function decor(doc, s, imgs, P) {
  img(doc, imgs.header, PW - 190, 0, { width: 190 });
  img(doc, imgs.footer, 0, PH - FOOT_H, { width: PW }); // strip penuh lebar halaman, tanpa margin
  const phone = s.phone;
  if (phone) {
    img(doc, imgs.icon, 62, PH - 62, { width: 13 });
    doc.font('Helvetica').fontSize(8.5).fillColor(P.ink).text(phone, imgs.icon ? 80 : 62, PH - 60, { lineBreak: false });
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(P.navy);
  THANKS.forEach((l, i) => doc.text(l, 62, PH - FOOT_H - (THANKS.length - i) * 11 - 2, { lineBreak: false }));
}
function setup(doc, s, imgs) {
  const P = palette();
  doc.on('pageAdded', () => { decor(doc, s, imgs, P); doc.y = NEXT_TOP; });
  decor(doc, s, imgs, P);
  return P;
}
function head(doc, s, imgs, P, title, meta) {
  if (imgs.logo) img(doc, imgs.logo, X0, 30, { fit: [150, 80] });
  else doc.font('Helvetica-Bold').fontSize(16).fillColor(P.navy).text(s.store_name, X0, 46, { width: 260 });
  const addr = [s.address, s.city].filter(Boolean).join(', ');
  doc.font('Helvetica').fontSize(8.5).fillColor(P.body).text(addr, X0 + 2, 112, { width: 270 });
  doc.font('Helvetica-Bold').fontSize(19).fillColor(P.accent).text(title, 300, 62, { width: 215, align: 'right', lineBreak: false });
  let y = 96;
  for (const [k, v] of meta) {
    doc.font('Helvetica').fontSize(8.5).fillColor(P.navy).text(k, 330, y, { width: 68, lineBreak: false });
    doc.text(': ' + v, 398, y, { width: 147 });
    y = Math.max(doc.y, y + 12);
  }
  return Math.max(y, 126);
}
function party(doc, P, label, d, y) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(P.accent).text(label, X0, y, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(P.body).text(d.party.name || '-', X0, y + 17, { width: 270 });
  doc.font('Helvetica').fontSize(8.5);
  if (d.party.address) doc.text(d.party.address, X0, doc.y, { width: 270 });
  if (d.party.phone) doc.text('Telp. ' + d.party.phone, X0, doc.y, { width: 270 });
  return doc.y;
}
// Tabel: kolom berbayang (shade) seperti form asli; header berulang tidak diperlukan (hanya 1 baris judul per halaman)
function table(doc, P, cols, rows, y0) {
  const fixed = cols.reduce((a, c) => a + (c.w || 0), 0); const flex = cols.filter((c) => !c.w);
  flex.forEach((c) => { c.w = (W - fixed) / flex.length; });
  const pad = 5;
  const header = (y) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(P.ink);
    let x = X0;
    for (const c of cols) { if (c.shade) doc.rect(x, y, c.w, 22).fill(P.shade); doc.fillColor(P.ink).text(c.label, x + pad, y + 7, { width: c.w - 2 * pad, align: c.align === 'right' ? 'right' : 'center', lineBreak: false }); x += c.w; }
    doc.moveTo(X0, y + 22).lineTo(X1, y + 22).lineWidth(0.8).strokeColor(P.ink).stroke();
    return y + 22;
  };
  let y = header(y0);
  doc.font('Helvetica').fontSize(8.5);
  for (const r of rows) {
    const h = Math.max(22, Math.max(...cols.map((c) => doc.heightOfString(String(r[c.key] ?? ''), { width: c.w - 2 * pad, align: c.align || 'left' }))) + 12);
    if (y + h > LIMIT) { doc.addPage(); y = header(NEXT_TOP); doc.font('Helvetica').fontSize(8.5); }
    let x = X0;
    for (const c of cols) {
      if (c.shade) doc.rect(x, y, c.w, h).fill(P.shade);
      doc.fillColor(P.body).text(String(r[c.key] ?? ''), x + pad, y + 7, { width: c.w - 2 * pad, align: c.align || 'left' });
      x += c.w;
    }
    doc.moveTo(X0, y + h).lineTo(X1, y + h).lineWidth(0.4).strokeColor(P.line).stroke();
    y += h;
  }
  return y;
}
function room(doc, y, h) { if (y + h > LIMIT) { doc.addPage(); return NEXT_TOP; } return y; }
function signatures(doc, P, y, left, rightLabel, name, title) {
  y = room(doc, y, 100);
  doc.font('Helvetica').fontSize(9).fillColor(P.body);
  if (left) doc.text(left, X0 + 70, y, { width: 110, align: 'center' });
  doc.text(rightLabel, X1 - 170, y, { width: 150, align: 'center' });
  if (name) { doc.font('Helvetica-Bold').fillColor(P.ink).text(name, X1 - 170, y + 62, { width: 150, align: 'center', underline: !!title }); }
  if (title) doc.font('Helvetica').fillColor(P.body).text(title, X1 - 170, doc.y, { width: 150, align: 'center' });
  return y + 100;
}

function invoice(doc, s, d, imgs) {
  const P = setup(doc, s, imgs);
  const meta = [['Invoice No', d.no], ['Tanggal', tgl(d.date)]];
  if (d.due_date) meta.push(['Jatuh Tempo', tgl(d.due_date)]);
  meta.push(...metaRefs(d));
  let y = head(doc, s, imgs, P, 'INVOICE', meta) + 14;
  y = Math.max(party(doc, P, d.side === 'purchase' ? 'PEMASOK:' : 'DITUJUKAN KEPADA:', d, Math.max(y, 140)), y);
  const any = d.items.some((i) => i.discount);
  const cols = [{ key: 'n', label: 'No.', w: 30, align: 'center' }, { key: 'name', label: 'Nama Barang' }, { key: 'qty', label: 'Qty', w: 45, align: 'center', shade: true }, { key: 'unit', label: 'Satuan', w: 50, align: 'center' }, { key: 'price', label: 'Harga Satuan', w: 82, align: 'right', shade: true }];
  if (any) cols.push({ key: 'disc', label: 'Diskon', w: 62, align: 'right' });
  cols.push({ key: 'total', label: 'Jumlah', w: 88, align: 'right', shade: !any });
  const rows = d.items.map((i, n) => ({ n: n + 1, name: markName(d, i), qty: qtyf(i.qty), unit: i.unit || '', price: num(i.price), disc: i.discount ? num(i.discount) : '-', total: num(i.total) }));
  y = table(doc, P, cols, rows, Math.max(y + 18, 200)) + 8;
  { const en = exemptNote(d); if (en) { doc.font('Helvetica').fontSize(8).fillColor(P.body).text(en, X0, y - 4, { lineBreak: false }); y += 10; } }

  // ringkasan kanan, detail pembayaran kiri
  const tot = [['Sub Total', d.subtotal]];
  if (d.discount) tot.push(['Diskon', -d.discount]);
  if (d.tax) tot.push([taxLabel(s, d), d.tax]);
  if (d.pph) tot.push([pphLabel(d), d.pph]);
  tot.push(['Total', d.total, true]);
  if (d.paid && d.paid < d.total) { tot.push(['Dibayar', d.paid]); tot.push(['Sisa', d.total - d.paid, true]); }
  const bh = tot.length * 20 + 4; y = room(doc, y, Math.max(bh, 80) + 130);
  const bx = X1 - 215;
  doc.lineWidth(0.8).strokeColor(P.ink);
  tot.forEach(([k, v, bold], i) => {
    const ry = y + i * 20;
    doc.rect(bx, ry, 215, 20).stroke();
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(P.ink);
    doc.text(k, bx + 4, ry + 6, { width: 100, align: 'center', lineBreak: false });
    doc.text('Rp', bx + 112, ry + 6, { lineBreak: false });
    doc.text((v < 0 ? '- ' : '') + num(Math.abs(v)), bx + 125, ry + 6, { width: 85, align: 'right', lineBreak: false });
  });
  if (d.side !== 'purchase' && (s.bank_name || s.bank_account)) {
    doc.rect(X0, y, 190, 20).fill(P.navy);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text('Detail Pembayaran:', X0 + 6, y + 6, { lineBreak: false });
    doc.rect(X0, y + 20, 190, 52).lineWidth(0.8).strokeColor(P.navy).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(P.body);
    doc.text(`Nama Bank : ${s.bank_name || '-'}`, X0 + 6, y + 26, { width: 180 });
    doc.text(`No Rekening : ${s.bank_account || '-'}`, X0 + 6, doc.y, { width: 180 });
    doc.text(`a/n. : ${s.bank_holder || s.store_name}`, X0 + 6, doc.y, { width: 180 });
  }
  y += Math.max(bh, 80) + 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(P.navy).text('Terbilang:', X0, y, { lineBreak: false });
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(P.body).text(terbilang(d.total), X0 + 52, y, { width: W - 52 });
  y = doc.y + 6;
  if (s.doc_note) { doc.font('Helvetica').fontSize(8).fillColor(P.body).text(s.doc_note, X0, y, { width: W }); y = doc.y + 4; }
  signatures(doc, P, y + 6, 'Penerima', 'Dengan hormat,', s.signer_name);
}

function delivery(doc, s, d, imgs) {
  const P = setup(doc, s, imgs);
  const meta = [['No', 'SJ/' + d.no], ['Tanggal', tgl(d.date)]];
  meta.push(...metaRefs(d));
  let y = head(doc, s, imgs, P, 'SURAT JALAN', meta) + 14;
  y = Math.max(party(doc, P, d.side === 'purchase' ? 'PEMASOK:' : 'DITUJUKAN KEPADA:', d, Math.max(y, 140)), y);
  const cols = [{ key: 'n', label: 'No.', w: 30, align: 'center' }, { key: 'name', label: 'Nama Barang' }, { key: 'qty', label: 'Qty', w: 55, align: 'center', shade: true }, { key: 'unit', label: 'Satuan', w: 60, align: 'center' }, { key: 'note', label: 'Keterangan', w: 120, shade: true }];
  const rows = d.items.map((i, n) => ({ n: n + 1, name: i.name, qty: qtyf(i.qty), unit: i.unit || '', note: '' }));
  y = table(doc, P, cols, rows, Math.max(y + 18, 200)) + 14;
  signatures(doc, P, y, 'Penerima', 'Dengan hormat,', s.signer_name);
}

function paymentRequest(doc, s, d, imgs) {
  const P = setup(doc, s, imgs);
  const owed = Math.max(d.total - d.paid, 0);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(P.accent).text('SPP', 300, 62, { width: 215, align: 'right', lineBreak: false });
  if (imgs.logo) img(doc, imgs.logo, X0, 30, { fit: [150, 80] });
  else doc.font('Helvetica-Bold').fontSize(16).fillColor(P.navy).text(s.store_name, X0, 46, { width: 260 });
  doc.font('Helvetica').fontSize(8.5).fillColor(P.body).text([s.address, s.city].filter(Boolean).join(', '), X0 + 2, 112, { width: 270 });
  let y = 150;
  const row = (k, v, o = {}) => {
    doc.font('Helvetica').fontSize(9).fillColor(P.ink).text(k, X0 + 2, y, { width: 120, lineBreak: false });
    doc.text(': ', X0 + 122, y, { continued: true, lineBreak: false });
    doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').text(v, { width: W - 130, underline: !!o.underline, continued: false });
    y = Math.max(doc.y, y + 13);
  };
  row('Nomor', d.no); row('Lampiran', '1 (satu) berkas'); row('Perihal', 'Permohonan Pembayaran', { bold: true, underline: true });
  for (const [k, v] of refRows(d)) row(k, v);
  y += 14;
  doc.font('Helvetica').fontSize(9).fillColor(P.body).text('Kepada Yth.', X0 + 2, y, { lineBreak: false });
  y += 13;
  const to = d.spp_to || `Kepala ${d.party.name || ''}${d.party.address ? '\n' + d.party.address : ''}`;
  doc.text(to, X0 + 2, y, { width: 320 }); y = doc.y + 14;
  doc.fillColor(P.ink).text('Yang bertanda tangan di bawah ini :', X0 + 2, y, { lineBreak: false }); y += 20;
  row('Nama', s.signer_name || '-'); row('Jabatan', s.signer_title || '-'); row('Nama Perusahaan', s.store_name);
  row('Alamat', [s.address, s.city].filter(Boolean).join(', ') || '-');
  if (s.bank_account) row(`No. Rekening ${s.bank_name || ''}`.trim(), `${s.bank_account}${s.bank_name ? ' (' + s.bank_name + ')' : ''}`);
  y += 14;
  const ref = d.contract_no ? `Kontrak/Surat Pesanan ${d.contract_no}` : `transaksi ${d.no}`;
  const para = `Sehubungan dengan pekerjaan dengan ${ref} Tahun Anggaran ${String(d.date).slice(0, 4)}, dengan Nilai Tagihan sebesar : Rp. ${num(owed)} ( ${terbilang(owed).replace(' rupiah', ' rupiah')} )`;
  doc.font('Helvetica').fontSize(9).fillColor(P.ink).text(para, X0 + 2, y, { width: W - 4, lineGap: 2 }); y = doc.y + 24;
  doc.text('Demikian permohonan kami atas perhatian serta kerjasamanya kami ucapkan terimakasih', X0 + 2, y, { width: W - 4 }); y = doc.y + 24;
  y = room(doc, y, 110);
  doc.font('Helvetica').text(s.store_name, X0 + 2, y, { width: 260 });
  doc.font('Helvetica-Bold').text(s.signer_name || '', X0 + 2, y + 62, { width: 260, underline: true });
  doc.font('Helvetica').text(s.signer_title || '', X0 + 2, doc.y, { width: 260 });
}
const KINDS = { invoice, delivery, 'payment-request': paymentRequest };
// Dipanggil oleh services/pdf.js (halaman tanpa margin; semua posisi diatur di file ini).
function draw(doc, kind, s, d) { KINDS[kind](doc, s, d, IMG); }
module.exports = { label: 'Ardana', margin: 0, draw };
