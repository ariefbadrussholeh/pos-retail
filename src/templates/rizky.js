// TEMPLATE "RIZKY" (Toko Rizky Nabila): mengikuti form nota Excel toko: kop berlogo RN di tengah, tabel berheader hijau stabilo,
// baris kosong sampai penuh, kotak catatan merah, "Tanda Terima" dan "Hormat Kami".
// Surat Jalan dan SPP didesain mengikuti palet yang sama (hijau stabilo + hijau tua untuk teks, hitam untuk isi).
// Tampilan tetap (logo di ./rizky, warna di konstanta C). Nama, alamat, telepon, rekening, dan penandatangan diambil dari Pengaturan toko.
const fs = require('fs');
const path = require('path');
const { num, qtyf, tgl, terbilang, taxLabel, pphLabel, refRows, markName, exemptNote } = require('./util');

const LOGO = (() => { try { return fs.readFileSync(path.join(__dirname, 'rizky', 'logo.jpg')); } catch (_) { return null; } })();
const C = { green: '#90FA26', dark: '#2E6B00', tint: '#F3FFE3', ink: '#111111', body: '#333333', line: '#B5B5B5', red: '#D61F1F' };
// Tampilkan baris PPH di invoice? false = PPH tidak dicetak (nilainya tetap masuk total bila PPH "ditambahkan", sebaiknya pakai "sudah termasuk"/tanpa PPH).
// Untuk menampilkan PPH lagi: ubah menjadi true.
const SHOW_PPH = true;
const NOTE = '* Barang yang sudah dibeli tidak bisa di tukar atau dikembalikan';

const PW = 595.28; const PH = 841.89; const X0 = 40; const X1 = PW - 40; const W = X1 - X0;
const LIMIT = 715;      // batas bawah isi (sisakan ruang tanda tangan di halaman terakhir)
const NEXT_TOP = 34;    // awal isi di halaman lanjutan

function decor(doc) { doc.rect(0, 0, PW, 7).fill(C.green); doc.rect(0, PH - 7, PW, 7).fill(C.green); }
function setup(doc) { doc.on('pageAdded', () => { decor(doc); doc.y = NEXT_TOP; }); decor(doc); }
function img(doc, buf, x, y, o) { if (!buf) return; try { doc.image(buf, x, y, o); } catch (_) { /* gambar rusak diabaikan */ } }
const text = (doc, t, x, y, o = {}) => doc.text(t, x, y, { lineBreak: false, ...o });

// Kop: logo kiri, judul + nama toko + alamat di tengah, garis ganda di bawahnya
function kop(doc, s, title, size = 17) {
  img(doc, LOGO, X0, 20, { fit: [92, 82] });
  const cx = X0 + 100; const cw = W - 200;
  doc.font('Helvetica-Bold').fontSize(size).fillColor(C.ink); text(doc, title, cx, size > 15 ? 30 : 32, { width: cw, align: 'center' });
  doc.fontSize(12.5); text(doc, String(s.store_name || '').toUpperCase(), cx, 54, { width: cw, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.body);
  const addr = [s.address, s.city].filter(Boolean).join(', ');
  text(doc, addr, cx, 73, { width: cw, align: 'center' });
  if (s.phone) { doc.font('Helvetica').fontSize(9); text(doc, 'Telp. ' + s.phone, cx, 87, { width: cw, align: 'center' }); }
  doc.lineWidth(1.6).strokeColor(C.ink).moveTo(X0, 108).lineTo(X1, 108).stroke();
  doc.lineWidth(0.5).moveTo(X0, 111.5).lineTo(X1, 111.5).stroke();
  return 122;
}
// Baris keterangan: [label kiri, nilai kiri, label kanan, nilai kanan]
function meta(doc, y, rows) {
  for (const [k1, v1, k2, v2] of rows) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink);
    text(doc, k1, X0, y, { width: 60 }); text(doc, ': ' + v1, X0 + 60, y, { width: k2 ? 230 : W - 60 });
    if (k2) { text(doc, k2, X0 + 305, y, { width: 62 }); text(doc, ': ' + v2, X0 + 367, y, { width: W - 367 }); }
    y += 16;
  }
  return y;
}

