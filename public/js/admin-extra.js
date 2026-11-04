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

  // ================= Penjualan INAPROC =================
  const monthStart = today.slice(0, 8) + '01';
  A.route('invoices', { title: 'Penjualan INAPROC', render: (el) => A.list(el, {
    title: 'Penjualan INAPROC', sub: 'Faktur ke perusahaan/instansi di luar POS. Stok tetap berkurang dan tercatat di laporan serta piutang.', initial: { from: monthStart, to: today },
    filters: [{ name: 'from', label: 'Dari', type: 'date' }, { name: 'to', label: 'Sampai', type: 'date' }, { name: 'q', label: 'Cari', placeholder: 'No. dokumen / pelanggan', grow: true }, { name: 'status', label: 'Status', type: 'select', options: [['', 'Semua'], ['DONE', 'Selesai'], ['VOID', 'Batal']] }, { name: 'unpaid', label: 'Filter', type: 'check', text: 'Belum lunas' }],
    actions: '<a href="#/invoice/new"><button class="primary">Buat penjualan INAPROC</button></a>',
    url: (q) => '/api/sales?kind=CUSTOM&' + POS.qs(q),
    cols: [{ h: 'No. dokumen', f: (r) => `<span class="mono">${esc(r.sale_no)}</span>` }, { h: 'Tanggal', f: (r) => POS.d(r.created_at.slice(0, 10)) }, { h: 'Pelanggan', f: (r) => esc(r.customer_name || '-') }, { h: 'No. kontrak', f: (r) => esc(r.contract_no || '') }, { h: 'No. SP', f: (r) => `<span class="mono" style="font-size:12px">${esc(r.po_ref || '')}</span>` }, { h: 'Total', cls: 'r mono', f: (r) => money(r.total) }, { h: 'Status', f: (r) => A.statusTag(r.status) + ' ' + A.payTag(r) }, { h: '', cls: 'r', f: () => A.btn('view', 'Detail') }],
    onRow: (r, reload) => A.saleDetail(r.id, reload),
    onAct: (act, r, reload) => A.saleDetail(r.id, reload),
  }) });

  A.route('invoice', { title: 'Penjualan INAPROC baru', async render(el) {
    const [cust, S] = [(await POS.get('/api/customers?limit=500&active=1')).rows, A.ST];
    let customers = cust; let lines = []; let dueTouched = false;
    const rate0 = 11; // tarif pajak bawaan; bisa diubah per transaksi
    el.innerHTML = A.head('Penjualan INAPROC baru', 'Faktur di luar POS. Harga, nama barang, dan pajak diatur di sini dan tidak mengubah data master.', '<a href="#/invoices"><button>Kembali</button></a>') + `
      <div class="card"><h3>Pelanggan &amp; dokumen</h3><div class="form-grid">
        <div><label class="f">Pelanggan (perusahaan / instansi) *</label><div style="display:flex;gap:6px"><select id="i_cust"></select><button type="button" class="sm" id="i_newc" style="white-space:nowrap">Baru</button></div></div>
        <div><label class="f">Nomor dokumen</label><input id="i_no" placeholder="otomatis"><div class="hint" id="i_nohint"></div></div>
        <div><label class="f">Tanggal dokumen</label><input type="date" id="i_date" value="${today}"></div>
        <div><label class="f">Jatuh tempo pembayaran</label><input type="date" id="i_due" value="${plus(today, S.default_due_days || 14)}"></div>
        <div><label class="f">No. kontrak</label><input id="i_ctr" autocomplete="off"></div>
        <div><label class="f">Tanggal kontrak</label><input type="date" id="i_ctrd"></div>
        <div class="span2"><label class="f">No. surat pesanan (SP)</label><input id="i_po" autocomplete="off" placeholder="Contoh: EP-01M47T6VJVV4KBCBZ0HWNPG0NN"></div>
      </div></div>
      <div class="card" style="margin-top:14px"><h3>Barang</h3><div id="i_items"></div></div>
      <div class="card" style="margin-top:14px"><h3>Pajak, pembayaran &amp; catatan</h3><div class="form-grid">
        <div><label class="f">Pajak</label><select id="i_tax"><option value="NONE">Tanpa pajak</option><option value="EXCLUDE">Belum termasuk pajak (ditambahkan)</option><option value="INCLUDE">Harga sudah termasuk pajak</option></select></div>
        <div><label class="f">Tarif pajak (%)</label><input id="i_rate" value="${rate0}" inputmode="decimal"></div>
        <div><label class="f">Diskon (Rp)</label><input id="i_disc" value="0" inputmode="decimal"></div>
        <div><label class="f">Dibayar di muka (Rp)</label><input id="i_paid" value="0" inputmode="decimal"><div class="hint">0 = belum dibayar, otomatis tercatat sebagai piutang.</div></div>
        <div><label class="f">Metode pembayaran</label><select id="i_method">${Object.entries(POS.METHOD).filter(([k]) => k !== 'KREDIT').map(([k, v]) => `<option value="${k}" ${k === 'TRANSFER' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div><label class="f">Catatan</label><input id="i_note"></div>
      </div><div id="i_tot" style="margin-top:14px"></div><div id="i_err" class="err hidden"></div></div>
      <div class="sticky-save"><button class="primary" id="i_save">Simpan penjualan <kbd>Ctrl+S</kbd></button></div>`;

    const drawCust = (sel) => { $('#i_cust', el).innerHTML = '<option value="">- pilih -</option>' + customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); };
    drawCust('');
    $('#i_newc', el).onclick = async () => {
      const c = await A.form({ title: 'Pelanggan baru', fields: [{ name: 'name', label: 'Nama perusahaan / instansi', required: true, span: 2 }, { name: 'address', label: 'Alamat', span: 2 }, { name: 'spp_to', label: 'Alamat tujuan SPP (Kepada Yth.)', type: 'textarea', rows: 2, span: 2 }, { name: 'phone', label: 'Telepon' }, { name: 'npwp', label: 'NPWP' }], onSubmit: (v) => POS.post('/api/customers', v) });
      if (c && c.id) { customers = [...customers, c]; drawCust(c.id); }
    };
    // nomor otomatis (pratinjau)
    const peek = A.debounce(async () => { try { const r = await POS.get('/api/invoices/next-no?date=' + ($('#i_date', el).value || today)); $('#i_nohint', el).textContent = 'Berikutnya: ' + r.no; } catch (_) {} }, 200);
    peek();
    $('#i_date', el).addEventListener('change', () => { peek(); if (!dueTouched) $('#i_due', el).value = plus($('#i_date', el).value || today, S.default_due_days || 14); });
    $('#i_due', el).addEventListener('change', () => { dueTouched = true; });

    // ----- baris barang -----
    const num = (v) => POS.toNum(v) || 0;
    const itemsEl = $('#i_items', el);
    const lineTotal = (l) => Math.max(num(l.qty) * num(l.price) - num(l.discount), 0);
    function draw() {
      itemsEl.innerHTML = `<table class="t items"><thead><tr><th>Nama barang (tampil di dokumen)</th><th style="width:78px">Satuan</th><th class="r" style="width:90px">Qty</th><th class="r" style="width:130px">Harga</th><th class="r" style="width:100px">Diskon</th><th class="r" style="width:120px">Jumlah</th><th style="width:44px"></th></tr></thead><tbody>${lines.map((l, n) => `<tr data-n="${n}"><td><input data-k="name" value="${esc(l.name)}"><div class="muted" style="font-size:11.5px"><span class="mono">${esc(l.sku || '')}</span> &middot; stok ${nf(l.stock)} ${esc(l.base_unit || '')} &middot; harga master ${money(l.master_price)}</div></td><td><input data-k="unit" value="${esc(l.unit)}"></td><td><input class="r" data-k="qty" value="${esc(String(l.qty).replace('.', ','))}" inputmode="decimal"></td><td><input class="r" data-k="price" value="${esc(String(l.price).replace('.', ','))}" inputmode="decimal"></td><td><input class="r" data-k="discount" value="${esc(String(l.discount).replace('.', ','))}" inputmode="decimal"></td><td class="r mono" data-lt>${money(lineTotal(l))}</td><td><button class="sm danger" data-del>&times;</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty" style="padding:22px">Belum ada barang. Klik "Tambah barang" atau tekan Insert.</td></tr>'}</tbody></table><div style="margin-top:10px"><button data-add>Tambah barang <kbd>Insert</kbd></button></div>`;
      tot();
    }
    async function add() {
      const p = await A.pickProduct(); if (!p) return;
      const ex = lines.find((l) => l.product_id === p.id);
      if (ex) ex.qty = num(ex.qty) + 1; else lines.push({ product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, base_unit: p.unit, stock: p.stock, master_price: p.sell_price, qty: 1, price: p.sell_price, discount: 0 });
      draw();
    }
    itemsEl.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) add(); const d = e.target.closest('[data-del]'); if (d) { lines.splice(+d.closest('tr').dataset.n, 1); draw(); } });
    // ubah di tempat: jangan menggambar ulang tabel agar fokus keyboard tidak hilang saat pindah kolom
    itemsEl.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; const tr = e.target.closest('tr'); const l = lines[+tr.dataset.n]; l[k] = e.target.value; tr.querySelector('[data-lt]').textContent = money(lineTotal(l)); tot(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Insert') { e.preventDefault(); add(); } });

    // ----- ringkasan (rumus sama dengan server) -----
    function calc() {
      const sub = Math.round(lines.reduce((a, l) => a + lineTotal(l), 0) * 100) / 100;
      const disc = num($('#i_disc', el).value); const base = Math.max(sub - disc, 0);
      const mode = $('#i_tax', el).value; const rate = mode === 'NONE' ? 0 : num($('#i_rate', el).value);
      let tax = 0, total = base;
      if (mode === 'EXCLUDE') { tax = Math.round(base * rate) / 100; total = base + tax; } else if (mode === 'INCLUDE') { tax = base - base / (1 + rate / 100); }
      return { subtotal: sub, discount: disc, tax: Math.round(tax * 100) / 100, total: Math.round(total * 100) / 100, paid: num($('#i_paid', el).value), mode, rate };
    }
    function tot() { const c = calc(); $('#i_tot', el).innerHTML = A.totalsBox(c) + (c.paid && c.paid < c.total ? `<div class="muted" style="text-align:right;margin-top:6px">Sisa tagihan (piutang): <b class="mono">${money(c.total - c.paid)}</b></div>` : '') + (c.mode !== 'NONE' ? `<div class="muted" style="text-align:right;margin-top:6px">${c.mode === 'EXCLUDE' ? 'Pajak ditambahkan di atas harga' : 'Harga sudah termasuk pajak; nilai pajak: ' + money(c.tax)}</div>` : ''); }
    ['#i_tax', '#i_rate', '#i_disc', '#i_paid'].forEach((s) => { $(s, el).addEventListener('input', tot); $(s, el).addEventListener('change', tot); });
    $('#i_tax', el).addEventListener('change', () => { $('#i_rate', el).disabled = $('#i_tax', el).value === 'NONE'; });
    $('#i_rate', el).disabled = true;
    draw();

    async function save() {
      const err = $('#i_err', el); err.classList.add('hidden'); const btn = $('#i_save', el);
      const c = calc();
      const body = {
        customer_id: $('#i_cust', el).value, doc_no: $('#i_no', el).value.trim(), doc_date: $('#i_date', el).value, due_date: $('#i_due', el).value || null,
        contract_no: $('#i_ctr', el).value.trim(), contract_date: $('#i_ctrd', el).value || null, po_ref: $('#i_po', el).value.trim(),
        tax_mode: c.mode, tax_rate: c.rate, discount: c.discount, paid: c.paid, method: $('#i_method', el).value, note: $('#i_note', el).value,
        items: lines.map((l) => ({ product_id: l.product_id, name: l.name, unit: l.unit, qty: num(l.qty), price: num(l.price), discount: num(l.discount) })),
      };
      try {
        if (!body.customer_id) throw new Error('Pilih pelanggan');
        if (!body.items.length) throw new Error('Tambahkan minimal satu barang');
        btn.disabled = true;
        const r = await POS.post('/api/invoices', body);
        toast('Tersimpan: ' + r.sale_no, 'ok'); location.hash = '#/invoices'; setTimeout(() => A.saleDetail(r.id, () => {}), 350);
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
          { h: '', cls: 'r', f: (d) => `<button class="sm" data-dedit="${d.id}">Ubah judul</button> <button class="sm danger" data-ddel="${d.id}">Hapus</button>` },
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
