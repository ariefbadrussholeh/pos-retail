// Panel admin tambahan: kelola toko, Penjualan INAPROC (+ dokumen), master dokumen, backup & restore.
(function () {
  const { $, $$, esc, money, nf, rp, toast } = POS;
  const today = POS.today();
  const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (ymd, n) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return ymdOf(d); };

  // ================= Toko =================
  A.route('stores', { title: 'Toko', render: (el) => A.list(el, {
    title: 'Toko', sub: 'Setiap toko punya stok, harga, transaksi, pengaturan, dan template dokumen sendiri. Data antar toko tidak tercampur.',
    actions: '<button class="primary" data-act="new">Tambah toko</button>',
    url: () => '/api/stores',
    cols: [
      { h: 'Kode', f: (r) => `<span class="mono">${esc(r.code)}</span>` },
      { h: 'Nama', f: (r) => esc(r.name) + (r.id === A.ME.store.id ? ' ' + A.tag('aktif dipakai', 'blue') : '') },
      { h: 'Barang', cls: 'r mono', f: (r) => nf(r.products) }, { h: 'Transaksi', cls: 'r mono', f: (r) => nf(r.sales) }, { h: 'Kasir', cls: 'r mono', f: (r) => nf(r.users) },
      { h: 'Status', f: (r) => (r.active ? A.tag('aktif', 'green') : A.tag('nonaktif', 'red')) },
      { h: '', cls: 'r', f: (r) => (r.id === A.ME.store.id ? '' : A.btn('open', 'Buka') + ' ') + A.btn('edit', 'Ubah') },
    ],
    async onAct(act, row, reload, b, rows) {
      if (act === 'open') { POS.setStore(row.id); location.hash = '#/dashboard'; location.reload(); return; }
      const creating = act === 'new';
      const fields = [{ name: 'name', label: 'Nama toko', required: true, span: 2 }, { name: 'code', label: 'Kode toko', required: true, hint: '1-8 huruf/angka, dipakai pada nomor dokumen (contoh: AJS)' }];
      if (creating) fields.push({ name: 'copy_from', label: 'Salin pengaturan dari', type: 'select', options: [['', 'Tidak (pengaturan bawaan)'], ...rows.map((s) => [s.id, `${s.name} (${s.code})`])], hint: 'Menyalin identitas, pajak, template dokumen, dan gambar. Barang dan transaksi tidak disalin.' });
      else fields.push({ name: 'active', label: 'Toko aktif', type: 'checkbox', hint: 'Toko nonaktif tidak bisa dipakai kasir. Riwayat data tetap tersimpan.' });
      const ok = await A.form({ title: creating ? 'Tambah toko' : 'Ubah toko', fields, values: creating ? {} : row, onSubmit: (v) => (creating ? POS.post('/api/stores', { ...v, copy_from: +v.copy_from || 0 }) : POS.put('/api/stores/' + row.id, { name: v.name, code: v.code, active: v.active })) });
      if (ok) { toast('Tersimpan', 'ok'); A.ME = await POS.get('/api/auth/me'); A.renderStoreBox(); reload(); }
    },
  }) });

  // ================= Penjualan Faktur (INAPROC / SP / Langsung) =================
  const monthStart = today.slice(0, 8) + '01';
  const KIND = { INAPROC: ['INAPROC', 'blue'], SP: ['SP', 'yellow'], LANGSUNG: ['Langsung', 'green'] };
  A.kindTag = (k) => (KIND[k] ? A.tag(KIND[k][0], KIND[k][1]) : '');
  A.route('invoices', { title: 'Penjualan Faktur', render: (el) => A.list(el, {
    title: 'Penjualan Faktur', sub: 'Penjualan INAPROC, SP, dan Langsung ke perusahaan/instansi di luar POS. Stok tetap berkurang dan tercatat di laporan serta piutang.', initial: { from: new Date().getFullYear() + '-01-01', to: today, kind: 'FAKTUR' },
    filters: [{ name: 'from', label: 'Dari', type: 'date' }, { name: 'to', label: 'Sampai', type: 'date' }, { name: 'q', label: 'Cari', placeholder: 'No. dokumen / pelanggan', grow: true }, { name: 'kind', label: 'Jenis', type: 'select', options: [['FAKTUR', 'Semua jenis'], ...[['INAPROC', 'INAPROC'], ['SP', 'SP'], ['LANGSUNG', 'Langsung']].filter(([k]) => (A.ST.faktur_types || ['INAPROC', 'SP', 'LANGSUNG']).includes(k))] }, { name: 'status', label: 'Status', type: 'select', options: [['', 'Semua'], ['DONE', 'Selesai'], ['VOID', 'Batal']] }, { name: 'unpaid', label: 'Filter', type: 'check', text: 'Belum lunas' }],
    actions: '<a href="#/invoice/new"><button class="primary">Buat penjualan faktur</button></a>',
    url: (q) => '/api/sales?' + POS.qs({ ...q, kind: q.kind || 'FAKTUR' }),
    cols: [{ h: 'No. SP', f: (r) => `<span class="mono" style="font-size:12px">${esc(r.contract_no || '')}</span>` }, { h: 'No. dokumen', f: (r) => `<span class="mono">${esc(r.sale_no)}</span>` }, { h: 'Jenis', f: (r) => A.kindTag(r.kind) }, { h: 'Tanggal', f: (r) => POS.d(r.created_at.slice(0, 10)) }, { h: 'Pelanggan', f: (r) => esc(r.customer_name || '-') }, { h: 'Total', cls: 'r mono', f: (r) => money(r.total) }, { h: 'Status', f: (r) => A.statusTag(r.status) + ' ' + A.payTag(r) }, { h: '', cls: 'r', f: (r) => A.btn('view', 'Detail') + ' ' + A.btn('docs', 'Dokumen') + (r.status === 'DONE' ? ' ' + A.btn('edit', 'Ubah') : '') + ' ' + A.btn('del', 'Hapus', 'sm danger') }],
    onRow: (r, reload) => A.saleDetail(r.id, reload),
    async onAct(act, r, reload) {
      if (act === 'docs') return A.saleDocsModal(r.id, r.sale_no);
      if (act === 'edit') { location.hash = '#/invoice/edit/' + r.id; return; }
      if (act === 'del') {
        if (!(await POS.confirm(`Hapus penjualan ${r.sale_no}? Stok dikembalikan, pembayaran dan dokumen pendukungnya ikut terhapus. Tindakan ini tidak bisa dibatalkan.`, 'Hapus', true))) return;
        try { await POS.del('/api/invoices/' + r.id); toast('Penjualan dihapus', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); }
        return;
      }
      A.saleDetail(r.id, reload);
    },
  }) });

  const TYPE_INFO = {
    INAPROC: 'Harga = Harga E-Katalog barang (diisi di master barang). Harga boleh diubah per baris.',
    SP: 'Harga = Harga SP barang (diisi di master barang), tidak bisa diedit.',
    LANGSUNG: 'Harga = Harga Langsung barang (diisi di master barang), tidak bisa diedit.',
  };
  const PRICE_KEY = { INAPROC: 'price_ekatalog', SP: 'price_sp', LANGSUNG: 'price_langsung' };
  const PRICE_NAME = { INAPROC: 'Harga E-Katalog', SP: 'Harga SP', LANGSUNG: 'Harga Langsung' };
  const MODE_OPTS = (name) => `<option value="NONE">Tanpa ${name}</option><option value="EXCLUDE">${name} ditambahkan ke harga</option><option value="INCLUDE">Harga sudah termasuk ${name}</option>`;
  // Form penjualan faktur: baru (#/invoice/new) dan ubah (#/invoice/edit/ID)
  A.route('invoice', { title: 'Penjualan Faktur', async render(el, rest) {
    const editId = rest && rest[0] === 'edit' ? +rest[1] : 0;
    const cust = (await POS.get('/api/customers?limit=500&active=1')).rows; const S = A.ST;
    let sale = null;
    if (editId) { sale = await POS.get('/api/sales/' + editId); if (sale.kind === 'POS' || sale.status !== 'DONE') throw new Error('Transaksi ini tidak bisa diubah'); }
    let customers = cust; let lines = []; let dueTouched = !!sale; const allowed = (S.faktur_types && S.faktur_types.length ? S.faktur_types : ['INAPROC', 'SP', 'LANGSUNG']); let type = sale ? sale.kind : allowed[0]; const origType = type;
    if (sale) {
      const ps = await Promise.all([...new Set(sale.items.map((i) => i.product_id))].map((id) => POS.get('/api/products/' + id).catch(() => null)));
      const pm = new Map(ps.filter(Boolean).map((p) => [p.id, p]));
      lines = sale.items.map((i) => { const p = pm.get(i.product_id) || {}; return { product_id: i.product_id, sku: i.sku, name: i.name, unit: i.unit, stock: p.stock || 0, price_ekatalog: p.price_ekatalog || 0, price_sp: p.price_sp || 0, price_langsung: p.price_langsung || 0, qty: i.qty, price: i.price, savedPrice: i.price, edited: true, ppn_on: i.ppn_on !== 0 }; });
    }
    if (sale && !customers.some((c) => c.id === sale.customer_id)) customers = [...customers, { id: sale.customer_id, name: sale.customer_name }];
    el.innerHTML = A.head(sale ? 'Ubah penjualan ' + sale.sale_no : 'Penjualan Faktur baru', 'Faktur di luar POS. Harga diambil dari harga e-katalog / SP / langsung di master barang (bukan harga jual POS).', '<a href="#/invoices"><button>Kembali</button></a>') + `
      <div class="card"><h3>Jenis penjualan</h3>
        <div class="seg" id="i_type" role="radiogroup" aria-label="Jenis penjualan">${Object.entries({ INAPROC: 'Penjualan INAPROC', SP: 'Penjualan SP', LANGSUNG: 'Penjualan Langsung' }).filter(([k]) => allowed.includes(k) || k === origType).map(([k, v]) => `<button type="button" role="radio" data-t="${k}" aria-checked="${k === type}" class="${k === type ? 'primary' : ''}">${v}</button>`).join('')}</div>
        <div class="hint" id="i_tinfo" style="margin-top:8px"></div>
        <div id="i_paywrap" style="margin-top:12px;max-width:320px"><label class="f">Metode pembayaran instansi</label><select id="i_pay"><option value="LS">LS (Langsung)</option><option value="UP">UP (Uang Persediaan)</option></select><div class="hint">Menentukan tarif PPH di laporan (UP 0,5%, LS 1,5%). Tidak tampil di invoice.</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Pelanggan &amp; dokumen</h3><div class="form-grid">
        <div><label class="f">Pelanggan (perusahaan / instansi) *</label><div style="display:flex;gap:6px"><select id="i_cust"></select><button type="button" class="sm" id="i_newc" style="white-space:nowrap">Baru</button></div></div>
        <div><label class="f">Nomor dokumen</label><input id="i_no" placeholder="otomatis" value="${sale ? esc(sale.sale_no) : ''}"><div class="hint" id="i_nohint"></div></div>
        <div><label class="f">Tanggal dokumen</label><input type="date" id="i_date" value="${sale ? (sale.doc_date || sale.created_at.slice(0, 10)) : today}"></div>
        <div><label class="f">Jatuh tempo pembayaran</label><input type="date" id="i_due" value="${sale ? sale.due_date || '' : plus(today, S.default_due_days || 14)}"></div>
        <div><label class="f">No. Kontrak / SP</label><input id="i_ctr" autocomplete="off" placeholder="Contoh: EP-01M47T6VJVV4KBCBZ0HWNPG0NN" value="${sale ? esc(sale.contract_no || '') : ''}"></div>
        <div><label class="f">Tanggal Kontrak / SP</label><input type="date" id="i_ctrd" value="${sale ? sale.contract_date || '' : ''}"></div>
      </div></div>
      <div class="card" style="margin-top:14px"><h3>Barang</h3><div id="i_items"></div></div>
      <div class="card" style="margin-top:14px"><h3>Pajak, pembayaran &amp; catatan</h3><div class="form-grid">
        <div><label class="f">PPN</label><select id="i_tax">${MODE_OPTS('PPN')}</select></div>
        <div><label class="f">Tarif PPN (%)</label><input id="i_taxr" value="${sale && sale.tax_mode !== 'NONE' ? sale.tax_rate : 11}" inputmode="decimal"></div>
        <div class="span2 hint" style="margin-top:-6px">PPN dihitung dari harga sebelum pajak, hanya untuk baris yang dicentang (cabut centang untuk barang yang tidak kena PPN). "Sudah termasuk" berarti PPN sudah ada di dalam harga satuan; "ditambahkan" berarti menambah total. Hasil dibulatkan ke atas ke rupiah penuh.</div>
        ${sale ? `<div class="span2"><div class="muted" style="font-size:12px">Sudah dibayar</div><div class="mono">${money(sale.paid)}</div><div class="hint">Pembayaran diubah lewat tombol Terima pembayaran di detail transaksi.</div></div>`
    : `<div><label class="f">Dibayar di muka (Rp)</label><input id="i_paid" value="0" inputmode="decimal"><div class="hint">0 = belum dibayar, otomatis tercatat sebagai piutang.</div></div>
        <div><label class="f">Metode pembayaran</label><select id="i_method">${Object.entries(POS.METHOD).filter(([k]) => k !== 'KREDIT').map(([k, v]) => `<option value="${k}" ${k === 'TRANSFER' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`}
        <div class="span2"><label class="f">Catatan</label><input id="i_note" value="${sale ? esc(sale.note || '') : ''}"></div>
      </div><div id="i_tot" style="margin-top:14px"></div><div id="i_err" class="err hidden"></div></div>
      <div class="sticky-save"><button class="primary" id="i_save">${sale ? 'Simpan perubahan' : 'Simpan penjualan'} <kbd>Ctrl+S</kbd></button></div>`;
    if (sale) { $('#i_tax', el).value = sale.tax_mode || 'NONE'; if (sale.pay_type) $('#i_pay', el).value = sale.pay_type; }

    const drawCust = (sel) => { $('#i_cust', el).innerHTML = '<option value="">- pilih -</option>' + customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); };
    drawCust(sale ? sale.customer_id : '');
    $('#i_newc', el).onclick = async () => {
      const c = await A.form({ title: 'Pelanggan baru', fields: [{ name: 'name', label: 'Nama perusahaan / instansi', required: true, span: 2 }, { name: 'address', label: 'Alamat', span: 2 }, { name: 'spp_to', label: 'Alamat tujuan SPP (Kepada Yth.)', type: 'textarea', rows: 2, span: 2 }, { name: 'phone', label: 'Telepon' }, { name: 'npwp', label: 'NPWP' }], onSubmit: (v) => POS.post('/api/customers', v) });
      if (c && c.id) { customers = [...customers, c]; drawCust(c.id); }
    };
    const peek = A.debounce(async () => { if (sale) return; try { const r = await POS.get('/api/invoices/next-no?date=' + ($('#i_date', el).value || today)); $('#i_nohint', el).textContent = 'Berikutnya: ' + r.no; } catch (_) {} }, 200);
    peek();
    $('#i_date', el).addEventListener('change', () => { peek(); if (!dueTouched) $('#i_due', el).value = plus($('#i_date', el).value || today, S.default_due_days || 14); });
    $('#i_due', el).addEventListener('change', () => { dueTouched = true; });

    // ----- baris barang -----
    const num = (v) => POS.toNum(v) || 0;
    const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
    const itemsEl = $('#i_items', el);
    const lineTotal = (l) => Math.max(num(l.qty) * num(l.price), 0);
    const editable = () => type === 'INAPROC';
    // harga acuan baris untuk jenis aktif; saat mengubah dan jenisnya tidak berganti, harga yang tercatat dipertahankan
    const refPrice = (l) => (sale && type === origType && l.savedPrice != null ? l.savedPrice : num(l[PRICE_KEY[type]]));
    function draw() {
      const ed = editable();
      itemsEl.innerHTML = `<table class="t items"><thead><tr><th>Nama barang</th><th style="width:84px">Satuan</th><th class="r" style="width:90px">Qty</th><th class="r" style="width:140px">${PRICE_NAME[type]}</th><th class="r" style="width:130px">Jumlah</th><th class="c" style="width:48px" title="Kena PPN">PPN</th><th style="width:44px"></th></tr></thead><tbody>${lines.map((l, n) => `<tr data-n="${n}"><td>${ed ? `<input data-k="name" value="${esc(l.name)}">` : esc(l.name)}${refPrice(l) > 0 ? '' : `<div class="hint" style="color:var(--red)">${PRICE_NAME[type]} belum diisi di master barang</div>`}<div class="muted" style="font-size:11.5px">${esc(l.sku)} &middot; stok ${nf(l.stock)}</div></td><td>${ed ? `<input data-k="unit" value="${esc(l.unit)}">` : esc(l.unit)}</td><td><input class="r mono" data-k="qty" value="${esc(l.qty)}" inputmode="decimal"></td><td class="r">${ed ? `<input class="r mono" data-k="price" value="${esc(l.price)}" inputmode="decimal">${num(l.price) !== refPrice(l) ? `<div class="muted" style="font-size:11.5px">e-katalog ${money(refPrice(l))}</div>` : ''}` : `<span class="mono">${money(l.price)}</span>`}</td><td class="r mono" data-lt>${money(lineTotal(l))}</td><td class="c"><input type="checkbox" data-k="ppn" ${l.ppn_on ? 'checked' : ''} title="Kena PPN"></td><td><button class="sm danger" data-del title="Hapus baris">&times;</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted center" style="padding:18px">Belum ada barang. Tekan Insert atau klik Tambah barang.</td></tr>'}</tbody></table><div style="margin-top:10px"><button data-add>Tambah barang <kbd>Insert</kbd></button></div>`;
      tot();
    }
    async function add() {
      const p = await A.pickProduct({ categories: true }); if (!p) return;
      const ex = lines.find((l) => l.product_id === p.id);
      if (ex) ex.qty = num(ex.qty) + 1; else { const l = { product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, stock: p.stock, price_ekatalog: p.price_ekatalog, price_sp: p.price_sp, price_langsung: p.price_langsung, qty: 1, edited: false, ppn_on: !p.no_ppn }; l.price = num(l[PRICE_KEY[type]]); lines.push(l); }
      draw();
    }
    itemsEl.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) add(); const d = e.target.closest('[data-del]'); if (d) { lines.splice(+d.closest('tr').dataset.n, 1); draw(); } });
    // ubah di tempat: jangan menggambar ulang tabel agar fokus keyboard tidak hilang saat pindah kolom
    itemsEl.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; const tr = e.target.closest('tr'); const l = lines[+tr.dataset.n]; if (k === 'ppn') { l.ppn_on = e.target.checked; tot(); return; } l[k] = e.target.value; if (k === 'price') l.edited = true; tr.querySelector('[data-lt]').textContent = money(lineTotal(l)); tot(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Insert') { e.preventDefault(); add(); } });

    // ----- jenis penjualan: hanya memengaruhi harga -----
    function setType(t) {
      type = t;
      $$('#i_type button', el).forEach((b) => { const on = b.dataset.t === t; b.setAttribute('aria-checked', String(on)); b.classList.toggle('primary', on); });
      $('#i_tinfo', el).textContent = TYPE_INFO[t]; $('#i_paywrap', el).style.display = t === 'INAPROC' ? '' : 'none';
      for (const l of lines) { if (t !== 'INAPROC') l.edited = false; if (!l.edited || (sale && t === origType)) l.price = refPrice(l); }
      draw();
    }
    $('#i_type', el).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setType(b.dataset.t); });

    // ----- ringkasan (rumus sama dengan server) -----
    function calc() {
      const pm = $('#i_tax', el).value; const pr = num($('#i_taxr', el).value);
      const up = (x) => Math.ceil(Math.round(x * 1e6) / 1e6); // bulatkan ke atas, sama dengan server
      let sub = 0; let ppn = 0;
      for (const l of lines) { // DPP per baris, PPN hanya untuk baris yang dicentang
        const t = lineTotal(l); sub += t;
        const onN = pm !== 'NONE' && l.ppn_on;
        const dpp = t / (onN && pm === 'INCLUDE' ? 1 + pr / 100 : 1);
        if (onN) ppn += dpp * pr / 100;
      }
      sub = up(sub); const tax = up(ppn);
      const total = sub + (pm === 'EXCLUDE' ? tax : 0);
      return { subtotal: sub, tax, total, paid: sale ? sale.paid : num($('#i_paid', el).value), pm, pr, taxLabel: `PPN ${pr}%${pm === 'INCLUDE' ? ' (termasuk)' : ''}` };
    }
    function tot() {
      const c = calc();
      $('#i_taxr', el).disabled = c.pm === 'NONE';
      itemsEl.querySelectorAll('input[data-k=ppn]').forEach((x) => { x.disabled = c.pm === 'NONE'; });
      $('#i_tot', el).innerHTML = A.totalsBox(c) + (c.paid && c.paid < c.total ? `<div class="muted" style="text-align:right;margin-top:6px">Sisa tagihan (piutang): <b class="mono">${money(c.total - c.paid)}</b></div>` : '');
    }
    ['#i_tax', '#i_taxr', '#i_paid'].forEach((s) => { const n = $(s, el); if (n) { n.addEventListener('input', tot); n.addEventListener('change', tot); } });
    setType(type);

    async function save() {
      const err = $('#i_err', el); err.classList.add('hidden'); const btn = $('#i_save', el);
      const c = calc();
      const body = {
        type, customer_id: $('#i_cust', el).value, doc_no: $('#i_no', el).value.trim(), doc_date: $('#i_date', el).value, due_date: $('#i_due', el).value || null,
        contract_no: $('#i_ctr', el).value.trim(), contract_date: $('#i_ctrd', el).value || null,
        tax_mode: c.pm, tax_rate: c.pr, pay_type: type === 'INAPROC' ? $('#i_pay', el).value : null, note: $('#i_note', el).value,
        items: lines.map((l) => ({ product_id: l.product_id, name: l.name, unit: l.unit, qty: num(l.qty), price: type === 'INAPROC' ? num(l.price) : undefined, ppn: l.ppn_on ? 1 : 0 })),
      };
      if (!sale) { body.paid = c.paid; body.method = $('#i_method', el).value; }
      try {
        if (!body.customer_id) throw new Error('Pilih pelanggan');
        if (!body.items.length) throw new Error('Tambahkan minimal satu barang');
        btn.disabled = true;
        const r = sale ? await POS.put('/api/invoices/' + sale.id, body) : await POS.post('/api/invoices', body);
        toast('Tersimpan: ' + r.sale_no, 'ok'); location.hash = '#/invoices'; if (!sale) setTimeout(() => A.saleDetail(r.id, () => {}), 350);
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); btn.disabled = false; err.scrollIntoView({ block: 'nearest' }); }
    }
    $('#i_save', el).onclick = save;
    document.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
  } });

  // ================= Dokumen pendukung Penjualan INAPROC =================
  const MAXB = 4 * 1024 * 1024;
  const fsize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  A.saleDocs = async (box, saleId) => {
    if (!box) return;
    const types = (await POS.get('/api/doc-types?active=1&limit=200')).rows;
    const base = `/api/invoices/${saleId}/docs`;
    let docs = []; let staged = [];
    const typeOpts = (sel) => types.map((t) => `<option value="${t.id}" ${String(sel) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('') + `<option value="" ${sel === '' ? 'selected' : ''}>Lainnya</option>`;
    const baseName = (n) => n.replace(/\.[^.]+$/, '');
    function draw() {
      box.innerHTML = `<h3 style="margin:18px 0 6px;font-size:14px">Dokumen (${docs.length})</h3>
        ${A.table([
          { h: 'Judul', f: (d) => `<a href="${POS.su(`${base}/${d.id}/file`)}" target="_blank" rel="noopener">${esc(d.title)}</a><div class="muted" style="font-size:12px">${esc(d.file_name)} &middot; ${fsize(d.size)}</div>` },
          { h: 'Jenis', f: (d) => esc(d.type_name || 'Lainnya') }, { h: 'Diunggah', f: (d) => POS.dt(d.created_at) },
          { h: '', cls: 'r', f: (d) => `<button class="sm ic" data-dedit="${d.id}" title="Ubah judul" aria-label="Ubah judul">${A.ICON.edit}</button> <button class="sm danger ic" data-ddel="${d.id}" title="Hapus" aria-label="Hapus">${A.ICON.del}</button>` },
        ], docs, { empty: 'Belum ada dokumen' })}
        <div style="margin-top:10px"><label class="f">Tambah dokumen (boleh pilih banyak berkas)</label>
          <input type="file" id="sd_file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style="width:auto"><div class="hint">PDF, gambar, Word, Excel, PowerPoint, atau teks. Maksimal 4 MB per berkas.</div></div>
        ${staged.length ? `<div id="sd_stage" style="margin-top:10px">${staged.map((x, i) => `<div class="form-grid" style="border:1px solid var(--line, #ddd);border-radius:8px;padding:10px;margin-bottom:8px" data-i="${i}">
            <div class="span2 muted" style="font-size:12px">${esc(x.file.name)} &middot; ${fsize(x.file.size)}${x.err ? ` <span style="color:#b42318">- ${esc(x.err)}</span>` : ''}</div>
            <div><label class="f">Jenis dokumen</label><select data-k="type">${typeOpts(x.type)}</select></div>
            <div><label class="f">Judul dokumen *</label><input data-k="title" value="${esc(x.title)}" autocomplete="off"></div>
            <div class="span2"><button class="sm" data-rm="${i}">Batal</button></div></div>`).join('')}
          <button class="primary" id="sd_up">Unggah ${staged.length} dokumen</button></div>` : ''}`;
    }
    async function load() { docs = (await POS.get(base)).rows; draw(); }
    box.addEventListener('change', (e) => {
      if (e.target.id === 'sd_file') {
        for (const f of e.target.files) staged.push({ file: f, type: '', title: baseName(f.name), touched: false, err: f.size > MAXB ? 'Lebih dari 4 MB, tidak bisa diunggah' : '' });
        draw(); return;
      }
      const row = e.target.closest('[data-i]'); if (!row || e.target.dataset.k !== 'type') return;
      const x = staged[+row.dataset.i]; x.type = e.target.value;
      if (!x.touched) { const t = types.find((t) => String(t.id) === x.type); x.title = t ? t.name : baseName(x.file.name); row.querySelector('[data-k=title]').value = x.title; }
    });
    box.addEventListener('input', (e) => { const row = e.target.closest('[data-i]'); if (row && e.target.dataset.k === 'title') { const x = staged[+row.dataset.i]; x.title = e.target.value; x.touched = true; } });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rm) { staged.splice(+b.dataset.rm, 1); draw(); }
      else if (b.dataset.ddel) { const d = docs.find((x) => String(x.id) === b.dataset.ddel); if (await POS.confirm(`Hapus dokumen "${d.title}"?`, 'Hapus', true)) { try { await POS.del(`${base}/${d.id}`); toast('Dokumen dihapus', 'ok'); load(); } catch (er) { toast(er.message, 'err'); } } }
      else if (b.dataset.dedit) { const d = docs.find((x) => String(x.id) === b.dataset.dedit); const ok = await A.form({ title: 'Ubah judul dokumen', fields: [{ name: 'title', label: 'Judul dokumen', required: true, span: 2 }], values: d, onSubmit: (v) => POS.put(`${base}/${d.id}`, { title: v.title }) }); if (ok) load(); }
      else if (b.id === 'sd_up') {
        if (staged.some((x) => !x.title.trim())) return toast('Judul dokumen wajib diisi', 'err');
        b.disabled = true; POS.progress.start(); const left = [];
        for (const x of staged) {
          if (x.file.size > MAXB) { left.push(x); continue; }
          try {
            const q = new URLSearchParams({ name: x.file.name, title: x.title.trim(), ...(x.type ? { type_id: x.type } : {}) });
            const r = await fetch(`${base}?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(POS.storeId ? { 'X-Store': String(POS.storeId) } : {}) }, body: x.file, credentials: 'same-origin' });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Gagal mengunggah');
          } catch (er) { x.err = er.message; left.push(x); }
        }
        POS.progress.done(); const n = staged.length - left.length; staged = left;
        if (n) toast(`${n} dokumen diunggah`, 'ok');
        if (left.length) toast('Sebagian dokumen gagal diunggah', 'err');
        await load();
      }
    });
    await load();
  };

  // Modal terpisah: daftar dokumen + unggah (dibuka dari tombol "Dokumen" di detail penjualan faktur)
  A.saleDocsModal = (saleId, no) => { const m = A.dialog('Dokumen ' + no, '<div id="sd_docs"></div>'); return A.saleDocs(m.el.querySelector('#sd_docs'), saleId); };

  // ================= Master Dokumen =================
  A.crud('doctypes', { title: 'Master Dokumen', sub: 'Jenis dokumen yang bisa diunggah pada Penjualan INAPROC. Pilihan "Lainnya" selalu tersedia di layar unggah.', endpoint: '/api/doc-types', newLabel: 'Tambah jenis dokumen',
    cols: [{ h: 'Jenis dokumen', f: (r) => esc(r.name) + (r.active ? '' : ' ' + A.tag('nonaktif', 'red')) }],
    fields: [{ name: 'name', label: 'Nama jenis dokumen', required: true, span: 2 }, { name: 'active', label: 'Aktif', type: 'checkbox', value: 1 }] });

  // ================= Backup & Restore =================
  A.route('backup', { title: 'Backup & Restore', async render(el) {
    el.innerHTML = A.head('Backup & Restore', 'Cadangkan atau pulihkan seluruh data aplikasi (semua toko).') + `
      <div class="split"><div>
        <div class="card sect"><h2>Backup</h2><p>Mengunduh satu file <span class="mono">.json.gz</span> berisi semua toko: barang, stok, transaksi, pengguna, pengaturan, logo, dan gambar template.</p>
          <button class="primary" id="bk">Unduh backup sekarang</button>
          <div class="hint" style="margin-top:8px">Simpan file di tempat aman. Backup bisa dipulihkan ke database Postgres maupun MySQL.</div></div>
        <div class="card sect"><h2>Restore</h2><p><b>Mengganti seluruh data</b> dengan isi file backup. Data yang ada sekarang akan dihapus.</p>
          <div class="form-grid">
            <div class="span2"><label class="f">File backup (.json.gz)</label><input type="file" id="rf" accept=".gz,.json,application/gzip,application/json" style="width:auto"></div>
            <div class="span2"><label class="sw"><input type="checkbox" id="rsafe" checked> Unduh backup data saat ini lebih dulu (disarankan)</label></div>
            <div class="span2"><label class="f">Ketik <b>RESTORE</b> untuk melanjutkan</label><input id="rc" autocomplete="off" placeholder="RESTORE"></div>
          </div>
          <div id="rerr" class="err hidden"></div>
          <div style="margin-top:12px"><button class="danger" id="rgo">Restore data</button></div></div>
      </div><div><div class="card"><h3>Catatan</h3><div class="hint" style="font-size:13px;line-height:1.6">
        Setelah restore, Anda perlu masuk lagi karena akun mengikuti isi backup.<br><br>
        Di Vercel, ukuran unggahan dibatasi sekitar 4,5 MB. Untuk database besar, jalankan restore dari server lokal atau VPS.<br><br>
        Backup dari versi aplikasi yang lebih baru tidak bisa dipulihkan ke versi yang lebih lama.</div></div></div></div>`;
    $('#bk', el).onclick = () => A.download('/api/backup');
    const err = (m) => { const n = $('#rerr', el); n.textContent = m; n.classList.remove('hidden'); };
    $('#rgo', el).onclick = async () => {
      $('#rerr', el).classList.add('hidden');
      const f = $('#rf', el).files[0];
      if (!f) return err('Pilih file backup dulu');
      if ($('#rc', el).value.trim() !== 'RESTORE') return err('Ketik RESTORE untuk konfirmasi');
      if (!(await POS.confirm(`Ganti SELURUH data dengan isi "${f.name}"? Tindakan ini tidak bisa dibatalkan.`, 'Restore', true))) return;
      const btn = $('#rgo', el); btn.disabled = true;
      try {
        if ($('#rsafe', el).checked) { A.download('/api/backup'); await new Promise((r) => setTimeout(r, 2500)); }
        const buf = await f.arrayBuffer();
        POS.progress.start();
        let r;
        try { r = await fetch('/api/backup/restore?confirm=RESTORE', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(POS.storeId ? { 'X-Store': String(POS.storeId) } : {}) }, body: buf, credentials: 'same-origin' }); } finally { POS.progress.done(); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Restore gagal');
        POS.setStore(null);
        el.innerHTML = A.head('Restore selesai', 'Data berhasil dipulihkan.') + '<div class="card"><p>Silakan masuk kembali.</p><a href="/"><button class="primary">Ke halaman masuk</button></a></div>';
      } catch (e) { err(e.message); btn.disabled = false; }
    };
  } });
})();