// Tabel berkisi: header hijau stabilo, tiap sel berbingkai. Mengisi baris kosong sampai minRows bila tidak pindah halaman.
function grid(doc, cols, rows, y0, minRows = 0) {
  const fixed = cols.reduce((a, c) => a + (c.w || 0), 0); const flex = cols.filter((c) => !c.w);
  flex.forEach((c) => { c.w = (W - fixed) / flex.length; });
  const pad = 5; const HH = 22; const RH = 21;
  const header = (y) => {
    let x = X0;
    for (const c of cols) { doc.rect(x, y, c.w, HH).fillAndStroke(C.green, C.ink); doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9.5); text(doc, c.label, x + pad, y + 6.5, { width: c.w - 2 * pad, align: 'center' }); x += c.w; }
    return y + HH;
  };
  const cell = (x, y, w, h, t, o = {}) => {
    doc.lineWidth(0.5).strokeColor(C.line).rect(x, y, w, h).stroke();
    if (t !== '' && t != null) { doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 10).fillColor(C.ink).text(String(t), x + pad, y + 6, { width: w - 2 * pad, align: o.align || 'left' }); }
  };
  let top = y0; let y = header(y0); let paged = false;
  const outline = () => { doc.lineWidth(0.9).strokeColor(C.ink).rect(X0, top, W, y - top).stroke(); };
  const empty = (n) => { for (let i = 0; i < n; i++) { let x = X0; for (const c of cols) { cell(x, y, c.w, RH, ''); x += c.w; } y += RH; } };
  for (const r of rows) {
    doc.font('Helvetica').fontSize(10);
    const h = Math.max(RH, Math.max(...cols.map((c) => doc.heightOfString(String(r[c.key] ?? ''), { width: c.w - 2 * pad, align: c.align || 'left' }))) + 12);
    if (y + h > LIMIT) { outline(); doc.addPage(); paged = true; top = NEXT_TOP; y = header(top); }
    let x = X0;
    for (const c of cols) { cell(x, y, c.w, h, r[c.key] ?? '', { align: c.align }); x += c.w; }
    y += h;
  }
  if (!paged && rows.length < minRows) empty(Math.min(minRows - rows.length, Math.floor((LIMIT - 60 - y) / RH)));
  outline();
  return y;
}
// Baris ringkasan di bawah tabel: label rata kanan melintasi dua kolom terakhir, nilai di kolom terakhir
function totals(doc, cols, y, list) {
  const lw = cols[cols.length - 1].w; const kw = cols[cols.length - 2].w + (cols.length > 2 ? cols[cols.length - 3].w : 0);
  const xv = X1 - lw; const xk = xv - kw;
  for (const [k, v, strong] of list) {
    if (strong) doc.rect(xk, y, kw + lw, 22).fillAndStroke(C.green, C.ink); else doc.lineWidth(0.5).strokeColor(C.ink).rect(xk, y, kw + lw, 22).stroke();
    doc.lineWidth(0.5).strokeColor(C.ink).moveTo(xv, y).lineTo(xv, y + 22).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink);
    text(doc, k, xk + 6, y + 6.5, { width: kw - 12, align: 'right' });
    text(doc, (v < 0 ? '- ' : '') + num(Math.abs(v)), xv + 5, y + 6.5, { width: lw - 10, align: 'right' });
    y += 22;
  }
  return y;
}
function room(doc, y, h) { if (y + h > PH - 20) { doc.addPage(); return NEXT_TOP + 6; } return y; }
function noteBox(doc, x, y) {
  doc.lineWidth(1).strokeColor(C.red).roundedRect(x, y, 205, 30, 7).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.ink).text(NOTE, x + 8, y + 6, { width: 190, align: 'left' });
}
// Blok tanda tangan: [{label, name}] rata antara kiri-kanan
function signs(doc, y, list) {
  y = room(doc, y, 100);
  const n = list.length; const w = W / n;
  list.forEach((p, i) => {
    const cx = X0 + w * i + w / 2;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink); text(doc, p.label, cx - 80, y, { width: 160, align: 'center' });
    if (p.name) { doc.font('Helvetica-Bold').text(p.name, cx - 80, y + 62, { width: 160, align: 'center', underline: true }); if (p.title) doc.font('Helvetica').fontSize(9).text(p.title, cx - 80, doc.y, { width: 160, align: 'center' }); }
    else { doc.font('Helvetica').fontSize(10).fillColor(C.body); text(doc, '(.................................)', cx - 80, y + 62, { width: 160, align: 'center' }); }
  });
  return y + 90;
}

