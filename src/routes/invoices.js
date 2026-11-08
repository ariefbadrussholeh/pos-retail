// Penjualan faktur (di luar POS) ke perusahaan/instansi. Tiga jenis yang menentukan harga (diisi manual di master barang, per toko):
//   INAPROC  : harga = Harga E-Katalog barang; boleh diubah per baris.
//   SP       : harga = Harga SP barang; tidak bisa diedit.
//   LANGSUNG : harga = Harga Langsung barang; tidak bisa diedit.
// Pajak bebas untuk semua jenis: PPN dan PPH masing-masing tanpa / belum termasuk (ditambahkan) / sudah termasuk, tarif bisa diubah.
// Harga TIDAK diambil dari "harga jual" (POS) di master barang. Tidak ada diskon.
// Harga dasar (HPP) saat transaksi disimpan di sale_items.cost, sehingga laba tidak berubah bila harga dasar diubah kemudian.
// Faktur bisa diubah dan dihapus (owner); stok disesuaikan otomatis.
const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, ymd } = require('../services/util');
const stock = require('../services/stock');
const settings = require('../services/settings');
const { formatNo, counterKey } = require('../services/doc-number');
const { loadSale } = require('./sales');
const storeRules = require('../services/store-rules');

router.use(auth, owner);
router.use('/:id(\\d+)/docs', require('./sale-docs'));
const TYPES = ['INAPROC', 'SP', 'LANGSUNG'];
const METHODS = ['TUNAI', 'DEBIT', 'QRIS', 'TRANSFER', 'KREDIT'];
const MODES = ['NONE', 'INCLUDE', 'EXCLUDE'];
const PRICE_COL = { INAPROC: 'price_ekatalog', SP: 'price_sp', LANGSUNG: 'price_langsung' };

// PPN & PPH dihitung dari DPP (dasar pengenaan pajak) PER BARIS. Tiap baris punya centang kena PPN (ppn_on) dan kena PPH (pph_on);
// baris yang tidak dicentang tidak dikenai pajak itu. Pada baris yang "sudah termasuk", DPP = jumlah baris / (1 + jumlah tarif yang termasuk).
// total = subtotal + pajak yang ditambahkan. Laba = total - ppn - pph - HPP (lihat laporan).
function calcTax(lines, ppnMode, ppnRate, pphMode, pphRate) {
  let subtotal = 0; let ppn = 0; let pph = 0; let dppTotal = 0;
  for (const l of lines) {
    subtotal += l.total;
    const onN = ppnMode !== 'NONE' && l.ppn_on; const onH = pphMode !== 'NONE' && l.pph_on;
    const ri = (onN && ppnMode === 'INCLUDE' ? ppnRate : 0) + (onH && pphMode === 'INCLUDE' ? pphRate : 0);
    const dpp = l.total / (1 + ri / 100);
    dppTotal += dpp;
    if (onN) ppn += dpp * ppnRate / 100;
    if (onH) pph += dpp * pphRate / 100;
  }
  subtotal = round2(subtotal); const tax = round2(ppn); const pphR = round2(pph);
  const total = round2(subtotal + (ppnMode === 'EXCLUDE' ? tax : 0) + (pphMode === 'EXCLUDE' ? pphR : 0));
  return { dpp: round2(dppTotal), tax, pph: pphR, total };
}
function readTax(b) {
  const mode = (v, d) => { const m = String(v == null || v === '' ? d : v).toUpperCase(); if (!MODES.includes(m)) throw err(400, 'Mode pajak tidak valid'); return m; };
  const rate = (v, d, label) => { const n = v == null || v === '' ? d : num(v); if (!(n >= 0 && n <= 100)) throw err(400, `Tarif ${label} harus 0-100`); return round2(n); };
  const ppn_mode = mode(b.tax_mode, 'NONE'); const pph_mode = mode(b.pph_mode, 'NONE');
  return { ppn_mode, ppn_rate: rate(b.tax_rate, 11, 'PPN'), pph_mode, pph_rate: rate(b.pph_rate, 1.5, 'PPH') };
}

