// Dokumen pendukung Penjualan INAPROC (SP, kontrak, BAST, dll). Banyak berkas per transaksi, tiap berkas punya judul.
// Berkas disimpan di database (base64) supaya ikut backup dan jalan di Vercel. Maks 4 MB per berkas.
const router = require('express').Router({ mergeParams: true });
const express = require('express');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err } = require('../services/util');

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DOCS = 50;
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain; charset=utf-8' };
const INLINE = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const extOf = (n) => (String(n).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1]?.toLowerCase();

router.use(auth, owner);
async function mySale(req) {
  const s = await db.one("SELECT id FROM sales WHERE id = ? AND store_id = ? AND kind <> 'POS'", [+req.params.id, req.sid]);
  if (!s) throw err(404, 'Penjualan faktur tidak ditemukan');
  return s.id;
}
const COLS = 'd.id, d.sale_id, d.type_id, d.title, d.file_name, d.mime, d.size, d.created_at, t.name AS type_name';

router.get('/', wrap(async (req, res) => {
  const id = await mySale(req);
  res.json({ rows: await db.query(`SELECT ${COLS} FROM sale_docs d LEFT JOIN doc_types t ON t.id = d.type_id WHERE d.sale_id = ? ORDER BY d.id`, [id]) });
}));

// Unggah satu berkas per permintaan: badan = isi berkas; ?name=<nama berkas>&title=<judul>&type_id=<jenis, kosong = Lainnya>
router.post('/', express.raw({ type: () => true, limit: MAX_BYTES + 1024 }), wrap(async (req, res) => {
  const sale_id = await mySale(req);
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw err(400, 'Berkas kosong');
  if (buf.length > MAX_BYTES) throw err(413, 'Ukuran berkas maksimal 4 MB');
  const file_name = String(req.query.name || '').replace(/[\\/\r\n]+/g, '_').trim().slice(0, 200);
  const ext = extOf(file_name);
  if (!file_name || !MIME[ext]) throw err(400, 'Jenis berkas tidak didukung (PDF, gambar, Word, Excel, PowerPoint, teks)');
  const title = String(req.query.title || '').trim().slice(0, 200);
  if (!title) throw err(400, 'Judul dokumen wajib diisi');
  let type_id = null;
  if (req.query.type_id) {
    type_id = +req.query.type_id;
    if (!(await db.one('SELECT id FROM doc_types WHERE id = ?', [type_id]))) throw err(400, 'Jenis dokumen tidak ditemukan');
  }
  if ((await db.one('SELECT COUNT(*) AS n FROM sale_docs WHERE sale_id = ?', [sale_id])).n >= MAX_DOCS) throw err(400, `Maksimal ${MAX_DOCS} dokumen per transaksi`);
  const id = await db.insert('sale_docs', { sale_id, type_id, title, file_name, mime: MIME[ext], size: buf.length, data: buf.toString('base64'), created_at: db.now(), user_id: req.user.id });
  res.status(201).json(await db.one(`SELECT ${COLS} FROM sale_docs d LEFT JOIN doc_types t ON t.id = d.type_id WHERE d.id = ?`, [id]));
}));

router.get('/:docId/file', wrap(async (req, res) => {
  const sale_id = await mySale(req);
  const d = await db.one('SELECT file_name, mime, data FROM sale_docs WHERE id = ? AND sale_id = ?', [+req.params.docId, sale_id]);
  if (!d) throw err(404, 'Dokumen tidak ditemukan');
  const inline = INLINE.includes(extOf(d.file_name));
  res.set({ 'Content-Type': d.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.file_name)}` });
  res.send(Buffer.from(d.data, 'base64'));
}));

router.put('/:docId', wrap(async (req, res) => {
  const sale_id = await mySale(req);
  const title = String((req.body || {}).title || '').trim().slice(0, 200);
  if (!title) throw err(400, 'Judul dokumen wajib diisi');
  const x = await db.exec('UPDATE sale_docs SET title = ? WHERE id = ? AND sale_id = ?', [title, +req.params.docId, sale_id]);
  if (!x.rowCount && !(await db.one('SELECT id FROM sale_docs WHERE id = ? AND sale_id = ?', [+req.params.docId, sale_id]))) throw err(404, 'Dokumen tidak ditemukan');
  res.json({ ok: true });
}));

router.delete('/:docId', wrap(async (req, res) => {
  const sale_id = await mySale(req);
  await db.exec('DELETE FROM sale_docs WHERE id = ? AND sale_id = ?', [+req.params.docId, sale_id]);
  res.json({ ok: true });
}));
module.exports = router;