function invoice(doc, s, d) {
  setup(doc);
  let y = kop(doc, s, d.side === 'purchase' ? 'NOTA PEMBELIAN' : 'NOTA PENJUALAN');
  const rows = [['No', d.no, 'Tanggal', tgl(d.date)], ['Nama', d.party.name || '-', d.due_date ? 'Jatuh Tempo' : '', d.due_date ? tgl(d.due_date) : '']];
  for (const [k, v] of refRows(d)) rows.push([k.replace('No. Kontrak / SP', 'No. SP'), v]);
  y = meta(doc, y, rows) + 4;
  const cols = [{ key: 'n', label: 'NO', w: 32, align: 'center' }, { key: 'name', label: 'NAMA BARANG' }, { key: 'qty', label: 'JUMLAH', w: 70, align: 'center' }, { key: 'price', label: 'HARGA SATUAN', w: 88, align: 'right' }, { key: 'total', label: 'TOTAL', w: 98, align: 'right' }];
  const items = d.items.map((i, n) => ({ n: n + 1, name: markName(d, i), qty: qtyf(i.qty) + (i.unit ? ' ' + i.unit : ''), price: num(i.price), total: num(i.total) }));
  y = grid(doc, cols, items, y, 12);
  const list = [];
  if (d.tax || (SHOW_PPH && d.pph)) list.push(['SUB TOTAL', d.subtotal]);
  if (d.tax) list.push([taxLabel(s, d).toUpperCase(), d.tax]);
  if (SHOW_PPH && d.pph) list.push([pphLabel(d).toUpperCase(), d.pph]);
  list.push(['JUMLAH', d.total, true]);
  if (d.paid && d.paid < d.total) { list.push(['DIBAYAR', d.paid]); list.push(['SISA', d.total - d.paid, true]); }
  y = room(doc, y, list.length * 22 + 150);
  y = totals(doc, cols, y, list) + 8;
  { const en = exemptNote(d); if (en) { doc.font('Helvetica').fontSize(8.5).fillColor(C.body); text(doc, en, X0, y); y += 12; } }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark); text(doc, 'Terbilang:', X0, y);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.body).text(terbilang(d.total), X0 + 50, y, { width: W - 50 }); y = doc.y + 8;
  if (d.side !== 'purchase') noteBox(doc, X0, y);
  if (d.side !== 'purchase' && (s.bank_name || s.bank_account)) {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.body);
    doc.text(`Pembayaran: ${s.bank_name || ''} ${s.bank_account || ''}${s.bank_holder ? ' a/n ' + s.bank_holder : ''}`.replace(/\s+/g, ' '), X0 + 220, y + 6, { width: W - 220 });
  }
  if (s.doc_note) { doc.font('Helvetica').fontSize(8).fillColor(C.body).text(s.doc_note, X0 + 220, y + (s.bank_account ? 20 : 6), { width: W - 220 }); }
  signs(doc, y + 42, [{ label: 'Tanda Terima' }, { label: 'Hormat Kami', name: s.signer_name || '', title: s.signer_name ? s.signer_title : '' }]);
}

function delivery(doc, s, d) {
  setup(doc);
  let y = kop(doc, s, 'SURAT JALAN');
  const rows = [['No', 'SJ/' + d.no, 'Tanggal', tgl(d.date)], ['Kepada', d.party.name || '-']];
  if (d.party.address) rows.push(['Alamat', d.party.address]);
  for (const [k, v] of refRows(d)) rows.push([k.replace('No. Kontrak / SP', 'No. SP'), v]);
  y = meta(doc, y, rows) + 4;
  const cols = [{ key: 'n', label: 'NO', w: 32, align: 'center' }, { key: 'name', label: 'NAMA BARANG' }, { key: 'qty', label: 'JUMLAH', w: 70, align: 'center' }, { key: 'unit', label: 'SATUAN', w: 70, align: 'center' }, { key: 'note', label: 'KETERANGAN', w: 120 }];
  y = grid(doc, cols, d.items.map((i, n) => ({ n: n + 1, name: i.name, qty: qtyf(i.qty), unit: i.unit || '', note: '' })), y, 12) + 10;
  doc.font('Helvetica').fontSize(8.5).fillColor(C.body).text('Barang telah diterima dalam keadaan baik dan jumlah sesuai.', X0, y, { width: W });
  signs(doc, doc.y + 14, [{ label: 'Penerima' }, { label: 'Hormat Kami', name: s.signer_name || '', title: s.signer_name ? s.signer_title : '' }]);
}