// Susun baris + subtotal dari body. `oldCost` (product_id -> cost) menjaga harga dasar lama pada baris yang sudah ada saat edit.
async function buildLines(t, sid, type, items, oldCost, oldPrice) {
  if (!items.length) throw err(400, 'Isi minimal satu barang');
  if (items.length > 200) throw err(400, 'Terlalu banyak baris');
  const ids = [...new Set(items.map((i) => +i.product_id))].sort((a, c) => a - c);
  if (ids.some((x) => !x)) throw err(400, 'Barang tidak valid');
  const prods = new Map();
  for (const pid of ids) {
    const p = await t.one('SELECT id, sku, name, unit, buy_price, price_ekatalog, price_sp, price_langsung, no_ppn, no_pph, active FROM products WHERE id = ? AND store_id = ?', [pid, sid]);
    if (!p) throw err(400, 'Barang tidak ditemukan');
    if (!p.active && !(oldCost && oldCost.has(pid))) throw err(400, `${p.name} nonaktif`);
    prods.set(pid, p);
  }
  const lines = []; let subtotal = 0;
  for (const i of items) {
    const p = prods.get(+i.product_id);
    const qty = round3(num(i.qty));
    if (!(qty > 0)) throw err(400, `Qty ${p.name} harus > 0`);
    let price = round2(p[PRICE_COL[type]]); let name = p.name; let unit = p.unit;
    if (type === 'INAPROC') { // harga e-katalog, boleh diubah per transaksi
      if (i.price != null && i.price !== '') price = round2(num(i.price));
      if (price < 0) throw err(400, `Harga ${p.name} tidak valid`);
      name = String(i.name || '').trim().slice(0, 200) || p.name; unit = String(i.unit || '').trim().slice(0, 20) || p.unit;
    } else if (oldPrice && oldPrice.has(p.id)) price = oldPrice.get(p.id); // edit: baris lama SP/Langsung tetap berharga seperti tercatat
    const total = round2(qty * price); subtotal += total;
    const cost = oldCost && oldCost.has(p.id) ? oldCost.get(p.id) : p.buy_price; // harga dasar saat itu
    // centang pajak per baris: dari isian; bila tidak dikirim, mengikuti pengaturan bebas pajak di master barang
    const flag = (v, free) => (v == null || v === '' ? (free ? 0 : 1) : (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0));
    lines.push({ p, qty, price, total, name, unit, cost, ppn_on: flag(i.ppn, p.no_ppn), pph_on: flag(i.pph, p.no_pph) });
  }
  return { lines, subtotal: round2(subtotal) };
}

// Pratinjau nomor berikutnya (tidak menaikkan counter)
router.get('/next-no', wrap(async (req, res) => {
  const date = ymd(req.query.date) || db.today();
  const c = await db.one('SELECT v FROM counters WHERE k = ?', [counterKey(req.sid, date)]);
  res.json({ no: formatNo((c ? c.v : 0) + 1, date, req.store.code) });
}));

