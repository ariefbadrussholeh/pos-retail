// Penjualan faktur (di luar POS) ke perusahaan/instansi. Tiga jenis yang memengaruhi harga:
//   INAPROC  : harga acuan = harga offline + PPH + PPN (PPN sudah termasuk, tidak bisa diganti); harga boleh diubah per baris.
//   SP       : harga = harga offline (acuan harga, tidak bisa diedit); subtotal > Rp 2.000.000 wajib PPN ditambahkan.
//   LANGSUNG : sama dengan SP.
// Harga TIDAK diambil dari harga jual di master barang, tetapi dari harga dasar + Pengaturan > Acuan harga (services/pricing.js).
// Tidak ada diskon. Tetap mengurangi stok dan masuk laporan/piutang yang sama.
const router = require('express').Router();
const db = require('../db');
const { auth, owner } = require('../middleware/auth');
const { wrap, err, num, round2, round3, nextNo, ymd } = require('../services/util');
const stock = require('../services/stock');
const settings = require('../services/settings');
const { formatNo, counterKey } = require('../services/doc-number');
const pricing = require('../services/pricing');
const { loadSale } = require('./sales');

router.use(auth, owner);
router.use('/:id(\\d+)/docs', require('./sale-docs'));
const TYPES = ['INAPROC', 'SP', 'LANGSUNG'];
const METHODS = ['TUNAI', 'DEBIT', 'QRIS', 'TRANSFER', 'KREDIT'];