function paymentRequest(doc, s, d) {
  setup(doc);
  let y = kop(doc, s, 'SURAT PERMOHONAN PEMBAYARAN', 13);
  const owed = Math.max(d.total - d.paid, 0);
  y += 2;
  const row = (k, v, o = {}) => {
    doc.font('Helvetica').fontSize(10).fillColor(C.ink); text(doc, k, X0, y, { width: 110 }); text(doc, ':', X0 + 110, y);
    doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').text(v, X0 + 122, y, { width: W - 122, underline: !!o.underline });
    y = Math.max(doc.y, y + 14);
  };
  row('Nomor', d.no); row('Lampiran', '1 (satu) berkas'); row('Perihal', 'Permohonan Pembayaran', { bold: true, underline: true });
  for (const [k, v] of refRows(d)) row(k, v);
  y += 10;
  doc.font('Helvetica').fontSize(10).fillColor(C.ink); text(doc, 'Kepada Yth.', X0, y); y += 14;
  const to = d.spp_to || `Kepala ${d.party.name || ''}${d.party.address ? '\n' + d.party.address : ''}`;
  doc.text(to, X0, y, { width: 330 }); y = doc.y + 12;
  text(doc, 'Yang bertanda tangan di bawah ini :', X0, y); y += 18;
  row('Nama', s.signer_name || '-'); row('Jabatan', s.signer_title || '-'); row('Nama Perusahaan', s.store_name);
  row('Alamat', [s.address, s.city].filter(Boolean).join(', ') || '-');
  if (s.bank_account) row(`No. Rekening ${s.bank_name || ''}`.trim(), `${s.bank_account}${s.bank_name ? ' (' + s.bank_name + ')' : ''}`);
  y += 10;
  const ref = d.contract_no ? `Kontrak/Surat Pesanan ${d.contract_no}` : `transaksi ${d.no}`;
  doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(`Sehubungan dengan pekerjaan dengan ${ref} Tahun Anggaran ${String(d.date).slice(0, 4)}, dengan nilai tagihan sebagai berikut:`, X0, y, { width: W, lineGap: 2 }); y = doc.y + 10;
  // kotak nilai tagihan: pita hijau stabilo di kiri
  doc.rect(X0, y, W, 44).fill(C.tint); doc.rect(X0, y, 7, 44).fill(C.green);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark); text(doc, 'NILAI TAGIHAN', X0 + 18, y + 7);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.ink); text(doc, 'Rp ' + num(owed), X0 + 18, y + 21);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.body).text(terbilang(owed), X0 + 200, y + 9, { width: W - 212 });
  y += 64;
  doc.font('Helvetica').fontSize(10).fillColor(C.ink).text('Demikian permohonan kami atas perhatian serta kerjasamanya kami ucapkan terimakasih.', X0, y, { width: W }); y = doc.y + 22;
  y = room(doc, y, 110);
  doc.font('Helvetica').fontSize(10).fillColor(C.ink); text(doc, 'Hormat kami,', X0, y); text(doc, s.store_name, X0, y + 14, { width: 260 });
  doc.font('Helvetica-Bold').text(s.signer_name || '(.................................)', X0, y + 70, { width: 260, underline: !!s.signer_name });
  doc.font('Helvetica').text(s.signer_title || '', X0, doc.y, { width: 260 });
}
const KINDS = { invoice, delivery, 'payment-request': paymentRequest };
// Dipanggil oleh services/pdf.js (halaman tanpa margin; semua posisi diatur di file ini).
function draw(doc, kind, s, d) { KINDS[kind](doc, s, d); }
module.exports = { label: 'Rizky Nabila (hijau stabilo)', margin: 0, draw };
