const express = require('express');
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, like, nextNo, range, page, ymd } = require('../services/util');
const stock = require('../services/stock');

const purchases = express.Router();
const receipts = express.Router();
purchases.use(auth, owner);
receipts.use(auth, owner);

async function loadPurchase(id, sid) {
  const p = await db.one('SELECT p.*, s.name AS supplier_name, s.address AS supplier_address, s.phone AS supplier_phone, s.contact AS supplier_contact FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ? AND p.store_id = ?', [id, sid]);
  if (!p) return null;
  p.items = await db.query('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id', [id]);
  p.receipts = await db.query('SELECT id, gr_no, date, supplier_do, status FROM goods_receipts WHERE purchase_id = ? ORDER BY id', [id]);
  p.payments = await db.query("SELECT * FROM payments WHERE ref_type = 'PURCHASE' AND ref_id = ? ORDER BY id", [id]);
  p.outstanding = round2(p.status === 'CANCELLED' ? 0 : Math.max(p.total - p.paid, 0));
  return p;
}

async function buildLines(t, sid, items) {
  if (!Array.isArray(items) || !items.length) throw err(400, 'Isi minimal satu barang');
  const lines = []; let subtotal = 0;
  for (const i of items) {
    const p = await t.one('SELECT id, sku, name, unit FROM products WHERE id = ? AND store_id = ?', [+i.product_id, sid]);
    if (!p) throw err(400, 'Barang tidak ditemukan');
    const qty = round3(num(i.qty)); const price = round2(num(i.price));
    if (!(qty > 0)) throw err(400, `Qty ${p.name} harus > 0`);
    if (price < 0) throw err(400, `Harga ${p.name} tidak valid`);
    const total = round2(qty * price); subtotal += total;
    lines.push({ product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, qty, price, total });
  }
  return { lines, subtotal: round2(subtotal) };
}
function totals(subtotal, b) {
  const discount = round2(Math.max(num(b.discount), 0));
  if (discount > subtotal) throw err(400, 'Diskon melebihi subtotal');
  const tax = round2((subtotal - discount) * Math.max(num(b.tax_percent), 0) / 100);
  return { discount, tax, total: round2(subtotal - discount + tax) };
}

