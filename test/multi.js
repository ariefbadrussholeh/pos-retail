// Pemeriksaan fitur 1.3-1.4: multi toko, penjualan INAPROC (+dokumen), template dokumen, pelanggan bersama, backup & restore.
const zlib = require('zlib');
module.exports = async function ({ A, K, mk, db, ok, assert, base }) {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // ---- multi toko
  const s1 = (await A.get('/api/auth/me')); assert.equal(s1.store.id, 1); assert.equal(s1.stores.length, 1); ok('toko pertama otomatis dibuat dan dipilih');
  assert.equal((await K.get('/api/stores')).code, 403); ok('kasir tidak bisa kelola toko');
  const st = await A.post('/api/stores', { name: 'CV Ardana Jaya Sejahtera', code: 'ajs', copy_from: 1 }); assert.equal(st.code, 201); const B = st.id; ok('tambah toko (salin pengaturan)');
  assert.equal((await A.post('/api/stores', { name: 'Lain', code: 'AJS' })).code, 409); ok('kode toko unik');
  assert.equal((await A.post('/api/stores', { name: 'X', code: 'bad code!' })).code, 400); ok('kode toko divalidasi');
  A.h['x-store'] = String(B);
  assert.equal((await A.get('/api/auth/me')).store.code, 'AJS'); ok('owner berpindah toko lewat header');
  assert.equal((await A.get('/api/settings')).store_name, 'CV Ardana Jaya Sejahtera'); ok('pengaturan per toko');
  const n1 = await (async () => { A.h['x-store'] = '1'; const r = (await A.get('/api/products')).total; A.h['x-store'] = String(B); return r; })();
  const first = await A.get('/api/products?limit=1'); assert.equal((await A.get('/api/products')).total, n1); assert.equal(first.rows[0].stock, 0); ok('toko baru langsung punya semua barang (master bersama, stok 0)');
  const cB = await A.post('/api/categories', { name: 'Plastik' }); assert.equal(cB.code, 201);
  const pB = await A.post('/api/products', { sku: 'DUP-1', barcode: '5551234000017', name: 'Plastik Bening 15x33', unit: 'Pak', buy_price: 10000, sell_price: 20000, stock: 500, category_id: cB.id }); assert.equal(pB.code, 201);
  const pB2 = await A.post('/api/products', { name: 'Plastik Hitam 90x120', unit: 'Pak', buy_price: 15000, stock: 300 }); assert.ok(/^B\d{6}$/.test(pB2.sku)); assert.equal(pB2.sell_price, 19550); ok('SKU otomatis (bersama) + harga jual awal dari acuan harga offline');
  assert.equal((await A.post('/api/products', { sku: 'DUP-1', name: 'Dobel' })).code, 409); ok('SKU dobel ditolak');
  assert.equal((await A.get('/api/products/' + pB.id)).name, 'Plastik Bening 15x33');
  A.h['x-store'] = '1';
  assert.equal((await A.post('/api/products', { sku: 'DUP-1', name: 'Sama di toko 1' })).code, 409); assert.equal((await A.post('/api/products', { name: 'Barcode sama', barcode: '5551234000017' })).code, 409); ok('SKU & barcode unik di semua toko (barang bersama)');
  const pA = (await A.get('/api/products?q=DUP-1')).rows[0]; assert.equal(pA.name, 'Plastik Bening 15x33'); assert.equal(pA.stock, 0); assert.equal(pA.item_id, pB.item_id); assert.notEqual(pA.id, pB.id); ok('barang muncul di toko lain dengan stok 0');
  assert.equal((await A.put('/api/products/' + pA.id, { buy_price: 11000, sell_price: 25000 })).sell_price, 25000);
  A.h['x-store'] = String(B); assert.equal((await A.get('/api/products/' + pB.id)).sell_price, 20000); assert.equal((await A.get('/api/products/' + pB.id)).buy_price, 10000); ok('harga dasar & harga jual berbeda per toko');
  A.h['x-store'] = '1'; assert.equal((await A.put('/api/products/' + pA.id, { name: 'Plastik Bening 15x33 cm', unit: 'Pak' })).name, 'Plastik Bening 15x33 cm');
  A.h['x-store'] = String(B); assert.equal((await A.get('/api/products/' + pB.id)).name, 'Plastik Bening 15x33 cm'); ok('nama/satuan/kategori bersama (ubah di satu toko, berubah di semua)'); A.h['x-store'] = '1';
  assert.equal((await A.get('/api/products/' + pB.id)).code, 404); ok('baris barang toko lain tidak bisa dibuka');
  assert.equal((await A.put('/api/products/' + pB.id, { name: 'Hack' })).code, 404); ok('baris barang toko lain tidak bisa diubah');
  assert.equal((await A.post('/api/products', { name: 'Pakai kategori toko B', category_id: cB.id })).code, 201); ok('kategori milik bersama');
  A.h['x-store'] = String(B); const stB = (await A.get('/api/products?limit=1')).total; A.h['x-store'] = '1'; assert.equal((await A.get('/api/products?limit=1')).total, stB); A.h['x-store'] = '1';
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

  // kotak centang (boolean true) dari form admin harus diterima di Postgres (kolom SMALLINT)
  for (const [u, b] of [['/api/customers', { name: 'Cek Centang', active: true }], ['/api/suppliers', { name: 'Cek Centang', active: true }], ['/api/doc-types', { name: 'Cek Centang', active: true }]]) {
    const r = await A.post(u, b); assert.equal(r.code, 201, u); assert.equal(+r.active, 1);
    assert.equal(+(await A.put(`${u}/${r.id}`, { active: false })).active, 0);
    await A.del(`${u}/${r.id}`);
  }
  ok('kotak centang aktif (true/false) diterima untuk pelanggan, pemasok, jenis dokumen');
  // ---- acuan harga & ekspor Excel e-katalog (toko B)
  A.h['x-store'] = String(B);
  assert.equal((await A.put('/api/settings', { price_laba: 101 })).code, 400); assert.equal((await A.put('/api/settings', { price_akomodasi: -1 })).code, 400); ok('acuan harga divalidasi');
  const sB = await A.get('/api/settings'); assert.deepEqual([sB.price_akomodasi, sB.price_laba, sB.price_pph, sB.price_ppn], [2000, 15, 1.5, 11]); ok('acuan harga standar (2.000, 15%, 1,5%, 11%)');
  const exr = await A.get('/api/products/export/ecatalog', true); assert.equal(exr.status, 200);
  const ExcelJS = require('exceljs'); const wbx = new ExcelJS.Workbook(); await wbx.xlsx.load(Buffer.from(await exr.arrayBuffer())); const wsx = wbx.worksheets[0];
  let rx = null; wsx.eachRow((r) => { if (r.getCell(3).value === 'Plastik Bening 15x33 cm') rx = r; });
  assert.ok(rx); assert.equal(rx.getCell(5).value, 10000); assert.equal(rx.getCell(9).value.result, 13800); assert.equal(rx.getCell(13).value.result, 15525); assert.ok(String(rx.getCell(13).value.formula).includes('K')); assert.equal(wsx.getCell('D2').value, 2000);
  ok('ekspor Excel e-katalog: harga dasar -> harga e-katalog (rumus, bukan dari harga jual)');

  // ---- penjualan faktur: INAPROC / SP / LANGSUNG
  const cus1 = (await A.get('/api/customers?q=berkah')).rows[0].id;
  const cu = await A.post('/api/customers', { name: 'UPT Puskesmas Talang', address: 'Jl. Raya Sumenep, Pamekasan' }); assert.equal(cu.code, 201);
  let auto = 0; const stockOf = async (id) => (await A.get('/api/products/' + id)).stock;
  const items = [{ product_id: pB.id, qty: 100, price: 16000 }, { product_id: pB2.id, qty: 100, price: 27000, name: 'Plastik Sampah Hitam Ukuran 90x120', unit: 'Pak' }];
  assert.equal((await A.get('/api/invoices/next-no?date=2026-10-08')).no, '01 / X / AJS / 2026'); ok('pratinjau nomor mengikuti format');
  const base1 = { type: 'INAPROC', customer_id: cu.id, doc_date: '2026-10-08', due_date: '2026-11-27', contract_no: '440/1/KTR/2026', contract_date: '2026-09-01', items };
  const sB0 = await stockOf(pB.id);
  const i1 = await A.post('/api/invoices', { ...base1, tax_mode: 'NONE', discount: 99999 }); assert.equal(i1.code, 201); auto++;
  assert.equal(i1.sale_no, '01 / X / AJS / 2026'); assert.equal(i1.kind, 'INAPROC'); assert.equal(i1.subtotal, 4300000); assert.equal(i1.discount, 0); assert.equal(i1.tax_mode, 'INCLUDE'); assert.equal(i1.tax, 426126.13); assert.equal(i1.total, 4300000); assert.equal(i1.method, 'KREDIT'); assert.equal(i1.outstanding, 4300000); assert.equal(i1.contract_no, '440/1/KTR/2026');
  ok('INAPROC: harga bebas per baris, PPN sudah termasuk (mode tidak bisa diganti), tanpa diskon, jadi piutang');
  assert.equal(i1.items[1].name, 'Plastik Sampah Hitam Ukuran 90x120'); assert.equal(i1.items[0].price, 16000); assert.equal((await A.get('/api/products/' + pB.id)).sell_price, 20000); ok('harga & nama INAPROC tidak mengubah master');
  assert.equal(await stockOf(pB.id), sB0 - 100); ok('faktur: stok berkurang');
  const i2 = await A.post('/api/invoices', { ...base1, items: [{ product_id: pB.id, qty: 1 }] }); auto++;
  assert.equal(i2.items[0].price, 15525); assert.equal(i2.total, 15525); assert.equal(i2.tax, 1538.51); ok('INAPROC: harga acuan = offline + PPH + PPN (bukan harga jual master)');
  const i3 = await A.post('/api/invoices', { ...base1, type: 'SP', paid: 13800, method: 'TRANSFER', discount: 5000, items: [{ product_id: pB.id, qty: 1, price: 1 }] }); auto++;
  assert.equal(i3.kind, 'SP'); assert.equal(i3.items[0].price, 13800); assert.equal(i3.total, 13800); assert.equal(i3.tax, 0); assert.equal(i3.tax_mode, 'NONE'); assert.equal(i3.method, 'TRANSFER'); assert.equal(i3.outstanding, 0); ok('SP: harga offline terkunci (harga kiriman diabaikan), tanpa diskon, tanpa PPN di bawah Rp 2 juta');
  const sp2 = await A.post('/api/invoices', { ...base1, type: 'SP', tax_mode: 'EXCLUDE', items: [{ product_id: pB.id, qty: 1 }] }); auto++; assert.equal(sp2.tax, 1518); assert.equal(sp2.total, 15318); ok('SP: PPN boleh ditambahkan di bawah Rp 2 juta');
  const big = [{ product_id: pB.id, qty: 200 }];
  assert.equal((await A.post('/api/invoices', { ...base1, type: 'SP', tax_mode: 'NONE', items: big })).code, 400); assert.equal((await A.post('/api/invoices', { ...base1, type: 'LANGSUNG', items: big })).code, 400); ok('SP/Langsung: subtotal di atas Rp 2.000.000 wajib PPN');
  const spBig = await A.post('/api/invoices', { ...base1, type: 'SP', tax_mode: 'EXCLUDE', items: big }); auto++; assert.equal(spBig.subtotal, 2760000); assert.equal(spBig.tax, 303600); assert.equal(spBig.total, 3063600); ok('SP: di atas Rp 2 juta dengan PPN ditambahkan');
  const lg = await A.post('/api/invoices', { ...base1, type: 'LANGSUNG', items: [{ product_id: pB2.id, qty: 1, price: 5 }] }); auto++; assert.equal(lg.kind, 'LANGSUNG'); assert.equal(lg.total, 19550); ok('Langsung: harga offline terkunci');
  assert.equal((await A.post('/api/invoices', { ...base1, type: 'XYZ' })).code, 400); ok('jenis penjualan divalidasi');
  assert.equal((await A.post('/api/invoices', { ...base1, doc_no: i2.sale_no })).code, 409); ok('nomor dokumen dobel ditolak');
  assert.equal((await A.post('/api/invoices', { ...base1, customer_id: '' })).code, 400); ok('faktur wajib pelanggan');
  assert.equal((await A.post('/api/invoices', { ...base1, paid: 99999999 })).code, 400); ok('pembayaran melebihi total ditolak');
  assert.equal((await A.get('/api/customers/' + cus1)).name, 'CV Berkah Abadi'); const nB = (await A.get('/api/customers')).total; A.h['x-store'] = '1'; assert.equal((await A.get('/api/customers')).total, nB); A.h['x-store'] = String(B); ok('pelanggan milik bersama (terlihat di semua toko)');
  assert.equal((await A.post('/api/suppliers', { name: 'Pemasok bersama' })).code, 201); A.h['x-store'] = '1'; assert.equal((await A.get('/api/suppliers?q=bersama')).total, 1); A.h['x-store'] = String(B); ok('pemasok milik bersama');
  assert.equal((await A.post('/api/invoices', { ...base1, customer_id: cus1, items: [{ product_id: pB.id, qty: 1 }] })).code, 201); auto++; ok('pelanggan toko lain boleh dipakai di faktur');
  assert.equal((await K.post('/api/invoices', base1)).code, 403); ok('kasir tidak bisa buat penjualan faktur');
  const lst = await A.get('/api/sales?kind=FAKTUR&from=2020-01-01&to=2030-01-01'); assert.equal(lst.total, auto); assert.equal((await A.get('/api/sales?kind=SP&from=2020-01-01&to=2030-01-01')).total, 3); assert.equal((await A.get('/api/sales?kind=INAPROC&from=2020-01-01&to=2030-01-01')).total, 3); ok('daftar penjualan faktur + filter jenis');
  const pay = await A.post(`/api/sales/${i1.id}/payments`, { amount: 1000000, method: 'TRANSFER' }); assert.equal(pay.outstanding, 3300000); ok('faktur: cicilan piutang lewat menu yang sama');
  const rcv = await A.get('/api/reports/receivables'); assert.equal(rcv.rows.some((r) => r.sale_no === i1.sale_no), true); ok('faktur masuk laporan piutang');
  const rep = await A.get('/api/reports/sales_daily?from=2026-10-08&to=2026-10-08'); assert.ok(rep.rows[0] && rep.rows[0].total >= 4300000); ok('faktur masuk laporan penjualan (tanggal dokumen)');
  const sBefore = await stockOf(pB.id); const v = await A.post(`/api/sales/${i2.id}/void`, { reason: 'uji' }); assert.equal(v.status, 'VOID'); assert.equal(await stockOf(pB.id), sBefore + 1); ok('batal faktur mengembalikan stok');

  // ---- dokumen pendukung INAPROC
  const dts = await A.get('/api/doc-types'); assert.ok(dts.rows.length >= 5 && dts.rows[0].name.includes('Surat Pesanan')); ok('master dokumen terisi jenis awal');
  const dtN = await A.post('/api/doc-types', { name: 'BA Pemeriksaan' }); assert.equal(dtN.code, 201);
  A.h['x-store'] = '1'; assert.equal((await A.get('/api/doc-types')).rows.length, dts.rows.length + 1); A.h['x-store'] = String(B); ok('master dokumen milik bersama');
  const up = (id, q, body, hdr = {}) => fetch(`${base}/api/invoices/${id}/docs?${new URLSearchParams(q)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: A.cookie(), 'x-store': A.h['x-store'], ...hdr }, body });
  const pdfBytes = Buffer.from('%PDF-1.4\n' + 'x'.repeat(2000)); const imgBytes = Buffer.from(PNG.split(',')[1], 'base64');
  const d1 = await up(i1.id, { name: 'SP.pdf', title: 'Surat Pesanan EP-01', type_id: dts.rows[0].id }, pdfBytes); assert.equal(d1.status, 201); const d1j = await d1.json();
  const d2 = await up(i1.id, { name: 'foto bast.png', title: 'Foto serah terima' }, imgBytes); assert.equal(d2.status, 201); assert.equal((await d2.json()).type_name, null);
  const d3 = await up(i1.id, { name: 'kontrak.docx', title: 'Kontrak', type_id: dtN.id }, Buffer.from('docx')); assert.equal(d3.status, 201); const d3j = await d3.json(); ok('unggah banyak dokumen (jenis dari master dan "Lainnya")');
  assert.equal((await A.get(`/api/invoices/${i1.id}/docs`)).rows.length, 3);
  const dl = await A.get(`/api/invoices/${i1.id}/docs/${d1j.id}/file`, true); assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/pdf'); assert.ok(Buffer.from(await dl.arrayBuffer()).equals(pdfBytes)); ok('unduh dokumen sama persis dengan yang diunggah');
  assert.equal((await up(i1.id, { name: 'x.pdf', title: '' }, pdfBytes)).status, 400); assert.equal((await up(i1.id, { name: 'x.exe', title: 'Virus' }, pdfBytes)).status, 400); assert.equal((await up(i1.id, { name: 'x.pdf', title: 'T', type_id: 99999 }, pdfBytes)).status, 400); ok('judul wajib, jenis berkas dan jenis dokumen divalidasi');
  assert.equal((await up(i1.id, { name: 'besar.pdf', title: 'Besar' }, Buffer.alloc(4 * 1024 * 1024 + 10))).status, 413); ok('berkas > 4 MB ditolak');
  assert.equal((await A.put(`/api/invoices/${i1.id}/docs/${d1j.id}`, { title: 'SP (revisi)' })).ok, true); assert.equal((await A.get(`/api/invoices/${i1.id}/docs`)).rows[0].title, 'SP (revisi)'); ok('ubah judul dokumen');
  assert.equal((await A.del(`/api/doc-types/${dts.rows[0].id}`)).code, 409); ok('jenis dokumen yang dipakai tidak bisa dihapus');
  const rp1 = await up(saleB.id, { name: 'a.pdf', title: 'A' }, pdfBytes); assert.equal(rp1.status, 404); ok('dokumen hanya untuk penjualan INAPROC');
  A.h['x-store'] = '1'; assert.equal((await A.get(`/api/invoices/${i1.id}/docs`)).code, 404); A.h['x-store'] = String(B); ok('dokumen toko lain tidak bisa dibuka');
  assert.equal((await K.get(`/api/invoices/${i1.id}/docs`)).code, 403); ok('kasir tidak bisa akses dokumen');
  assert.equal((await A.del(`/api/invoices/${i1.id}/docs/${d3j.id}`)).ok, true); assert.equal((await A.get(`/api/invoices/${i1.id}/docs`)).rows.length, 2); ok('hapus dokumen');

  // ---- template dokumen
  for (const tpl of ['default', 'ardana']) {
    assert.equal((await A.put('/api/settings', { doc_template: tpl, address: 'Ds. Grujugan, Pamekasan', phone: '081996875314', bank_name: 'Bank Jatim', bank_account: '1683831065', signer_name: 'ERSAD', signer_title: 'Direktur' })).doc_template, tpl);
    for (const kind of ['invoice', 'delivery', 'payment-request']) {
      const r = await A.get(`/api/docs/${kind}/sale/${i1.id}`, true); assert.equal(r.status, 200, `${tpl}/${kind}`);
      const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.slice(0, 4).toString(), '%PDF');
    }
    ok(`3 PDF custom dengan template ${tpl}`);
  }
  assert.equal((await A.put('/api/settings', { doc_template: 'xxx' })).code, 400); ok('template tidak dikenal ditolak');
  const tl = await A.get('/api/settings/templates'); assert.deepEqual(tl.map((t) => t.id), ['default', 'ardana']); ok('daftar template berasal dari src/templates');
  const rm = await A.put('/api/settings', { doc_accent: '#000000', doc_no_format: 'x', tpl_header: 'x', doc_template: 'ardana' }); assert.equal(rm.doc_accent, undefined); assert.equal(rm.tpl_header, undefined); ok('opsi warna/gambar/format nomor sudah dihapus');
  const cuS = await A.put('/api/customers/' + cu.id, { spp_to: 'Kepala UPT Puskesmas Talang\nJl. Raya Sumenep No. 1' }); assert.equal(cuS.spp_to, 'Kepala UPT Puskesmas Talang\nJl. Raya Sumenep No. 1'); ok('alamat tujuan SPP di master pelanggan');
  try {
    const { execFileSync } = require('child_process'); const fs = require('fs'); const f = require('os').tmpdir() + '/spp-test.pdf';
    const r = await A.get(`/api/docs/payment-request/sale/${i1.id}`, true); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString(); assert.ok(txt.includes('Jl. Raya Sumenep No. 1')); ok('SPP memakai alamat tujuan dari master pelanggan');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal((await A.get('/api/settings/public?store=1')).store_name, 'Toko Maju Jaya'); ok('pengaturan publik per toko');

  // ---- laporan & dashboard per toko
  const dashB = await A.get('/api/dashboard'); A.h['x-store'] = '1'; const dashA = await A.get('/api/dashboard');
  assert.ok(dashB.today.total !== dashA.today.total || dashB.product_count !== dashA.product_count); ok('dashboard terpisah per toko');
  A.h['x-store'] = String(B);

  // ---- backup & restore
  const bk = await A.get('/api/backup', true); assert.equal(bk.status, 200); const gz = Buffer.from(await bk.arrayBuffer());
  const data = JSON.parse(zlib.gunzipSync(gz).toString()); assert.equal(data.app, 'pos-retail'); assert.ok(data.tables.sales.length >= 5 && data.tables.stores.length === 2 && data.tables.sale_docs.length === 2); ok('backup berisi semua toko (.json.gz)');
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
  const dl2 = await A2.get(`/api/invoices/${i1.id}/docs/${d1j.id}/file`, true); assert.ok(Buffer.from(await dl2.arrayBuffer()).equals(pdfBytes)); assert.equal((await A2.get('/api/doc-types')).rows.length, dts.rows.length + 1); ok('dokumen & master dokumen ikut backup/restore');
  const nx = await A2.post('/api/products', { name: 'Barang baru pasca restore', stock: 2 }); assert.equal(nx.code, 201); ok('ID & penomoran lanjut normal setelah restore');
  const i4 = await A2.post('/api/invoices', { ...base1, tax_mode: 'NONE', items: [{ product_id: pB.id, qty: 1, price: 1000 }] }); assert.equal(i4.sale_no, String(auto + 1).padStart(2, '0') + ' / X / AJS / 2026'); ok('counter nomor dokumen ikut dipulihkan');
};