// Pratinjau nomor berikutnya (tidak menaikkan counter)
router.get('/next-no', wrap(async (req, res) => {
  const date = ymd(req.query.date) || db.today();
  const c = await db.one('SELECT v FROM counters WHERE k = ?', [counterKey(req.sid, date)]);
  res.json({ no: formatNo((c ? c.v : 0) + 1, date, req.store.code) });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const type = String(b.type || 'INAPROC').toUpperCase();
  if (!TYPES.includes(type)) throw err(400, 'Jenis penjualan tidak valid');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw err(400, 'Isi minimal satu barang');
  if (items.length > 200) throw err(400, 'Terlalu banyak baris');
  const cfg = await settings.get(req.sid);
  const date = ymd(b.doc_date) || db.today();
  const tax_rate = cfg.price_ppn;
  const payMethod = String(b.method || 'TRANSFER').toUpperCase();
  if (!METHODS.includes(payMethod) || payMethod === 'KREDIT') throw err(400, 'Metode pembayaran tidak valid');

  const id = await db.tx(async (t) => {
    const customer_id = +b.customer_id || null;
    if (!customer_id) throw err(400, 'Pilih pelanggan (perusahaan/instansi)');
    if (!(await t.one('SELECT id FROM customers WHERE id = ?', [customer_id]))) throw err(400, 'Pelanggan tidak ditemukan');
    const ids = [...new Set(items.map((i) => +i.product_id))].sort((a, c) => a - c);
    if (ids.some((x) => !x)) throw err(400, 'Barang tidak valid');
    const prods = new Map();
    for (const pid of ids) {
      const p = await t.one('SELECT id, sku, name, unit, buy_price, active FROM products WHERE id = ? AND store_id = ?', [pid, req.sid]);
      if (!p) throw err(400, 'Barang tidak ditemukan');
      if (!p.active) throw err(400, `${p.name} nonaktif`);
      prods.set(pid, p);
    }
    const lines = []; let subtotal = 0;
    for (const i of items) {
      const p = prods.get(+i.product_id);
      const qty = round3(num(i.qty));
      if (!(qty > 0)) throw err(400, `Qty ${p.name} harus > 0`);
      const c = pricing.calc(p.buy_price, cfg);
      let price; let name = p.name; let unit = p.unit;
      if (type === 'INAPROC') { // acuan harga INAPROC, boleh diubah per transaksi
        price = i.price == null || i.price === '' ? c.inaproc : round2(num(i.price));
        if (price < 0) throw err(400, `Harga ${p.name} tidak valid`);
        name = String(i.name || '').trim().slice(0, 200) || p.name; unit = String(i.unit || '').trim().slice(0, 20) || p.unit;
      } else price = c.offline; // SP & LANGSUNG: harga offline, tidak bisa diubah
      const total = round2(qty * price); subtotal += total;
      lines.push({ p, qty, price, total, name, unit });
    }
    subtotal = round2(subtotal);

    // Pajak: INAPROC selalu sudah termasuk PPN; SP/LANGSUNG: PPN ditambahkan (wajib bila subtotal > Rp 2.000.000)
    let tax_mode; let tax = 0; let total = subtotal;
    if (type === 'INAPROC') { tax_mode = 'INCLUDE'; tax = round2(subtotal - subtotal / (1 + tax_rate / 100)); }
    else {
      tax_mode = String(b.tax_mode || 'NONE').toUpperCase() === 'EXCLUDE' ? 'EXCLUDE' : 'NONE';
      if (subtotal > pricing.PPN_WAJIB_MIN && tax_mode !== 'EXCLUDE') throw err(400, 'Total di atas Rp 2.000.000 wajib memakai PPN');
      if (tax_mode === 'EXCLUDE') { tax = round2(subtotal * tax_rate / 100); total = round2(subtotal + tax); }
    }
    const paid = round2(Math.max(num(b.paid), 0));
    if (paid > total) throw err(400, 'Pembayaran melebihi total');
    const method = paid >= total && total > 0 ? payMethod : 'KREDIT';
    const due = ymd(b.due_date) || (method === 'KREDIT' ? (() => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + (cfg.default_due_days || 14)); return db.today(d); })() : null);

    // Nomor: isian manual, atau otomatis (format di services/doc-number.js)
    let sale_no = String(b.doc_no || '').trim().slice(0, 30);
    if (sale_no) {
      if (await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, sale_no])) throw err(409, 'Nomor dokumen sudah dipakai');
    } else {
      for (let k = 0; k < 50 && !sale_no; k++) {
        const n = await t.nextCounter(counterKey(req.sid, date));
        const cand = formatNo(n, date, req.store.code).slice(0, 30);
        if (!(await t.one('SELECT id FROM sales WHERE store_id = ? AND sale_no = ?', [req.sid, cand]))) sale_no = cand;
      }
      if (!sale_no) throw err(500, 'Gagal membuat nomor dokumen');
    }
    const clock = t.now().slice(11);
    const created_at = `${date} ${clock}`;
    const sid = await t.insert('sales', {
      store_id: req.sid, kind: type, sale_no, created_at, doc_date: date, user_id: req.user.id, customer_id,
      subtotal, discount: 0, tax, total, paid, change_amount: 0, method, due_date: due, status: 'DONE',
      contract_no: b.contract_no ? String(b.contract_no).trim().slice(0, 80) : null, contract_date: ymd(b.contract_date),
      tax_mode, tax_rate,
      note: b.note ? String(b.note).slice(0, 300) : null,
    });
    for (const l of lines.slice().sort((x, y) => x.p.id - y.p.id)) {
      await stock.move(t, { store_id: req.sid, product_id: l.p.id, qty: -l.qty, type: 'SALE', ref_type: 'SALE', ref_id: sid, ref_no: sale_no, note: 'Penjualan ' + type, user_id: req.user.id, allowNegative: cfg.allow_negative_stock });
    }
    for (const l of lines) await t.insert('sale_items', { sale_id: sid, product_id: l.p.id, sku: l.p.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, cost: l.p.buy_price, discount: 0, total: l.total });
    if (paid > 0) await t.insert('payments', { ref_type: 'SALE', ref_id: sid, created_at, amount: paid, method: payMethod, note: paid >= total ? 'Lunas' : 'Uang muka', user_id: req.user.id });
    return sid;
  });
  res.status(201).json(await loadSale(id, req.sid));
}));
module.exports = router;