purchases.get('/', wrap(async (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const r = range({ from: req.query.from || '2000-01-01', to: req.query.to || '2999-12-31' });
  const w = ['p.store_id = ?', 'p.date >= ?', 'p.date <= ?']; const pr = [req.sid, r.from, r.to];
  if (req.query.status) { w.push('p.status = ?'); pr.push(req.query.status); }
  if (req.query.supplier_id) { w.push('p.supplier_id = ?'); pr.push(req.query.supplier_id); }
  if (req.query.unpaid === '1') w.push("p.status <> 'CANCELLED' AND p.paid < p.total");
  if (req.query.q) { w.push('(LOWER(p.po_no) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(p.supplier_ref) LIKE ?)'); pr.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  const from = `FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE ${w.join(' AND ')}`;
  const rows = await db.query(`SELECT p.id, p.po_no, p.date, p.due_date, p.total, p.paid, p.status, p.supplier_ref, s.name AS supplier_name ${from} ORDER BY p.id DESC LIMIT ? OFFSET ?`, [...pr, limit, offset]);
  res.json({ rows, total: (await db.one(`SELECT COUNT(*) AS n ${from}`, pr)).n });
}));
purchases.get('/:id', wrap(async (req, res) => {
  const p = await loadPurchase(req.params.id, req.sid);
  if (!p) throw err(404, 'Pembelian tidak ditemukan');
  res.json(p);
}));

async function save(req, id) {
  const b = req.body || {};
  return db.tx(async (t) => {
    if (!(await t.one('SELECT id FROM suppliers WHERE id = ? AND store_id = ?', [+b.supplier_id, req.sid]))) throw err(400, 'Pilih pemasok');
    const { lines, subtotal } = await buildLines(t, req.sid, b.items);
    const tt = totals(subtotal, b);
    const date = ymd(b.date) || t.today();
    const head = { date, due_date: ymd(b.due_date), supplier_id: +b.supplier_id, supplier_ref: b.supplier_ref ? String(b.supplier_ref).slice(0, 60) : null, subtotal, ...tt, note: b.note ? String(b.note).slice(0, 300) : null };
    let pid = id;
    if (id) {
      const cur = await t.one('SELECT status FROM purchases WHERE id = ? AND store_id = ?', [id, req.sid]);
      if (!cur) throw err(404, 'Pembelian tidak ditemukan');
      if (cur.status !== 'OPEN') throw err(409, 'Pembelian sudah diterima/dibatalkan, tidak bisa diubah');
      const k = Object.keys(head);
      await t.exec(`UPDATE purchases SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...k.map((c) => head[c]), id]);
      await t.exec('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);
    } else {
      pid = await t.insert('purchases', { ...head, store_id: req.sid, po_no: await nextNo(t, req.sid, 'PO', date), created_at: t.now(), paid: 0, status: 'OPEN', user_id: req.user.id });
    }
    for (const l of lines) await t.insert('purchase_items', { purchase_id: pid, ...l, received: 0 });
    return pid;
  });
}
purchases.post('/', wrap(async (req, res) => res.status(201).json(await loadPurchase(await save(req, null), req.sid))));
purchases.put('/:id', wrap(async (req, res) => res.json(await loadPurchase(await save(req, +req.params.id), req.sid))));

purchases.post('/:id/cancel', wrap(async (req, res) => {
  const x = await db.exec("UPDATE purchases SET status = 'CANCELLED' WHERE id = ? AND store_id = ? AND status = 'OPEN'", [req.params.id, req.sid]);
  if (!x.rowCount) throw err(409, 'Hanya pembelian berstatus OPEN yang bisa dibatalkan');
  res.json(await loadPurchase(req.params.id, req.sid));
}));
purchases.post('/:id/payments', wrap(async (req, res) => {
  const amount = round2(num(req.body.amount));
  if (!(amount > 0)) throw err(400, 'Nominal tidak valid');
  await db.tx(async (t) => {
    const p = await t.one('SELECT id, total, paid, status FROM purchases WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    if (!p || p.status === 'CANCELLED') throw err(409, 'Pembelian tidak valid');
    if (amount > round2(p.total - p.paid)) throw err(400, 'Nominal melebihi sisa tagihan');
    await t.exec('UPDATE purchases SET paid = paid + ? WHERE id = ?', [amount, p.id]);
    await t.insert('payments', { ref_type: 'PURCHASE', ref_id: p.id, created_at: t.now(), amount, method: String(req.body.method || 'TRANSFER').toUpperCase().slice(0, 12), note: req.body.note ? String(req.body.note).slice(0, 300) : null, user_id: req.user.id });
  });
  res.json(await loadPurchase(req.params.id, req.sid));
}));

// ---------- Penerimaan barang (langsung menambah stok, tanpa approval) ----------
async function loadReceipt(id, sid) {
  const g = await db.one(`SELECT g.*, p.po_no, s.name AS supplier_name, s.address AS supplier_address, s.phone AS supplier_phone, u.name AS user_name
    FROM goods_receipts g JOIN purchases p ON p.id = g.purchase_id JOIN suppliers s ON s.id = g.supplier_id LEFT JOIN users u ON u.id = g.user_id WHERE g.id = ? AND g.store_id = ?`, [id, sid]);
  if (!g) return null;
  g.items = await db.query('SELECT * FROM goods_receipt_items WHERE receipt_id = ? ORDER BY id', [id]);
  return g;
}
async function refreshStatus(t, purchaseId) {
  const it = await t.query('SELECT qty, received FROM purchase_items WHERE purchase_id = ?', [purchaseId]);
  const any = it.some((i) => i.received > 0);
  const all = it.every((i) => i.received >= i.qty);
  await t.exec("UPDATE purchases SET status = ? WHERE id = ? AND status <> 'CANCELLED'", [all ? 'RECEIVED' : any ? 'PARTIAL' : 'OPEN', purchaseId]);
}

receipts.get('/', wrap(async (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const r = range({ from: req.query.from || '2000-01-01', to: req.query.to || '2999-12-31' });
  const w = ['g.store_id = ?', 'g.date >= ?', 'g.date <= ?']; const p = [req.sid, r.from, r.to];
  if (req.query.q) { w.push('(LOWER(g.gr_no) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(g.supplier_do) LIKE ?)'); p.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  const from = `FROM goods_receipts g JOIN purchases pu ON pu.id = g.purchase_id JOIN suppliers s ON s.id = g.supplier_id WHERE ${w.join(' AND ')}`;
  const rows = await db.query(`SELECT g.id, g.gr_no, g.date, g.supplier_do, g.status, g.purchase_id, pu.po_no, s.name AS supplier_name ${from} ORDER BY g.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  res.json({ rows, total: (await db.one(`SELECT COUNT(*) AS n ${from}`, p)).n });
}));
receipts.get('/:id', wrap(async (req, res) => {
  const g = await loadReceipt(req.params.id, req.sid);
  if (!g) throw err(404, 'Penerimaan tidak ditemukan');
  res.json(g);
}));

// Dua mode:
//  a) berdasarkan pembelian: { purchase_id, items:[{purchase_item_id, qty}] }
//  b) langsung (tanpa PO): { supplier_id, items:[{product_id, qty, price}] } -> pembelian dibuat otomatis
receipts.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const updateCost = b.update_cost !== false;
  const id = await db.tx(async (t) => {
    const date = ymd(b.date) || t.today();
    let pid = +b.purchase_id || null;
    let supplierId; let lines = [];
    if (pid) {
      const pu = await t.one('SELECT id, supplier_id, status FROM purchases WHERE id = ? AND store_id = ?', [pid, req.sid]);
      if (!pu) throw err(404, 'Pembelian tidak ditemukan');
      if (pu.status === 'CANCELLED') throw err(409, 'Pembelian sudah dibatalkan');
      supplierId = pu.supplier_id;
      for (const i of b.items || []) {
        const qty = round3(num(i.qty)); if (!(qty > 0)) continue;
        const pi = await t.one('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ?', [+i.purchase_item_id, pid]);
        if (!pi) throw err(400, 'Baris pembelian tidak ditemukan');
        lines.push({ pi, qty, price: pi.price });
      }
    } else {
      supplierId = +b.supplier_id;
      if (!(await t.one('SELECT id FROM suppliers WHERE id = ? AND store_id = ?', [supplierId, req.sid]))) throw err(400, 'Pilih pemasok');
      const { lines: bl, subtotal } = await buildLines(t, req.sid, (b.items || []).filter((i) => num(i.qty) > 0));
      pid = await t.insert('purchases', { store_id: req.sid, po_no: await nextNo(t, req.sid, 'PO', date), created_at: t.now(), date, due_date: ymd(b.due_date), supplier_id: supplierId, supplier_ref: b.supplier_do ? String(b.supplier_do).slice(0, 60) : null, subtotal, discount: 0, tax: 0, total: subtotal, paid: 0, status: 'OPEN', note: 'Dibuat otomatis dari penerimaan langsung', user_id: req.user.id });
      for (const l of bl) {
        const piId = await t.insert('purchase_items', { purchase_id: pid, ...l, received: 0 });
        lines.push({ pi: { id: piId, ...l }, qty: l.qty, price: l.price });
      }
    }
    if (!lines.length) throw err(400, 'Isi qty yang diterima');
    const grId = await t.insert('goods_receipts', { store_id: req.sid, gr_no: await nextNo(t, req.sid, 'GR', date), created_at: t.now(), date, purchase_id: pid, supplier_id: supplierId, supplier_do: b.supplier_do ? String(b.supplier_do).slice(0, 60) : null, status: 'DONE', note: b.note ? String(b.note).slice(0, 300) : null, user_id: req.user.id });
    const grNo = (await t.one('SELECT gr_no FROM goods_receipts WHERE id = ?', [grId])).gr_no;
    lines.sort((x, y) => x.pi.product_id - y.pi.product_id);
    for (const l of lines) {
      await t.exec('UPDATE purchase_items SET received = received + ? WHERE id = ?', [l.qty, l.pi.id]);
      await t.insert('goods_receipt_items', { receipt_id: grId, purchase_item_id: l.pi.id, product_id: l.pi.product_id, name: l.pi.name, unit: l.pi.unit, qty: l.qty, price: l.price });
      await stock.move(t, { store_id: req.sid, product_id: l.pi.product_id, qty: l.qty, type: 'RECEIPT', ref_type: 'RECEIPT', ref_id: grId, ref_no: grNo, note: b.supplier_do ? 'SJ supplier ' + b.supplier_do : null, user_id: req.user.id, allowNegative: true });
      if (updateCost && l.price > 0) await t.exec('UPDATE products SET buy_price = ? WHERE id = ? AND store_id = ?', [l.price, l.pi.product_id, req.sid]);
    }
    await refreshStatus(t, pid);
    return grId;
  });
  res.status(201).json(await loadReceipt(id, req.sid));
}));