function readHead(b, store, keepType) {
  const allowed = storeRules.fakturTypes(store.code);
  const type = String(b.type || allowed[0]).toUpperCase();
  if (!TYPES.includes(type)) throw err(400, 'Jenis penjualan tidak valid');
  if (!allowed.includes(type) && type !== keepType) throw err(400, 'Jenis penjualan ini tidak tersedia untuk toko ini');
  return {
    type, items: Array.isArray(b.items) ? b.items : [], date: ymd(b.doc_date) || db.today(), tx: readTax(b),
    contract_no: b.contract_no ? String(b.contract_no).trim().slice(0, 80) : null, contract_date: ymd(b.contract_date),
    note: b.note ? String(b.note).slice(0, 300) : null,
  };
}
async function checkCustomer(t, b) {
  const customer_id = +b.customer_id || null;
  if (!customer_id) throw err(400, 'Pilih pelanggan (perusahaan/instansi)');
  if (!(await t.one('SELECT id FROM customers WHERE id = ?', [customer_id]))) throw err(400, 'Pelanggan tidak ditemukan');
  return customer_id;
}
const dueDefault = (date, days) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + (days || 14)); return db.today(d); };

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const h = readHead(b, req.store);
  const cfg = await settings.get(req.sid);
  const payMethod = String(b.method || 'TRANSFER').toUpperCase();
  if (!METHODS.includes(payMethod) || payMethod === 'KREDIT') throw err(400, 'Metode pembayaran tidak valid');

  const id = await db.tx(async (t) => {
    const customer_id = await checkCustomer(t, b);
    const { lines, subtotal } = await buildLines(t, req.sid, h.type, h.items, null);
    const x = calcTax(lines, h.tx.ppn_mode, h.tx.ppn_rate, h.tx.pph_mode, h.tx.pph_rate);
    const paid = round2(Math.max(num(b.paid), 0));
    if (paid > x.total) throw err(400, 'Pembayaran melebihi total');
    const method = paid >= x.total && x.total > 0 ? payMethod : 'KREDIT';
    const due = ymd(b.due_date) || (method === 'KREDIT' ? dueDefault(h.date, cfg.default_due_days) : null);

    // Nomor: isian manual, atau otomatis (format di services/doc-number.js)
    let sale_no = String(b.doc_no || '').trim().slice(0, 30);
    if (sale_no) {
      if (await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, sale_no])) throw err(409, 'Nomor dokumen sudah dipakai');
    } else {
      for (let k = 0; k < 50 && !sale_no; k++) {
        const n = await t.nextCounter(counterKey(req.sid, h.date));
        const cand = formatNo(n, h.date, req.store.code).slice(0, 30);
        if (!(await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, cand]))) sale_no = cand;
      }
      if (!sale_no) throw err(500, 'Gagal membuat nomor dokumen');
    }
    const created_at = `${h.date} ${t.now().slice(11)}`;
    const sid = await t.insert('sales', {
      store_id: req.sid, kind: h.type, sale_no, created_at, doc_date: h.date, user_id: req.user.id, customer_id,
      subtotal, discount: 0, tax: x.tax, total: x.total, paid, change_amount: 0, method, due_date: due, status: 'DONE',
      contract_no: h.contract_no, contract_date: h.contract_date,
      tax_mode: h.tx.ppn_mode, tax_rate: h.tx.ppn_rate, pph_mode: h.tx.pph_mode, pph_rate: h.tx.pph_rate, pph: x.pph, note: h.note,
    });
    for (const l of lines.slice().sort((a, c) => a.p.id - c.p.id)) {
      await stock.move(t, { store_id: req.sid, product_id: l.p.id, qty: -l.qty, type: 'SALE', ref_type: 'SALE', ref_id: sid, ref_no: sale_no, note: 'Penjualan ' + h.type, user_id: req.user.id, allowNegative: cfg.allow_negative_stock });
    }
    for (const l of lines) await t.insert('sale_items', { sale_id: sid, product_id: l.p.id, sku: l.p.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, cost: l.cost, discount: 0, total: l.total, ppn_on: l.ppn_on, pph_on: l.pph_on });
    if (paid > 0) await t.insert('payments', { ref_type: 'SALE', ref_id: sid, created_at, amount: paid, method: payMethod, note: paid >= x.total ? 'Lunas' : 'Uang muka', user_id: req.user.id });
    return sid;
  });
  res.status(201).json(await loadSale(id, req.sid));
}));

