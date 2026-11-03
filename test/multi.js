// Pemeriksaan fitur 1.3: multi toko, penjualan custom, template dokumen, backup & restore.
const zlib = require('zlib');
module.exports = async function ({ A, K, mk, db, ok, assert, base }) {
  // ---- multi toko
  const s1 = (await A.get('/api/auth/me')); assert.equal(s1.store.id, 1); assert.equal(s1.stores.length, 1); ok('toko pertama otomatis dibuat dan dipilih');
  assert.equal((await K.get('/api/stores')).code, 403); ok('kasir tidak bisa kelola toko');
  const st = await A.post('/api/stores', { name: 'CV Ardana Jaya Sejahtera', code: 'ajs', copy_from: 1 }); assert.equal(st.code, 201); const B = st.id; ok('tambah toko (salin pengaturan)');
  assert.equal((await A.post('/api/stores', { name: 'Lain', code: 'AJS' })).code, 409); ok('kode toko unik');
  assert.equal((await A.post('/api/stores', { name: 'X', code: 'bad code!' })).code, 400); ok('kode toko divalidasi');
  A.h['x-store'] = String(B);
  assert.equal((await A.get('/api/auth/me')).store.code, 'AJS'); ok('owner berpindah toko lewat header');
  assert.equal((await A.get('/api/settings')).store_name, 'CV Ardana Jaya Sejahtera'); ok('pengaturan per toko');
  assert.equal((await A.get('/api/products')).total, 0); ok('barang toko baru kosong (terpisah)');
  const cB = await A.post('/api/categories', { name: 'Plastik' }); assert.equal(cB.code, 201);
  const pB = await A.post('/api/products', { sku: 'DUP-1', barcode: '5551234000017', name: 'Plastik Bening 15x33', unit: 'Pak', buy_price: 10000, sell_price: 20000, stock: 500, category_id: cB.id }); assert.equal(pB.code, 201);
  const pB2 = await A.post('/api/products', { name: 'Plastik Hitam 90x120', unit: 'Pak', buy_price: 15000, sell_price: 30000, stock: 300 }); assert.equal(pB2.sku, 'B000001'); ok('SKU otomatis per toko');
  assert.equal((await A.post('/api/products', { sku: 'DUP-1', name: 'Dobel' })).code, 409); ok('SKU dobel dalam satu toko ditolak');
  assert.equal((await A.get('/api/products/' + pB.id)).name, 'Plastik Bening 15x33');
  A.h['x-store'] = '1';
  assert.equal((await A.post('/api/products', { sku: 'DUP-1', barcode: '5551234000017', name: 'Sama di toko 1' })).code, 201); ok('SKU & barcode yang sama boleh ada di toko lain');
  assert.equal((await A.get('/api/products/' + pB.id)).code, 404); ok('barang toko lain tidak bisa dibuka');
  assert.equal((await A.put('/api/products/' + pB.id, { name: 'Hack' })).code, 404); ok('barang toko lain tidak bisa diubah');
  assert.equal((await A.post('/api/products', { name: 'Salah kategori', category_id: cB.id })).code, 400); ok('kategori toko lain ditolak');
  K.h['x-store'] = String(B);
  assert.equal((await K.get('/api/auth/me')).store.id, 1); ok('kasir terkunci ke tokonya (header diabaikan)');
  assert.equal((await K.get('/api/products/catalog')).some((p) => p.id === pB.id), false); ok('katalog kasir hanya toko sendiri');
  A.h['x-store'] = '999'; assert.equal((await A.get('/api/products')).code, 400); A.h['x-store'] = String(B);
  ok('toko tidak dikenal ditolak');

  // kasir toko B
  assert.equal((await A.post('/api/users', { username: 'kasirb', name: 'Kasir B', role: 'kasir', store_id: B, password: 'abc12345' })).code, 201);
  const KB = mk(); assert.equal((await KB.post('/api/auth/login', { username: 'kasirb', password: 'abc12345' })).role, 'kasir');
  assert.equal((await KB.get('/api/auth/me')).store.id, B); ok('kasir toko B masuk ke toko B');
  const saleB = await KB.post('/api/sales', { items: [{ product_id: pB.id, qty: 3 }], method: 'TUNAI', paid: 100000 }); assert.equal(saleB.code, 201); assert.equal(saleB.total, 60000);
  const saleA = await K.post('/api/sales', { items: [{ product_id: (await K.get('/api/products/catalog'))[0].id, qty: 1 }], method: 'TUNAI', paid: 100000 }); assert.equal(saleA.code, 201);
  assert.ok(/^INV-\d{8}-\d{4}$/.test(saleB.sale_no)); ok('penjualan POS per toko (nomor tidak bentrok antar toko)');
  assert.equal((await KB.post('/api/sales', { items: [{ product_id: (await K.get('/api/products/catalog'))[0].id, qty: 1 }], method: 'TUNAI', paid: 99999 })).code, 400); ok('kasir tidak bisa jual barang toko lain');
  assert.equal((await A.get('/api/products/' + pB.id)).stock, 497); ok('stok toko B berkurang');

  // ---- penjualan custom
  const cu = await A.post('/api/customers', { name: 'UPT Puskesmas Talang', address: 'Jl. Raya Sumenep, Pamekasan' }); assert.equal(cu.code, 201);
  const items = [{ product_id: pB.id, qty: 100, price: 16000 }, { product_id: pB2.id, qty: 100, price: 27000, name: 'Plastik Sampah Hitam Ukuran 90x120', unit: 'Pak' }];
  assert.equal((await A.get('/api/invoices/next-no?date=2026-10-08')).no, '01 / X / AJS / 2026'); ok('pratinjau nomor mengikuti format toko');
  const base1 = { customer_id: cu.id, doc_date: '2026-10-08', due_date: '2026-11-27', contract_no: '440/1/KTR/2026', contract_date: '2026-09-01', po_ref: 'EP-01M47T6VJVV4', items };
  const i1 = await A.post('/api/invoices', { ...base1, tax_mode: 'EXCLUDE', tax_rate: 11 }); assert.equal(i1.code, 201);
  assert.equal(i1.sale_no, '01 / X / AJS / 2026'); assert.equal(i1.subtotal, 4300000); assert.equal(i1.tax, 473000); assert.equal(i1.total, 4773000); assert.equal(i1.kind, 'CUSTOM'); assert.equal(i1.method, 'KREDIT'); assert.equal(i1.outstanding, 4773000);
  ok('custom: pajak ditambahkan, nomor otomatis, harga bebas, jadi piutang');
  assert.equal(i1.items[1].name, 'Plastik Sampah Hitam Ukuran 90x120'); assert.equal(i1.items[0].price, 16000); assert.equal((await A.get('/api/products/' + pB.id)).sell_price, 20000); ok('harga & nama custom tidak mengubah master');
  assert.equal((await A.get('/api/products/' + pB.id)).stock, 397); ok('custom: stok berkurang');
  const i2 = await A.post('/api/invoices', { ...base1, tax_mode: 'INCLUDE', tax_rate: 11, items: [{ product_id: pB.id, qty: 1, price: 11100 }] });
  assert.equal(i2.total, 11100); assert.equal(i2.tax, 1100); assert.equal(i2.sale_no, '02 / X / AJS / 2026'); ok('custom: harga sudah termasuk pajak');
  const i3 = await A.post('/api/invoices', { ...base1, tax_mode: 'NONE', paid: 5000, method: 'TRANSFER', items: [{ product_id: pB.id, qty: 1, price: 5000 }] });
  assert.equal(i3.total, 5000); assert.equal(i3.tax, 0); assert.equal(i3.method, 'TRANSFER'); assert.equal(i3.outstanding, 0); ok('custom: tanpa pajak, lunas di muka');
  assert.equal((await A.post('/api/invoices', { ...base1, doc_no: '02 / X / AJS / 2026' })).code, 409); ok('nomor dokumen dobel ditolak');
  assert.equal((await A.post('/api/invoices', { ...base1, customer_id: '' })).code, 400); ok('custom wajib pelanggan');
  assert.equal((await A.post('/api/invoices', { ...base1, paid: 99999999 })).code, 400); ok('pembayaran melebihi total ditolak');
  assert.equal((await A.post('/api/invoices', { ...base1, customer_id: 1 })).code, 400); ok('pelanggan toko lain ditolak');
  assert.equal((await K.post('/api/invoices', base1)).code, 403); ok('kasir tidak bisa penjualan custom');
  const lst = await A.get('/api/sales?kind=CUSTOM&from=2020-01-01&to=2030-01-01'); assert.equal(lst.total, 3); ok('daftar penjualan custom');
  const pay = await A.post(`/api/sales/${i1.id}/payments`, { amount: 1000000, method: 'TRANSFER' }); assert.equal(pay.outstanding, 3773000); ok('custom: cicilan piutang lewat menu yang sama');
  const rcv = await A.get('/api/reports/receivables'); assert.equal(rcv.rows.some((r) => r.sale_no === i1.sale_no), true); ok('custom masuk laporan piutang');
  const rep = await A.get('/api/reports/sales_daily?from=2026-10-08&to=2026-10-08'); assert.ok(rep.rows[0] && rep.rows[0].total >= 4773000); ok('custom masuk laporan penjualan (tanggal dokumen)');
  const v = await A.post(`/api/sales/${i2.id}/void`, { reason: 'uji' }); assert.equal(v.status, 'VOID'); assert.equal((await A.get('/api/products/' + pB.id)).stock, 396); ok('batal custom mengembalikan stok');

  // ---- template dokumen
  for (const tpl of ['default', 'ardana']) {
    assert.equal((await A.put('/api/settings', { doc_template: tpl, address: 'Ds. Grujugan, Pamekasan', phone: '081996875314', bank_name: 'Bank Jatim', bank_account: '1683831065', signer_name: 'ERSAD', signer_title: 'Direktur' })).doc_template, tpl);
    for (const kind of ['invoice', 'delivery', 'payment-request']) {
      const r = await A.get(`/api/docs/${kind}/sale/${i1.id}`, true); assert.equal(r.status, 200, `${tpl}/${kind}`);
      const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.slice(0, 4).toString(), '%PDF');
    }
    ok(`3 PDF custom dengan template ${tpl}`);
  }
  assert.equal((await A.put('/api/settings', { doc_template: 'xxx' })).code, 400); assert.equal((await A.put('/api/settings', { doc_accent: 'merah' })).code, 400); assert.equal((await A.put('/api/settings', { doc_no_format: 'tanpa nomor' })).code, 400); ok('validasi template, warna, format nomor');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await A.put('/api/settings', { tpl_header: PNG, tpl_footer: PNG, tpl_phone_icon: PNG, logo: PNG, doc_template: 'ardana' })).tpl_header, PNG);
  assert.equal((await A.get(`/api/docs/invoice/sale/${i1.id}`, true)).status, 200); ok('gambar template tersimpan dan dipakai di PDF');
  assert.equal((await A.put('/api/settings', { tpl_header: 'data:image/webp;base64,AAAA' })).code, 400); ok('gambar template hanya PNG/JPEG');
  assert.equal((await A.get('/api/settings/public?store=1')).store_name, 'Toko Maju Jaya'); ok('pengaturan publik per toko');

  // ---- laporan & dashboard per toko
  const dashB = await A.get('/api/dashboard'); A.h['x-store'] = '1'; const dashA = await A.get('/api/dashboard');
  assert.ok(dashB.today.total !== dashA.today.total || dashB.product_count !== dashA.product_count); ok('dashboard terpisah per toko');
  A.h['x-store'] = String(B);

  // ---- backup & restore
  const bk = await A.get('/api/backup', true); assert.equal(bk.status, 200); const gz = Buffer.from(await bk.arrayBuffer());
  const data = JSON.parse(zlib.gunzipSync(gz).toString()); assert.equal(data.app, 'pos-retail'); assert.ok(data.tables.sales.length >= 5 && data.tables.stores.length === 2); ok('backup berisi semua toko (.json.gz)');
  assert.equal((await K.get('/api/backup', true)).status, 403); ok('kasir tidak bisa backup');
  const nBefore = (await db.one('SELECT COUNT(*) AS n FROM sales')).n; const sOwnerBefore = (await db.one('SELECT COUNT(*) AS n FROM products')).n;
  await A.post('/api/products', { name: 'Barang setelah backup', stock: 1 });
  const raw = (b, q) => fetch(base + '/api/backup/restore' + q, { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: A.cookie() }, body: b });
  assert.equal((await raw(gz, '')).status, 400); ok('restore tanpa konfirmasi ditolak');
  assert.equal((await raw(Buffer.from('bukan backup'), '?confirm=RESTORE')).status, 400); ok('file bukan backup ditolak');
  assert.equal((await raw(zlib.gzipSync(JSON.stringify({ app: 'pos-retail', schema: 3, tables: { stores: [{ id: 1 }], users: [] } })), '?confirm=RESTORE')).status, 400); ok('backup tanpa owner ditolak (cegah terkunci)');
  const rs = await raw(gz, '?confirm=RESTORE'); assert.equal(rs.status, 200, await rs.clone().text());
  assert.equal((await db.one('SELECT COUNT(*) AS n FROM sales')).n, nBefore); assert.equal((await db.one('SELECT COUNT(*) AS n FROM products')).n, sOwnerBefore);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM products WHERE name = 'Barang setelah backup'")).n, 0); ok('restore mengganti seluruh data sesuai backup');
  const A2 = mk(); assert.equal((await A2.post('/api/auth/login', { username: 'owner', password: 'owner123' })).role, 'owner'); A2.h['x-store'] = String(B);
  assert.equal((await A2.get('/api/sales/' + i1.id)).sale_no, i1.sale_no); ok('login & data utuh setelah restore');
  const nx = await A2.post('/api/products', { name: 'Barang baru pasca restore', stock: 2 }); assert.equal(nx.code, 201); ok('ID & penomoran lanjut normal setelah restore');
  const i4 = await A2.post('/api/invoices', { ...base1, tax_mode: 'NONE', items: [{ product_id: pB.id, qty: 1, price: 1000 }] }); assert.equal(i4.sale_no, '04 / X / AJS / 2026'); ok('counter nomor dokumen ikut dipulihkan');
};
