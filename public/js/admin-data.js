// Panel admin: dashboard, data master, pengguna, identitas & pengaturan toko.
(function () {
  const { $, $$, esc, money, nf, rp, toast } = POS;

  // ---------- Dashboard ----------
  A.route('dashboard', { title: 'Dashboard', async render(el) {
    const d = await POS.get('/api/dashboard');
    const delta = d.today.yesterday ? Math.round((d.today.total - d.today.yesterday) / d.today.yesterday * 100) : null;
    const max = Math.max(...d.days.map((x) => x.total), 1);
    const dn = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    el.innerHTML = A.head('Dashboard', esc(A.ST.store_name) + ' &middot; ' + POS.d(POS.today()), '<a href="/pos.html"><button class="primary">Buka Kasir</button></a>') + `
      <div class="grid kpis">
        <div class="card kpi big"><h3>Penjualan hari ini</h3><div class="v">${rp(d.today.total)}</div><div class="s">${delta == null ? 'Belum ada pembanding kemarin' : `${delta >= 0 ? 'Naik' : 'Turun'} ${Math.abs(delta)}% dari kemarin (${rp(d.today.yesterday)})`}</div></div>
        <div class="card kpi"><h3>Transaksi</h3><div class="v">${nf(d.today.trx)}</div><div class="s">Rata-rata ${rp(d.today.avg)}</div></div>
        <div class="card kpi"><h3>Laba kotor</h3><div class="v">${rp(d.today.profit)}</div><div class="s">Setelah HPP dan diskon</div></div>
        <div class="card kpi"><h3>Nilai stok</h3><div class="v">${rp(d.stock_value)}</div><div class="s">${nf(d.product_count)} barang aktif</div></div>
      </div>
      <div class="grid two">
        <div class="card"><h3>Penjualan 7 hari terakhir</h3><div class="chart">${d.days.map((x, i) => `<div class="col ${i === 6 ? 'today' : ''}"><div class="n">${x.total ? (x.total >= 1e6 ? (x.total / 1e6).toFixed(1) + ' jt' : Math.round(x.total / 1000) + ' rb') : ''}</div><div class="b" style="height:${Math.max(x.total / max * 100, 1.5)}%"></div><div class="l">${dn[new Date(x.date + 'T00:00:00').getDay()]} ${x.date.slice(8)}</div></div>`).join('')}</div></div>
        <div class="card"><h3>Barang terlaris (7 hari)</h3>${d.top.length ? `<table class="t"><tbody>${d.top.map((t) => `<tr><td>${esc(t.name)}</td><td class="r mono muted">${nf(t.qty)}</td><td class="r mono">${money(t.revenue)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Belum ada penjualan</div>'}</div>
      </div>
      <div class="grid three">
        <div class="card"><h3>Stok menipis ${d.low_count ? A.tag(d.low_count + ' barang', 'red') : ''}</h3>${d.low_list.length ? `<table class="t"><tbody>${d.low_list.map((p) => `<tr><td>${esc(p.name)}</td><td class="r mono ${p.stock <= 0 ? '' : ''}">${nf(p.stock)} / ${nf(p.min_stock)} ${esc(p.unit)}</td></tr>`).join('')}</tbody></table><div style="margin-top:10px"><a href="#/reports"><button class="sm">Lihat laporan</button></a></div>` : '<div class="empty">Semua stok aman</div>'}</div>
        <div class="card kpi"><h3>Piutang pelanggan</h3><div class="v">${rp(d.receivable.v)}</div><div class="s">${d.receivable.n} transaksi belum lunas</div><div style="margin-top:12px"><a href="#/sales"><button class="sm">Lihat penjualan</button></a></div></div>
        <div class="card kpi"><h3>Hutang pemasok</h3><div class="v">${rp(d.payable.v)}</div><div class="s">${d.payable.n} pembelian belum lunas &middot; ${d.open_purchases} menunggu barang</div><div style="margin-top:12px"><a href="#/purchases"><button class="sm">Lihat pembelian</button></a></div></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Transaksi terakhir</h3>${A.table([{ h: 'No', f: (r) => `<span class="mono">${esc(r.sale_no)}</span>` }, { h: 'Waktu', f: (r) => POS.dt(r.created_at) }, { h: 'Kasir', f: (r) => esc(r.cashier) }, { h: 'Metode', f: (r) => esc(POS.METHOD[r.method] || r.method) }, { h: 'Status', f: (r) => A.statusTag(r.status) }, { h: 'Total', cls: 'r mono', f: (r) => money(r.total) }], d.recent)}</div>`;
  } });

  // ---------- Barang ----------
  async function catOptions(all) { const c = (await POS.get('/api/categories?limit=500')).rows; return [[all ? '' : '', all ? 'Semua kategori' : '(tanpa kategori)'], ...c.map((x) => [x.id, x.name])]; }
  function productFields(cats, creating) {
    return [
      { type: 'note', hint: `<div class="hint">Nama, SKU, barcode, kategori, dan satuan berlaku untuk <b>semua toko</b>. Harga dasar, harga jual POS, harga e-katalog, harga SP, harga langsung, grosir, dan stok minimum khusus <b>${esc(A.ME.store.name)}</b>.</div>` },
      { name: 'name', label: 'Nama barang', required: true, span: 2 },
      { name: 'sku', label: 'SKU / kode', scan: true, hint: creating ? 'Kosong = dibuat otomatis' : '' },
      { name: 'barcode', label: 'Barcode', scan: true, cam: true, gen: async () => (await POS.post('/api/products/barcode/next')).barcode, hint: creating ? 'Scan barcode kemasan, atau klik Buat otomatis' : '' },
      { name: 'category_id', label: 'Kategori', type: 'select', options: cats }, { name: 'unit', label: 'Satuan', placeholder: 'pcs, kg, box' },
      { name: 'buy_price', label: 'Harga dasar', type: 'number', hint: 'Harga kulakan / modal (dasar laba)' }, { name: 'sell_price', label: 'Harga jual POS (kasir)', type: 'number', required: true, hint: 'Hanya untuk tampil di kasir (POS)' },
      { name: 'price_ekatalog', label: 'Harga E-Katalog', type: 'number', hint: 'Penjualan INAPROC (bisa diubah per transaksi)' }, { name: 'price_sp', label: 'Harga SP', type: 'number', hint: 'Penjualan SP (tidak bisa diubah di faktur)' },
      { name: 'price_langsung', label: 'Harga Langsung', type: 'number', hint: 'Penjualan Langsung (tidak bisa diubah di faktur)' }, { type: 'note', hint: '<div class="hint">Semua harga diisi manual, tidak dihitung otomatis.</div>' },
      { name: 'wholesale_price', label: 'Harga grosir', type: 'number', hint: 'Opsional' }, { name: 'wholesale_min', label: 'Min. qty grosir', type: 'number', hint: 'Harga grosir berlaku mulai qty ini' },
      { name: 'min_stock', label: 'Stok minimum', type: 'number', hint: 'Untuk peringatan stok menipis' },
      { name: 'no_ppn', label: 'Bebas PPN (di faktur tidak dicentang kena PPN, semua toko)', type: 'checkbox' }, { name: 'no_pph', label: 'Bebas PPH (di faktur tidak dicentang kena PPH, semua toko)', type: 'checkbox' },
      creating ? { name: 'stock', label: 'Stok awal (toko ini)', type: 'number' } : { name: 'active', label: 'Barang aktif (tampil di kasir, semua toko)', type: 'checkbox' },
    ];
  }
  // Keterangan laba di bawah tiap input harga jual: selisih terhadap harga dasar (hijau untung, merah minus)
  function bindProfit(el) {
    const buy = el.querySelector('#ff_buy_price'); if (!buy) return;
    const fm = (n) => 'Rp ' + Math.abs(Math.round(n * 100) / 100).toLocaleString('id-ID');
    const boxes = ['sell_price', 'price_ekatalog', 'price_sp', 'price_langsung', 'wholesale_price'].map((k) => {
      const inp = el.querySelector('#ff_' + k); if (!inp) return null;
      const box = document.createElement('div'); box.className = 'hint pf'; box.style.fontWeight = '600'; inp.parentElement.appendChild(box);
      return { inp, box };
    }).filter(Boolean);
    const draw = () => {
      const dasar = POS.toNum(buy.value) || 0;
      for (const { inp, box } of boxes) {
        const price = POS.toNum(inp.value) || 0;
        if (!price) { box.textContent = ''; continue; }
        const d = Math.round((price - dasar) * 100) / 100; const pct = dasar > 0 ? ` (${(d / dasar * 100).toFixed(1).replace('.', ',')}%)` : '';
        box.textContent = (d >= 0 ? 'Laba ' : 'Minus ') + fm(d) + pct + (dasar > 0 ? '' : ' - harga dasar belum diisi');
        box.style.color = d >= 0 ? 'var(--green)' : 'var(--red)';
      }
    };
    el.addEventListener('input', (e) => { if (e.target === buy || boxes.some((b) => b.inp === e.target)) draw(); });
    draw();
  }
  function parseCSV(text) {
    const first = text.split('\n')[0]; const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  const MAP = { sku: 'sku', kode: 'sku', barcode: 'barcode', nama: 'name', name: 'name', nama_barang: 'name', kategori: 'category', category: 'category', satuan: 'unit', unit: 'unit', harga_beli: 'buy_price', buy_price: 'buy_price', harga_jual: 'sell_price', sell_price: 'sell_price', harga_dasar: 'buy_price', harga_ekatalog: 'price_ekatalog', harga_e_katalog: 'price_ekatalog', price_ekatalog: 'price_ekatalog', harga_sp: 'price_sp', price_sp: 'price_sp', harga_langsung: 'price_langsung', price_langsung: 'price_langsung', harga_grosir: 'wholesale_price', min_grosir: 'wholesale_min', stok_minimum: 'min_stock', min_stock: 'min_stock', stok: 'stock', stock: 'stock', stok_awal: 'stock' };
  const NUMC = ['buy_price', 'sell_price', 'price_ekatalog', 'price_sp', 'price_langsung', 'wholesale_price', 'wholesale_min', 'min_stock', 'stock'];
  async function importDialog(reload) {
    const m = A.dialog('Impor barang dari CSV', `<p style="margin-top:0">Kolom: <span class="mono">sku, barcode, nama, kategori, satuan, harga_beli, harga_jual, harga_ekatalog, harga_sp, harga_langsung, harga_grosir, min_grosir, stok_minimum, stok</span>. Baris dengan SKU/barcode yang sudah ada akan memperbarui barang tersebut (stok awal hanya untuk barang baru).</p>
      <p><a href="#" id="tpl">Unduh templat CSV</a></p><input type="file" id="cf" accept=".csv,text/csv"><div id="cres" style="margin-top:12px"></div>`, { wide: false, footer: '<button data-x>Tutup</button><button class="primary" id="cgo" disabled>Impor</button>' });
    let rows = [];
    $('#tpl', m.el).onclick = (e) => { e.preventDefault(); const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('sku,barcode,nama,kategori,satuan,harga_beli,harga_jual,harga_ekatalog,harga_sp,harga_langsung,harga_grosir,min_grosir,stok_minimum,stok\n,8991001000011,Air Mineral 600ml,Minuman,btl,2000,3500,4000,3700,3600,3000,24,10,120\n'); a.download = 'templat-barang.csv'; a.click(); };
    $('#cf', m.el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; const t = (await f.text()).replace(/^﻿/, ''); const r = parseCSV(t);
      const head = r[0].map((h) => MAP[h.trim().toLowerCase().replace(/\s+/g, '_')] || null);
      if (!head.includes('name')) { $('#cres', m.el).innerHTML = '<div class="err">Kolom "nama" tidak ditemukan pada baris pertama</div>'; return; }
      rows = r.slice(1).map((c) => { const o = {}; head.forEach((k, i) => { if (!k) return; let v = (c[i] || '').trim(); if (NUMC.includes(k)) v = v === '' ? undefined : POS.toNum(v); if (v !== undefined && v !== '') o[k] = v; }); return o; });
      $('#cres', m.el).innerHTML = `<div class="muted">${rows.length} baris siap diimpor</div>`; $('#cgo', m.el).disabled = !rows.length;
    };
    $('#cgo', m.el).onclick = async () => {
      $('#cgo', m.el).disabled = true;
      try { const r = await POS.post('/api/products/import', { rows }); $('#cres', m.el).innerHTML = `<div style="color:var(--green)">Selesai: ${r.created} barang baru, ${r.updated} diperbarui.</div>`; reload(); }
      catch (e) { $('#cres', m.el).innerHTML = `<div class="err">${esc(e.message)}${e.details ? '<br>' + e.details.errors.slice(0, 8).map((x) => `Baris ${x.row}: ${esc(x.error)}`).join('<br>') : ''}</div>`; $('#cgo', m.el).disabled = false; }
    };
  }
  A.route('products', { title: 'Barang', async render(el) {
    const cats = await catOptions(false); const catsAll = await catOptions(true);
    await A.list(el, {
      title: 'Barang', sub: 'Master barang bersama semua toko. Stok dan semua harga (dasar, jual POS, e-katalog, SP, langsung) di sini khusus toko aktif.',
      actions: '<button data-act="fill">Barcode otomatis</button><button data-act="labels">Cetak label</button><button data-act="import">Impor CSV</button><button data-act="export">Ekspor stok</button><button data-act="ecat">Excel Harga</button><button class="primary" data-act="new">Tambah barang</button>',
      filters: [{ name: 'q', label: 'Cari', placeholder: 'Nama, SKU, atau barcode', grow: true }, { name: 'category_id', label: 'Kategori', type: 'select', options: catsAll }, { name: 'low', label: 'Filter', type: 'check', text: 'Stok menipis' }],
      url: (q) => '/api/products?' + POS.qs(q),
      cols: [
        { h: 'SKU', f: (r) => `<span class="mono">${esc(r.sku)}</span>` }, { h: 'Barcode', f: (r) => `<span class="mono muted">${esc(r.barcode || '')}</span>` },
        { h: 'Nama', f: (r) => esc(r.name) + (r.category ? `<div class="muted" style="font-size:12px">${esc(r.category)}</div>` : '') + (r.active ? '' : ' ' + A.tag('nonaktif', 'red')) },
        { h: 'Sat', f: (r) => esc(r.unit) }, { h: 'Harga dasar', cls: 'r mono', f: (r) => money(r.buy_price) },
        { h: 'Jual POS', cls: 'r mono', f: (r) => money(r.sell_price) + (r.wholesale_price ? `<div class="muted" style="font-size:11.5px">grosir ${money(r.wholesale_price)} @${nf(r.wholesale_min)}</div>` : '') },
        { h: 'E-Katalog', cls: 'r mono', f: (r) => money(r.price_ekatalog) }, { h: 'SP', cls: 'r mono', f: (r) => money(r.price_sp) }, { h: 'Langsung', cls: 'r mono', f: (r) => money(r.price_langsung) },
        { h: 'Stok', cls: 'r mono', f: (r) => `<span style="${r.stock <= r.min_stock ? 'color:var(--red);font-weight:600' : ''}">${nf(r.stock)}</span>` },
        { h: '', cls: 'r', f: () => A.btn('edit', 'Ubah') + ' ' + A.btn('label', 'Label') + ' ' + A.btn('card', 'Kartu stok') + ' ' + A.btn('del', 'Hapus', 'sm danger') },
      ],
      async onAct(act, row, reload, b, rows) {
        if (act === 'label') return labelDialog([row]);
        if (act === 'labels') return labelDialog(rows);
        if (act === 'fill') { if (await POS.confirm('Beri barcode EAN-13 otomatis ke semua barang aktif yang belum punya barcode?', 'Buat barcode')) { try { const r = await POS.post('/api/products/barcode/fill'); toast(r.filled + ' barang diberi barcode', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); } } return; }
        if (act === 'export') return A.download('/api/reports/stock/excel');
        if (act === 'ecat') return A.download('/api/products/export/harga');
        if (act === 'import') return importDialog(reload);
        if (act === 'card') { sessionStorage.setItem('stockcard.product', JSON.stringify({ id: row.id, name: row.name })); location.hash = '#/stockcard'; return; }
        if (act === 'del') { if (await POS.confirm(`Hapus "${row.name}"? Barang yang sudah punya riwayat hanya dinonaktifkan.`, 'Hapus', true)) { const r = await POS.del('/api/products/' + row.id).catch((e) => toast(e.message, 'err')); if (r) { toast(r.deactivated ? 'Barang dinonaktifkan (punya riwayat)' : 'Dihapus', 'ok'); reload(); } } return; }
        const creating = act === 'new';
        const ok = await A.form({ title: creating ? 'Tambah barang' : 'Ubah barang', wide: true, fields: productFields(cats, creating), values: creating ? { unit: 'pcs' } : row, onOpen: bindProfit, onSubmit: (v) => { v.category_id = v.category_id || null; return creating ? POS.post('/api/products', v) : POS.put('/api/products/' + row.id, v); } });
        if (ok) { toast('Barang tersimpan', 'ok'); reload(); }
      },
    });
  } });


  // Dialog cetak label barcode (rol label thermal atau lembar A4)
  function labelDialog(rows) {
    const items = rows.map((r) => ({ name: r.name, barcode: r.barcode, price: r.sell_price }));
    const noCode = items.filter((i) => !POS.eanNormalize(i.barcode)).length;
    const saved = (() => { try { return JSON.parse(localStorage.getItem('pos.label') || '{}'); } catch (_) { return {}; } })();
    A.form({
      title: 'Cetak label barcode', hint: items.length + ' barang',
      fields: [
        { name: 'mode', label: 'Jenis kertas', type: 'select', options: [['roll', 'Rol label (printer label/thermal)'], ['a4', 'Lembar A4 (printer biasa)']], value: saved.mode || 'roll', span: 2 },
        { name: 'size', label: 'Ukuran label (mm)', type: 'select', options: [['40x25', '40 x 25'], ['50x30', '50 x 30'], ['60x40', '60 x 40'], ['33x15', '33 x 15 (kecil)']], value: saved.size || '40x25' },
        { name: 'copies', label: 'Jumlah per barang', type: 'number', value: saved.copies || 1 },
        { name: 'price', label: 'Tampilkan harga jual', type: 'checkbox', value: saved.price !== false, span: 2 },
        ...(noCode ? [{ name: '_w', type: 'note', hint: `<span style="color:var(--red)">${noCode} barang belum punya barcode EAN-13 dan dilewati.</span> Pakai tombol "Barcode otomatis" lebih dulu.` }] : []),
      ],
      submit: 'Cetak',
      onSubmit: (v) => {
        try { localStorage.setItem('pos.label', JSON.stringify(v)); } catch (_) {}
        const [w, h] = v.size.split('x').map(Number);
        const r = POS.printLabels(items, { mode: v.mode, w, h, copies: v.copies, price: v.price });
        if (!r.printed) throw new Error('Tidak ada barang dengan barcode EAN-13 yang valid');
      },
    });
  }

  // ---------- Master sederhana ----------
  A.crud('categories', { title: 'Kategori', sub: 'Pengelompokan barang', endpoint: '/api/categories', newLabel: 'Tambah kategori', cols: [{ h: 'Nama', f: (r) => esc(r.name) }], fields: [{ name: 'name', label: 'Nama kategori', required: true, span: 2 }] });
  A.crud('suppliers', { title: 'Pemasok', sub: 'Milik bersama semua toko. Dipakai pada pembelian, penerimaan, dan dokumen', endpoint: '/api/suppliers', newLabel: 'Tambah pemasok',
    cols: [{ h: 'Nama', f: (r) => esc(r.name) + (r.active ? '' : ' ' + A.tag('nonaktif', 'red')) }, { h: 'Kontak', f: (r) => esc(r.contact || '') }, { h: 'Telepon', f: (r) => esc(r.phone || '') }, { h: 'Alamat', f: (r) => esc(r.address || '') }],
    fields: [{ name: 'name', label: 'Nama pemasok', required: true, span: 2 }, { name: 'contact', label: 'Nama kontak' }, { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'Email' }, { name: 'npwp', label: 'NPWP' }, { name: 'address', label: 'Alamat', span: 2 }, { name: 'note', label: 'Catatan', span: 2 }, { name: 'active', label: 'Aktif', type: 'checkbox', value: 1 }] });
  A.crud('customers', { title: 'Pelanggan', sub: 'Milik bersama semua toko. Dipakai pada penjualan kredit, invoice, surat jalan, dan SPP', endpoint: '/api/customers', newLabel: 'Tambah pelanggan',
    cols: [{ h: 'Nama', f: (r) => esc(r.name) + (r.active ? '' : ' ' + A.tag('nonaktif', 'red')) }, { h: 'Telepon', f: (r) => esc(r.phone || '') }, { h: 'Alamat', f: (r) => esc(r.address || '') }, { h: 'NPWP', f: (r) => esc(r.npwp || '') }],
    fields: [{ name: 'name', label: 'Nama pelanggan', required: true, span: 2 }, { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'Email' }, { name: 'npwp', label: 'NPWP' }, { name: 'address', label: 'Alamat', span: 2 }, { name: 'spp_to', label: 'Alamat tujuan SPP (Kepada Yth.)', type: 'textarea', rows: 2, span: 2, placeholder: 'Kosongkan untuk otomatis: Kepala [nama pelanggan] + alamat', hint: 'Dipakai pada surat permohonan pembayaran (SPP) di Penjualan INAPROC.' }, { name: 'note', label: 'Catatan', span: 2 }, { name: 'active', label: 'Aktif', type: 'checkbox', value: 1 }] });

  // ---------- Pengguna ----------
  A.route('users', { title: 'Pengguna', async render(el) {
    await A.list(el, {
      title: 'Pengguna', sub: 'Owner mengakses semua menu. Kasir hanya layar kasir.', actions: '<button class="primary" data-act="new">Tambah pengguna</button>',
      url: () => '/api/users',
      cols: [{ h: 'Username', f: (r) => `<span class="mono">${esc(r.username)}</span>` }, { h: 'Nama', f: (r) => esc(r.name) }, { h: 'Peran', f: (r) => A.tag(r.role, r.role === 'owner' ? 'blue' : '') }, { h: 'Toko', f: (r) => (r.role === 'owner' ? '<span class="muted">Semua toko</span>' : esc(r.store_name || '-')) }, { h: 'Status', f: (r) => (r.active ? A.tag('aktif', 'green') : A.tag('nonaktif', 'red')) }, { h: '', cls: 'r', f: () => A.btn('edit', 'Ubah') }],
      async onAct(act, row, reload) {
        const creating = act === 'new';
        const stores = (await POS.get('/api/stores')).rows;
        const fields = [...(creating ? [{ name: 'username', label: 'Username', required: true }] : []), { name: 'name', label: 'Nama lengkap', required: true }, { name: 'role', label: 'Peran', type: 'select', options: [['kasir', 'Kasir'], ['owner', 'Owner']] }, { name: 'store_id', label: 'Toko (untuk kasir)', type: 'select', options: [['', '- pilih -'], ...stores.filter((s) => s.active).map((s) => [s.id, s.name + ' (' + s.code + ')'])], hint: 'Kasir hanya bisa membuka toko ini. Owner otomatis bisa semua toko.' }, { name: 'password', label: creating ? 'Password (min. 6)' : 'Password baru', type: 'password', required: creating, hint: creating ? '' : 'Kosongkan jika tidak diganti' }, ...(creating ? [] : [{ name: 'active', label: 'Akun aktif', type: 'checkbox' }])];
        const ok = await A.form({ title: creating ? 'Tambah pengguna' : 'Ubah pengguna', fields, values: creating ? { role: 'kasir', store_id: A.ME.store.id } : row, onSubmit: (v) => { if (!creating && !v.password) delete v.password; if (v.role === 'owner') v.store_id = null; return creating ? POS.post('/api/users', v) : POS.put('/api/users/' + row.id, v); } });
        if (ok) { toast('Tersimpan', 'ok'); reload(); }
      },
    });
  } });

  // ---------- Identitas & pengaturan ----------
  async function resizeLogo(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('File bukan gambar yang valid')); i.src = url; });
    const sc = Math.min(1, 400 / Math.max(img.width, img.height)); const w = Math.max(Math.round(img.width * sc), 1), h = Math.max(Math.round(img.height * sc), 1);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
    let out = c.toDataURL('image/png');
    if (out.length > 500000) { x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); out = c.toDataURL('image/jpeg', 0.85); }
    if (out.length > 560000) throw new Error('Gambar terlalu besar, gunakan logo yang lebih sederhana');
    return out;
  }
  const SAMPLE = { sale_no: 'INV-20261031-0001', created_at: '2026-10-31 10:15:00', cashier: 'Kasir Satu', customer_name: '', method: 'TUNAI', subtotal: 21000, discount: 1000, tax: 0, total: 20000, paid: 50000, change_amount: 30000, items: [{ name: 'Air Mineral 600ml', unit: 'btl', qty: 2, price: 3500, discount: 0, total: 7000 }, { name: 'Keripik Singkong 150g', unit: 'bks', qty: 1, price: 9500, discount: 0, total: 9500 }, { name: 'Pulpen Hitam', unit: 'pcs', qty: 1, price: 3000, discount: 500, total: 2500 }] };

  A.route('settings', { title: 'Identitas & Pengaturan', async render(el) {
    const S = { ...await POS.get('/api/settings') }; let logo = S.logo || ''; const TPL = (await POS.get('/api/settings/templates')).map((t) => [t.id, t.label]);
    const inp = (k, label, o = {}) => `<div class="${o.span === 2 ? 'span2' : ''}"><label class="f" for="s_${k}">${label}</label>${o.area ? `<textarea id="s_${k}" data-s="${k}" rows="${o.area}">${esc(S[k])}</textarea>` : o.opts ? `<select id="s_${k}" data-s="${k}">${o.opts.map(([v, l]) => `<option value="${v}" ${String(S[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<input id="s_${k}" data-s="${k}" value="${esc(S[k])}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>`}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
    const chk = (k, label, hint) => `<div class="span2"><label class="sw"><input type="checkbox" data-s="${k}" ${S[k] ? 'checked' : ''}> ${label}</label>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    el.innerHTML = A.head('Identitas & Pengaturan', 'Data toko tampil di aplikasi, struk, kop surat, invoice, surat jalan, dan permohonan pembayaran', '<button data-p="device">Printer &amp; perangkat ini</button>') + `
    <div class="split"><div>
      <div class="card sect"><h2>Identitas toko</h2><p>Nama, alamat, dan logo.</p>
        <div class="logo-box" style="margin-bottom:16px"><div class="logo-prev" id="lp"></div><div><input type="file" id="lf" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="width:auto"><div class="hint">PNG/JPG. Dikecilkan otomatis. Logo sederhana hitam-putih paling bagus untuk struk.</div><button class="sm danger" id="lrm" style="margin-top:6px">Hapus logo</button></div></div>
        <div class="form-grid">${inp('store_name', 'Nama toko', { span: 2 })}${inp('store_tagline', 'Slogan / keterangan usaha', { span: 2, ph: 'Contoh: Sembako, ATK, dan kebutuhan harian' })}${inp('address', 'Alamat', { span: 2 })}${inp('city', 'Kota')}${inp('phone', 'Telepon')}${inp('email', 'Email')}${inp('website', 'Website')}${inp('npwp', 'NPWP', { span: 2 })}</div></div>
      <div class="card sect"><h2>Struk</h2><p>Teks tambahan dan ukuran kertas.</p><div class="form-grid">${inp('receipt_header', 'Teks di atas struk', { span: 2, area: 2, hint: 'Opsional, satu baris per teks' })}${inp('receipt_footer', 'Teks di bawah struk', { span: 2, area: 2 })}${inp('paper_width', 'Lebar kertas bawaan', { opts: [['58', '58 mm'], ['80', '80 mm']] })}<div></div>${chk('receipt_show_logo', 'Cetak logo di struk', 'Logo ikut tercetak pada printer ESC/POS dan cetak browser')}${chk('receipt_show_npwp', 'Cetak NPWP di struk')}</div></div>
      <div class="card sect"><h2>Pajak, stok & barcode</h2><p>Berlaku untuk transaksi dan barang baru.</p><div class="form-grid">${inp('tax_percent', 'Pajak (%)', { hint: '0 = tanpa pajak' })}${inp('tax_label', 'Nama pajak', { ph: 'PPN' })}${chk('tax_inclusive', 'Harga jual sudah termasuk pajak')}${chk('allow_negative_stock', 'Izinkan penjualan saat stok kurang dari nol', 'Matikan agar kasir tidak bisa menjual melebihi stok')}${chk('auto_barcode', 'Buat barcode EAN-13 otomatis untuk barang baru tanpa barcode', 'Kode berawalan 20 (khusus internal toko), unik, dan bisa dicetak sebagai label')}${inp('default_due_days', 'Tempo kredit bawaan (hari)')}</div></div>
      <div class="card sect"><h2>Dokumen</h2><p>Dipakai pada invoice, surat jalan, dan permohonan pembayaran (PDF).</p><div class="form-grid">${inp('bank_name', 'Bank')}${inp('bank_account', 'Nomor rekening')}${inp('bank_holder', 'Atas nama', { span: 2 })}${inp('signer_name', 'Nama penandatangan')}${inp('signer_title', 'Jabatan', { ph: 'Pimpinan' })}${inp('doc_note', 'Catatan kaki invoice', { span: 2, area: 2, hint: 'Contoh: Barang yang sudah dibeli tidak dapat dikembalikan.' })}</div></div>
      <div class="card sect"><h2>Template dokumen</h2><p>Tampilan invoice, surat jalan, dan SPP untuk toko ini. Setiap template berbentuk tetap; template baru ditambahkan lewat kode (lihat README).</p><div class="form-grid">
        ${inp('doc_template', 'Template', { opts: TPL })}
      </div></div>
      <div class="sticky-save"><span id="sstat" class="muted" style="align-self:center"></span><button class="primary" id="ssave">Simpan pengaturan <kbd>Ctrl+S</kbd></button></div>
    </div>
    <div style="position:sticky;top:20px"><div class="card sect"><h3>Pratinjau kop surat</h3><div class="kop" id="kop"></div></div><div class="card"><h3>Pratinjau struk</h3><div class="rc" id="rc"></div></div></div></div>`;

    const val = () => { const o = {}; $$('[data-s]', el).forEach((n) => { o[n.dataset.s] = n.type === 'checkbox' ? n.checked : n.value; }); o.logo = logo; return o; };
    function preview() {
      const o = { ...S, ...val() }; o.tax_percent = POS.toNum(o.tax_percent) || 0; o.paper_width = +o.paper_width;
      $('#lp', el).innerHTML = logo ? `<img src="${logo}" alt="">` : '<span class="muted" style="font-size:12px">Belum ada</span>';
      const addr = [o.address, o.city].filter(Boolean).join(', '); const contact = [o.phone && 'Telp. ' + o.phone, o.email, o.website].filter(Boolean).join('  |  ');
      $('#kop', el).innerHTML = `<div class="row">${logo ? `<img src="${logo}" alt="">` : ''}<div><b>${esc(o.store_name)}</b>${o.store_tagline ? `<small>${esc(o.store_tagline)}</small>` : ''}<small>${esc(addr)}</small><small>${esc(contact)}</small>${o.npwp ? `<small>NPWP ${esc(o.npwp)}</small>` : ''}</div></div><div style="text-align:center;padding:14px 0 4px;font-weight:600;letter-spacing:.1em">INVOICE</div>`;
      const W = o.paper_width === 58 ? 32 : 48; const sample = { ...SAMPLE, tax: o.tax_percent && !o.tax_inclusive ? Math.round(20000 * o.tax_percent / 100) : 0 }; sample.total = 20000 + (o.tax_inclusive ? 0 : sample.tax);
      sample.change_amount = 50000 - sample.total; if (o.tax_inclusive && o.tax_percent) sample.tax = Math.round(20000 - 20000 / (1 + o.tax_percent / 100));
      $('#rc', el).innerHTML = POS.receiptLines(sample, o, W).map((l) => l.img ? `<img src="${logo}" alt="">` : `<div class="${l.big ? 'big ' : ''}${l.b ? 'b' : ''}">${esc(l.text) || '&nbsp;'}</div>`).join('');
    }
    el.addEventListener('input', preview); el.addEventListener('change', preview);
    $('#lf', el).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { logo = await resizeLogo(f); preview(); } catch (er) { toast(er.message, 'err'); } e.target.value = ''; };
    $('#lrm', el).onclick = () => { logo = ''; preview(); };
    el.querySelector('[data-p=device]').onclick = () => POS.deviceDialog(A.ST);
    async function save() {
      const o = val(); const n = POS.toNum(o.tax_percent); if (!(n >= 0 && n <= 100)) return toast('Pajak harus 0-100', 'err');
      o.tax_percent = n; o.default_due_days = POS.toNum(o.default_due_days) || 14;
      if (!String(o.store_name).trim()) return toast('Nama toko wajib diisi', 'err');
      $('#ssave', el).disabled = true;
      try { A.ST = await POS.put('/api/settings', o); A.refreshBrand(); $('#sstat', el).textContent = 'Tersimpan ' + new Date().toTimeString().slice(0, 5); toast('Pengaturan tersimpan', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      $('#ssave', el).disabled = false;
    }
    $('#ssave', el).onclick = save;
    document.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && $('#ssave')) { e.preventDefault(); save(); } };
    preview();
  } });
})();