// Ubah faktur: jenis, pelanggan, tanggal, kontrak/SP, pajak, dan barang. Pembayaran yang sudah masuk tetap.
// Stok disesuaikan sebesar selisih qty; harga dasar (cost) baris lama dipertahankan.
router.put('/:id(\\d+)', wrap(async (req, res) => {
  const b = req.body || {};
  const curRow = await db.one("SELECT kind FROM sales WHERE id = ? AND store_id = ? AND kind <> 'POS'", [req.params.id, req.sid]);
  const h = readHead(b, req.store, curRow && curRow.kind); // jenis lama boleh dipertahankan walau toko kini dibatasi
  const cfg = await settings.get(req.sid);
  await db.tx(async (t) => {
    const s = await t.one("SELECT * FROM sales WHERE id = ? AND store_id = ? AND kind <> 'POS'", [req.params.id, req.sid]);
    if (!s) throw err(404, 'Penjualan faktur tidak ditemukan');
    if (s.status !== 'DONE') throw err(409, 'Transaksi yang sudah dibatalkan tidak bisa diubah');
    const customer_id = await checkCustomer(t, b);
    const old = await t.query('SELECT product_id, qty, cost, price FROM sale_items WHERE sale_id = ? ORDER BY id', [s.id]);
    const oldCost = new Map(); const oldQty = new Map(); const oldPrice = new Map();
    for (const o of old) { if (!oldCost.has(o.product_id)) { oldCost.set(o.product_id, o.cost); oldPrice.set(o.product_id, o.price); } oldQty.set(o.product_id, round3((oldQty.get(o.product_id) || 0) + o.qty)); }
    const { lines, subtotal } = await buildLines(t, req.sid, h.type, h.items, oldCost, h.type === s.kind ? oldPrice : null);
    const x = calcTax(lines, h.tx.ppn_mode, h.tx.ppn_rate, h.tx.pph_mode, h.tx.pph_rate);
    if (x.total < s.paid) throw err(400, `Total baru (${x.total}) lebih kecil dari yang sudah dibayar (${s.paid}). Ubah dulu pembayarannya`);

    let sale_no = String(b.doc_no || '').trim().slice(0, 30) || s.sale_no;
    if (sale_no !== s.sale_no && await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ? AND id <> ?', [req.sid, sale_no, s.id])) throw err(409, 'Nomor dokumen sudah dipakai');

    // stok: selisih per barang (urut id agar tidak deadlock)
    const newQty = new Map();
    for (const l of lines) newQty.set(l.p.id, round3((newQty.get(l.p.id) || 0) + l.qty));
    const pids = [...new Set([...oldQty.keys(), ...newQty.keys()])].sort((a, c) => a - c);
    for (const pid of pids) {
      const delta = round3((oldQty.get(pid) || 0) - (newQty.get(pid) || 0)); // + = stok kembali, - = stok keluar
      if (delta) await stock.move(t, { store_id: req.sid, product_id: pid, qty: delta, type: 'SALE_EDIT', ref_type: 'SALE', ref_id: s.id, ref_no: sale_no, note: 'Ubah penjualan', user_id: req.user.id, allowNegative: delta > 0 || cfg.allow_negative_stock });
    }
    await t.exec('DELETE FROM sale_items WHERE sale_id = ?', [s.id]);
    for (const l of lines) await t.insert('sale_items', { sale_id: s.id, product_id: l.p.id, sku: l.p.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, cost: l.cost, discount: 0, total: l.total, ppn_on: l.ppn_on, pph_on: l.pph_on });

    let method = s.method;
    if (s.paid >= x.total && x.total > 0) {
      if (method === 'KREDIT') { const lp = await t.one("SELECT method FROM payments WHERE ref_type = 'SALE' AND ref_id = ? ORDER BY id DESC LIMIT 1", [s.id]); method = lp ? lp.method : 'TRANSFER'; }
    } else method = 'KREDIT';
    const date = h.date;
    const created_at = `${date} ${String(s.created_at).slice(11, 19) || '00:00:00'}`;
    const due = ymd(b.due_date) || (method === 'KREDIT' ? (s.due_date ? ymd(s.due_date) : dueDefault(date, cfg.default_due_days)) : null);
    await t.exec(`UPDATE sales SET kind = ?, sale_no = ?, customer_id = ?, created_at = ?, doc_date = ?, subtotal = ?, tax = ?, total = ?, method = ?, due_date = ?,
      contract_no = ?, contract_date = ?, tax_mode = ?, tax_rate = ?, pph_mode = ?, pph_rate = ?, pph = ?, note = ? WHERE id = ?`,
    [h.type, sale_no, customer_id, created_at, date, subtotal, x.tax, x.total, method, due, h.contract_no, h.contract_date, h.tx.ppn_mode, h.tx.ppn_rate, h.tx.pph_mode, h.tx.pph_rate, x.pph, h.note, s.id]);
  });
  res.json(await loadSale(req.params.id, req.sid));
}));

// Hapus faktur permanen: stok dikembalikan (bila belum dibatalkan), pembayaran dan dokumen pendukung ikut terhapus.
router.delete('/:id(\\d+)', wrap(async (req, res) => {
  await db.tx(async (t) => {
    const s = await t.one("SELECT * FROM sales WHERE id = ? AND store_id = ? AND kind <> 'POS'", [req.params.id, req.sid]);
    if (!s) throw err(404, 'Penjualan faktur tidak ditemukan');
    if (s.status === 'DONE') {
      const items = await t.query('SELECT product_id, qty FROM sale_items WHERE sale_id = ? ORDER BY product_id', [s.id]);
      for (const i of items) await stock.move(t, { store_id: req.sid, product_id: i.product_id, qty: i.qty, type: 'SALE_VOID', ref_type: 'SALE', ref_id: s.id, ref_no: s.sale_no, note: 'Hapus penjualan', user_id: req.user.id, allowNegative: true });
    }
    await t.exec('DELETE FROM sale_docs WHERE sale_id = ?', [s.id]);
    await t.exec("DELETE FROM payments WHERE ref_type = 'SALE' AND ref_id = ?", [s.id]);
    await t.exec('DELETE FROM sale_items WHERE sale_id = ?', [s.id]);
    await t.exec('DELETE FROM sales WHERE id = ?', [s.id]);
  });
  res.json({ ok: true });
}));
module.exports = router;
