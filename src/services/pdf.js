// Membuat PDF dokumen memakai template yang dipilih toko (Pengaturan > Template dokumen).
// Daftar & cara menambah template: src/templates/index.js
const PDFDocument = require('pdfkit');
const templates = require('../templates');
const { F, terbilang } = require('../templates/util');

const KINDS = { invoice: 1, delivery: 1, 'payment-request': 1 };
function render(kind, s, d) {
  const T = templates[s.doc_template] || templates.default;
  const doc = new PDFDocument({ size: 'A4', margin: T.margin, bufferPages: true, font: F('Regular.ttf'), info: { Title: `${kind} ${d.no}`, Author: s.store_name } });
  doc.registerFont('Helvetica', F('Regular.ttf'));
  doc.registerFont('Helvetica-Bold', F('Bold.ttf'));
  doc.registerFont('Helvetica-Oblique', F('Italic.ttf'));
  d.docTitle = { invoice: 'Invoice', delivery: 'Surat Jalan', 'payment-request': 'Permohonan Pembayaran' }[kind];
  T.draw(doc, kind, s, d);
  doc.end();
  return doc;
}
module.exports = { render, terbilang, KINDS };
