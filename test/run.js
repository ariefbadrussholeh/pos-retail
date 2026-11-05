// Uji integrasi end-to-end. Pakai: DATABASE_URL=... node test/run.js
// Database harus kosong (atau baru). Jalan di Postgres maupun MySQL/MariaDB.
const assert = require('assert');
const cfg = require('../src/config');
const db = require('../src/db');
const { createSchema } = require('../src/db/schema');
const bcrypt = require('bcryptjs');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let pass = 0;
const ok = (name) => { pass++; console.log('  ok  ' + name); };

(async () => {
  console.log(`Driver: ${db.client}`);
  await createSchema();
  await createSchema(); // idempoten
  await db.insert('users', { username: 'owner', name: 'Pemilik', role: 'owner', password_hash: bcrypt.hashSync('owner123', 4), active: 1, created_at: db.now() });
  await db.insert('users', { username: 'kasir1', name: 'Kasir Satu', role: 'kasir', store_id: 1, password_hash: bcrypt.hashSync('kasir123', 4), active: 1, created_at: db.now() });

  const server = require('../src/server').listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => {
    let cookie = ''; const h = {};
    const call = async (method, url, body, raw) => {
      const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie, ...h }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      if (raw) return r;
      const j = await r.json().catch(() => ({}));
      if (Array.isArray(j)) { j.code = r.status; return j; }
      return { ...j, code: r.status, _json: j };
    };
    return { h, cookie: () => cookie, get: (u, raw) => call('GET', u, null, raw), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u) };
  };
  const A = mk(); const K = mk(); const anon = mk();

  // ---- auth & role
  assert.equal((await anon.get('/api/products')).code, 401); ok('endpoint terlindungi tanpa login');
  assert.equal((await A.post('/api/auth/login', { username: 'owner', password: 'salah' })).code, 401); ok('login salah ditolak');
  assert.equal((await A.post('/api/auth/login', { username: 'owner', password: 'owner123' })).role, 'owner'); ok('login owner');
  assert.equal((await K.post('/api/auth/login', { username: 'kasir1', password: 'kasir123' })).role, 'kasir'); ok('login kasir');
  assert.equal((await K.get('/api/dashboard')).code, 403); ok('kasir tidak bisa dashboard');
  assert.equal((await K.post('/api/purchases', {})).code, 403); ok('kasir tidak bisa pembelian');
  assert.equal((await K.get('/api/reports/stock')).code, 403); ok('kasir tidak bisa laporan');

  // ---- identitas toko
  const pub0 = await anon.get('/api/settings/public'); assert.equal(pub0.store_name, 'Toko Saya'); ok('pengaturan publik (default)');
  assert.equal((await K.put('/api/settings', { store_name: 'X' })).code, 403); ok('kasir tidak bisa ubah pengaturan');
  assert.equal((await A.put('/api/settings', { logo: 'data:text/html;base64,AAAA' })).code, 400); ok('logo non-gambar ditolak');
  const st = await A.put('/api/settings', { store_name: 'Toko Maju Jaya', address: 'Jl. Merdeka No. 10', city: 'Bandung', phone: '022-123456', npwp: '01.234.567.8-901.000', logo: PNG, tax_percent: 11, bank_name: 'BCA', bank_account: '1234567890', bank_holder: 'Toko Maju Jaya', signer_name: 'Budi Santoso', receipt_footer: 'Terima kasih', paper_width: 58 });
  assert.equal(st.store_name, 'Toko Maju Jaya'); assert.equal(st.tax_percent, 11); assert.equal(st.paper_width, 58); assert.equal(st.receipt_show_logo, true); ok('simpan identitas toko');
  const lg = await anon.get('/api/settings/logo', true); assert.equal(lg.status, 200); assert.equal(lg.headers.get('content-type'), 'image/png'); ok('logo dilayani publik');
  await A.put('/api/settings', { tax_percent: 0 }); // matikan pajak dulu untuk hitungan sederhana

  // ---- master
  const cat = await A.post('/api/categories', { name: 'Minuman' }); assert.ok(cat.id); ok('kategori');
  assert.equal((await A.post('/api/categories', { name: 'Minuman' })).code, 409); ok('kategori duplikat 409');
  const sup = await A.post('/api/suppliers', { name: 'PT Sumber Rejeki', phone: '021-555', address: 'Jakarta' }); assert.ok(sup.id); ok('pemasok');
  const cus = await K.post('/api/customers', { name: 'CV Berkah Abadi', phone: '0812', address: 'Jl. Kenanga 5' }); assert.ok(cus.id); ok('kasir bisa tambah pelanggan');
  const p1 = await A.post('/api/products', { name: 'Air Mineral 600ml', barcode: '8999999000011', category_id: cat.id, unit: 'btl', buy_price: 2000, sell_price: 3500, wholesale_price: 3000, wholesale_min: 10, min_stock: 5, stock: 50 });
  assert.equal(p1.stock, 50); assert.ok(p1.sku.startsWith('B')); ok('barang + stok awal + SKU otomatis');
  const p2 = await A.post('/api/products', { name: 'Teh Botol', sku: 'TEH01', barcode: '8999999000028', unit: 'btl', buy_price: 3000, sell_price: 5000, stock: 3, min_stock: 5 });
  assert.equal((await A.post('/api/products', { name: 'Dobel', barcode: '8999999000011' })).code, 409); ok('barcode duplikat ditolak');
  const cat1 = await K.get('/api/products/catalog'); assert.equal(cat1.length, 2); ok('katalog kasir');
  assert.equal((await K.post('/api/products', { name: 'x' })).code, 403); ok('kasir tidak bisa tambah barang');
  const imp = await A.post('/api/products/import', { rows: [{ sku: 'TEH01', name: 'Teh Botol', sell_price: 5500 }, { name: 'Kopi Sachet', category: 'Minuman', buy_price: 1000, sell_price: 2000, stock: 20 }] });
  assert.equal(imp.created, 1); assert.equal(imp.updated, 1); ok('impor barang (buat + update)');
  assert.equal((await A.post('/api/products/import', { rows: [{ name: 'ok' }, { sell_price: 1 }] })).code, 422); ok('impor dibatalkan jika ada baris salah');
  const cat2 = await K.get('/api/products/catalog'); assert.equal(cat2.length, 3); ok('impor atomik (batal = tidak ada yang masuk)');

  // ---- barcode otomatis
  const { validEan13 } = require('../src/services/barcode');
  const pa = await A.post('/api/products', { name: 'Tanpa Barcode', sell_price: 1000 }); assert.ok(validEan13(pa.barcode), pa.barcode); assert.ok(pa.barcode.startsWith('20')); ok('barang baru tanpa barcode diberi EAN-13 valid');
  const pb = await A.post('/api/products', { name: 'Tanpa Barcode 2', sell_price: 1000 }); assert.notEqual(pa.barcode, pb.barcode); ok('barcode otomatis unik');
  assert.ok(validEan13((await A.post('/api/products/barcode/next')).barcode)); ok('endpoint barcode berikutnya');
  assert.equal((await K.post('/api/products/barcode/next')).code, 403); ok('kasir tidak bisa buat barcode');
  const pc = await A.post('/api/products', { name: 'Barcode Sendiri', barcode: '8990000000017', sell_price: 1 }); assert.equal(pc.barcode, '8990000000017'); ok('barcode manual dihormati');
  await A.put('/api/settings', { auto_barcode: false });
  const pd = await A.post('/api/products', { name: 'Tanpa Auto', sell_price: 1 }); assert.ok(!pd.barcode); ok('auto barcode bisa dimatikan');
  const fl = await A.post('/api/products/barcode/fill'); assert.ok(fl.filled >= 1); assert.ok(validEan13((await A.get('/api/products/' + pd.id)).barcode)); ok('isi barcode massal untuk barang yang kosong');
  await A.put('/api/settings', { auto_barcode: true });
  assert.equal((await A.get('/api/products/catalog')).length, 7);

  // ---- penjualan
  let s1 = await K.post('/api/sales', { items: [{ product_id: p1.id, qty: 2 }, { product_id: p2.id, qty: 1, discount: 500 }], method: 'TUNAI', paid: 20000 });
  assert.equal(s1.code, 201); assert.equal(s1.subtotal, 7000 + 5500); assert.equal(s1.total, 12500); assert.equal(s1.discount, 0); assert.equal(s1.items[1].discount, 0); // diskon sudah dihapus: field diskon diabaikan
  assert.equal(s1.change_amount, 7500); assert.ok(/^INV-\d{8}-0001$/.test(s1.sale_no)); ok('penjualan tunai + kembalian + nomor; diskon diabaikan');
  assert.equal((await K.post('/api/sales', { items: [{ product_id: p1.id, qty: 1 }], paid: 100 })).code, 400); ok('uang kurang ditolak');
  const sw = await K.post('/api/sales', { items: [{ product_id: p1.id, qty: 10 }], method: 'QRIS' }); assert.equal(sw.items[0].price, 3000); assert.equal(sw.total, 30000); ok('harga grosir otomatis');
  assert.equal((await K.get('/api/products/' + p1.id)).stock, 50 - 2 - 10); ok('stok berkurang');
  assert.equal((await K.post('/api/sales', { items: [{ product_id: p1.id, qty: 1 }], method: 'KREDIT' })).code, 400); ok('kredit tanpa pelanggan ditolak');
  const sk = await K.post('/api/sales', { items: [{ product_id: p1.id, qty: 4 }], method: 'KREDIT', customer_id: cus.id, paid: 4000 }); assert.equal(sk.code, 201); assert.equal(sk.outstanding, 14000 - 4000); ok('penjualan kredit + uang muka');
  const sk2 = await K.post('/api/sales', { items: [{ product_id: p2.id, qty: 3 }], method: 'KREDIT', customer_id: cus.id, paid: 0, due_date: '2026-11-30' }); assert.equal(sk2.outstanding, 16500); ok('kredit tanpa uang muka');
  assert.equal((await A.post(`/api/sales/${sk.id}/payments`, { amount: 99999 })).code, 400); ok('pelunasan melebihi sisa ditolak');
  assert.equal((await A.post(`/api/sales/${sk.id}/payments`, { amount: 10000 })).outstanding, 0); ok('pelunasan piutang');
  // tarik ulang karena PUT/POST mengembalikan status http
  const bal0 = (await A.get('/api/products/' + p1.id)).stock;
  const vd = await A.post(`/api/sales/${sw.id}/void`, { reason: 'salah input' }); assert.equal(vd.status, 'VOID');
  assert.equal((await A.get('/api/products/' + p1.id)).stock, bal0 + 10); ok('void mengembalikan stok');
  assert.equal((await A.post(`/api/sales/${sw.id}/void`)).code, 409); ok('void ganda ditolak');
  assert.equal((await K.post(`/api/sales/${sk.id}/void`)).code, 403); ok('kasir tidak bisa void');

  // pajak
  await A.put('/api/settings', { tax_percent: 10, tax_inclusive: false });
  const tx = await K.post('/api/sales', { items: [{ product_id: p2.id, qty: 2 }], method: 'TUNAI', paid: 20000 }); assert.equal(tx.tax, 1100); assert.equal(tx.total, 12100); ok('pajak eksklusif');
  await A.put('/api/settings', { tax_percent: 10, tax_inclusive: true });
  const ti = await K.post('/api/sales', { items: [{ product_id: p2.id, qty: 2 }], method: 'TUNAI', paid: 20000 }); assert.equal(ti.total, 11000); assert.equal(ti.tax, 1000); ok('pajak inklusif');
  await A.put('/api/settings', { tax_percent: 0, allow_negative_stock: false });
  assert.equal((await K.post('/api/sales', { items: [{ product_id: p2.id, qty: 9999 }], paid: 99999999 })).code, 409); ok('stok minus ditolak bila dilarang');
  await A.put('/api/settings', { allow_negative_stock: true });

  // konkurensi: 8 penjualan paralel barang sama
  const before = (await A.get('/api/products/' + p2.id)).stock;
  const res = await Promise.all(Array.from({ length: 8 }, () => K.post('/api/sales', { items: [{ product_id: p2.id, qty: 1 }], paid: 100000 })));
  assert.ok(res.every((r) => r.code === 201), JSON.stringify(res.map((r) => r.code)));
  assert.equal((await A.get('/api/products/' + p2.id)).stock, before - 8);
  assert.equal(new Set(res.map((r) => r.sale_no)).size, 8); ok('8 penjualan paralel: stok & nomor konsisten');

  // ---- pembelian + penerimaan
  const po = await A.post('/api/purchases', { supplier_id: sup.id, date: db.today(), due_date: db.today(), supplier_ref: 'FAK-77', items: [{ product_id: p1.id, qty: 100, price: 2100 }, { product_id: p2.id, qty: 50, price: 3200 }], discount: 10000 });
  assert.equal(po.code, 201); assert.equal(po.subtotal, 210000 + 160000); assert.equal(po.total, 360000); 
  const poD = await A.get('/api/purchases/' + po.id); assert.equal(poD.status, 'OPEN'); ok('buat pembelian');
  const sb = (await A.get('/api/products/' + p1.id)).stock;
  const gr1 = await A.post('/api/receipts', { purchase_id: po.id, supplier_do: 'SJ-001', items: [{ purchase_item_id: poD.items[0].id, qty: 60 }] });
  assert.equal(gr1.code, 201); assert.equal((await A.get('/api/products/' + p1.id)).stock, sb + 60); assert.equal((await A.get('/api/purchases/' + po.id)).status, 'PARTIAL'); ok('penerimaan sebagian (stok naik, status PARTIAL)');
  assert.equal((await A.get('/api/products/' + p1.id)).buy_price, 2100); ok('harga beli terakhir diperbarui');
  assert.equal((await A.put('/api/purchases/' + po.id, { supplier_id: sup.id, items: [{ product_id: p1.id, qty: 1, price: 1 }] })).code, 409); ok('pembelian yang sudah diterima tidak bisa diedit');
  const gr2 = await A.post('/api/receipts', { purchase_id: po.id, items: [{ purchase_item_id: poD.items[0].id, qty: 40 }, { purchase_item_id: poD.items[1].id, qty: 50 }] });
  assert.equal(gr2.code, 201); assert.equal((await A.get('/api/purchases/' + po.id)).status, 'RECEIVED'); ok('penerimaan lengkap (status RECEIVED)');
  const vg = await A.post(`/api/receipts/${gr2.id}/void`, {}); assert.equal(vg.status, 'VOID'); assert.equal((await A.get('/api/purchases/' + po.id)).status, 'PARTIAL'); ok('batal penerimaan: stok & status dikembalikan');
  await A.post('/api/receipts', { purchase_id: po.id, items: [{ purchase_item_id: poD.items[0].id, qty: 40 }, { purchase_item_id: poD.items[1].id, qty: 50 }] });
  const direct = await A.post('/api/receipts', { supplier_id: sup.id, supplier_do: 'SJ-DIR', items: [{ product_id: p2.id, qty: 5, price: 3100 }] });
  assert.equal(direct.code, 201); assert.ok((await A.get('/api/purchases/' + direct.purchase_id)).items.length === 1); ok('penerimaan langsung membuat pembelian otomatis');
  const pay = await A.post(`/api/purchases/${po.id}/payments`, { amount: 100000 }); assert.equal(pay.outstanding, 260000); ok('pembayaran hutang');
  const po2 = await A.post('/api/purchases', { supplier_id: sup.id, items: [{ product_id: p1.id, qty: 1, price: 1 }] });
  assert.equal((await A.post(`/api/purchases/${po2.id}/cancel`)).status, 'CANCELLED'); ok('batal pembelian OPEN');

  // ---- opname
  const sheet = await A.get('/api/opnames/sheet'); assert.ok(sheet.length >= 3); ok('lembar opname');
  const cur = (await A.get('/api/products/' + p2.id)).stock;
  const op = await A.post('/api/opnames', { note: 'Opname rutin', items: [{ product_id: p2.id, counted: cur - 2 }, { product_id: p1.id, counted: '' }] });
  assert.equal(op.code, 201); assert.equal((await A.get('/api/products/' + p2.id)).stock, cur - 2); ok('opname langsung berlaku tanpa approval');
  const opD = await A.get('/api/opnames/' + op.id); assert.equal(opD.items.length, 1); assert.equal(opD.items[0].diff, -2); ok('rincian opname (selisih)');
  const card = await A.get(`/api/stock/card?product_id=${p2.id}&from=2000-01-01&to=2999-12-31`); assert.equal(card.rows[card.rows.length - 1].balance, cur - 2); assert.ok(card.rows.some((r) => r.type === 'OPNAME')); ok('kartu stok konsisten dengan saldo');
  await A.post('/api/stock/adjust', { product_id: p2.id, qty: -1, note: 'Rusak' }); assert.equal((await A.get('/api/products/' + p2.id)).stock, cur - 3); ok('penyesuaian stok');

  // ---- laporan & dashboard
  for (const r of ['sales_daily', 'sales_detail', 'sales_items', 'sales_cashier', 'stock', 'low_stock', 'purchases', 'receipts', 'opnames', 'receivables', 'payables']) {
    const j = await A.get(`/api/reports/${r}?from=2000-01-01&to=2999-12-31`); assert.equal(j.code, 200, r + ' ' + JSON.stringify(j._json));
    const x = await A.get(`/api/reports/${r}/excel?from=2000-01-01&to=2999-12-31`, true);
    assert.equal(x.status, 200, r + ' excel'); const buf = Buffer.from(await x.arrayBuffer()); assert.equal(buf.slice(0, 2).toString(), 'PK');
  }
  ok('11 laporan JSON + Excel');
  const sd = await A.get(`/api/reports/sales_daily?from=${db.today()}&to=${db.today()}`);
  const valid = (await A.get(`/api/reports/sales_detail?from=${db.today()}&to=${db.today()}`)).rows.filter((r) => r.status === 'DONE').reduce((a, r) => a + r.total, 0);
  assert.equal(sd.rows[0].total, valid); ok('total laporan harian = total rincian');
  const ds = await A.get('/api/dashboard'); assert.ok(ds.today.trx > 0 && ds.days.length === 7 && ds.top.length > 0 && ds.stock_value > 0); ok('dashboard');

  // ---- PDF
  for (const [kind, type, id] of [['invoice', 'sale', s1.id], ['delivery', 'sale', s1.id], ['payment-request', 'sale', sk2.id], ['invoice', 'purchase', po.id], ['delivery', 'purchase', po.id], ['payment-request', 'purchase', po.id]]) {
    const r = await A.get(`/api/docs/${kind}/${type}/${id}`, true); assert.equal(r.status, 200, `${kind}/${type}`);
    const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.slice(0, 4).toString(), '%PDF'); require('fs').writeFileSync(`${process.env.OUT || '/tmp'}/${db.client}-${kind}-${type}.pdf`, b);
  }
  ok('6 PDF (invoice, surat jalan, permohonan pembayaran x penjualan/pembelian)');
  assert.equal((await A.get(`/api/docs/payment-request/sale/${sk.id}`, true)).status, 409); ok('permohonan untuk tagihan lunas ditolak');
  assert.equal((await K.get(`/api/docs/invoice/sale/${sk.id}`, true)).status, 200); ok('kasir bisa cetak dokumen transaksinya sendiri');
  assert.equal((await K.get(`/api/docs/invoice/purchase/${po.id}`, true)).status, 403); ok('kasir tidak bisa dokumen pembelian');
  assert.equal((await A.get(`/api/docs/invoice/sale/${sw.id}`, true)).status, 409); ok('dokumen transaksi void ditolak');

  // ---- pengguna
  assert.equal((await A.post('/api/users', { username: 'kasir2', name: 'Kasir Dua', role: 'kasir', store_id: 1, password: 'abc12345' })).code, 201); ok('tambah pengguna');
  assert.equal((await A.post('/api/users', { username: 'kasir9', name: 'Tanpa Toko', role: 'kasir', password: 'abc12345' })).code, 400); ok('kasir wajib punya toko'); 
  assert.equal((await A.put('/api/users/1', { active: false })).code, 400); ok('tidak bisa menonaktifkan diri sendiri');
  assert.equal((await A.del('/api/categories/' + cat.id)).code, 409); ok('hapus kategori yang dipakai ditolak (FK)');
  const del = await A.del('/api/products/' + p1.id); assert.equal(del.deactivated, true); ok('barang berriwayat dinonaktifkan, bukan dihapus');

  await require('./multi')({ A, K, mk, db, ok, assert, base });

  console.log(`\n${pass} pemeriksaan lulus (${db.client})`);
  server.close(); await db.close(); process.exit(0);
})().catch((e) => { console.error('\nGAGAL:', e); process.exit(1); });