// Batalkan penerimaan: stok dikurangi lagi
receipts.post('/:id/void', wrap(async (req, res) => {
  await db.tx(async (t) => {
    const g = await t.one('SELECT * FROM goods_receipts WHERE id = ? AND store_id = ?', [req.params.id, req.sid]);
    if (!g) throw err(404, 'Penerimaan tidak ditemukan');
    const f = await t.exec("UPDATE goods_receipts SET status = 'VOID' WHERE id = ? AND status = 'DONE'", [g.id]);
    if (!f.rowCount) throw err(409, 'Penerimaan sudah dibatalkan');
    const items = await t.query('SELECT * FROM goods_receipt_items WHERE receipt_id = ? ORDER BY product_id', [g.id]);
    for (const i of items) {
      await t.exec('UPDATE purchase_items SET received = received - ? WHERE id = ?', [i.qty, i.purchase_item_id]);
      await stock.move(t, { store_id: req.sid, product_id: i.product_id, qty: -i.qty, type: 'RECEIPT_VOID', ref_type: 'RECEIPT', ref_id: g.id, ref_no: g.gr_no, note: req.body.reason || 'Batal penerimaan', user_id: req.user.id, allowNegative: true });
    }
    await refreshStatus(t, g.purchase_id);
  });
  res.json(await loadReceipt(req.params.id, req.sid));
}));
module.exports = { purchases, receipts, loadPurchase };
