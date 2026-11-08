// Panel admin: penjualan, pembelian, penerimaan, opname, kartu stok, laporan.
(function () {
  const { $, $$, esc, money, nf, rp, toast } = POS;
  const today = POS.today();
  const info = (rows) => `<div class="form-grid" style="margin-bottom:14px">${rows.filter((r) => r[1] != null && r[1] !== '').map(([k, v]) => `<div><div class="muted" style="font-size:12px">${esc(k)}</div><div>${v}</div></div>`).join('')}</div>`;
  const totalsBox = (o) => `<div class="tot"><div><span>Subtotal</span><span class="mono">${money(o.subtotal)}</span></div>${o.discount ? `<div><span>Diskon</span><span class="mono">-${money(o.discount)}</span></div>` : ''}${o.tax ? `<div><span>${esc(o.taxLabel || 'Pajak')}</span><span class="mono">${money(o.tax)}</span></div>` : ''}${o.pph ? `<div><span>${esc(o.pphLabel || 'PPH')}</span><span class="mono">${money(o.pph)}</span></div>` : ''}<div class="g"><span>Total</span><span class="mono">${money(o.total)}</span></div>${o.paid ? `<div><span>Dibayar</span><span class="mono">${money(Math.min(o.paid, o.total))}</span></div><div><span>Sisa</span><span class="mono">${money(Math.max(o.total - o.paid, 0))}</span></div>` : ''}</div>`;
  const docBtns = (type, id, outstanding) => `<button data-d="invoice">Invoice</button><button data-d="delivery">Surat Jalan</button>${outstanding > 0 ? '<button data-d="payment-request">Permohonan Pembayaran</button>' : ''}`;
  const bindDocs = (m, type, id) => m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) A.openDoc(b.dataset.d, type, id); });

  // ================= Penjualan =================
  A.route('sales', { title: 'Penjualan', render: (el) => A.list(el, {
    title: 'Penjualan', sub: 'Riwayat transaksi kasir, piutang, dan dokumen', initial: { from: today, to: today },
    filters: [{ name: 'from', label: 'Dari', type: 'date' }, { name: 'to', label: 'Sampai', type: 'date' }, { name: 'q', label: 'Cari', placeholder: 'No. transaksi / pelanggan', grow: true }, { name: 'status', label: 'Status', type: 'select', options: [['', 'Semua'], ['DONE', 'Selesai'], ['VOID', 'Batal']] }, { name: 'unpaid', label: 'Filter', type: 'check', text: 'Belum lunas' }],
    actions: '<button data-act="export">Ekspor Excel</button>',
    url: (q) => '/api/sales?' + POS.qs(q),
    cols: [{ h: 'No', f: (r) => `<span class="mono">${esc(r.sale_no)}</span>${r.kind !== 'POS' ? ' ' + A.kindTag(r.kind) : ''}` }, { h: 'Waktu', f: (r) => POS.dt(r.created_at) }, { h: 'Pelanggan', f: (r) => esc(r.customer_name || 'Umum') }, { h: 'Kasir', f: (r) => esc(r.cashier) }, { h: 'Metode', f: (r) => esc(POS.METHOD[r.method] || r.method) }, { h: 'Total', cls: 'r mono', f: (r) => money(r.total) }, { h: 'Status', f: (r) => A.statusTag(r.status) + ' ' + A.payTag(r) }, { h: '', cls: 'r', f: () => A.btn('view', 'Detail') }],
    onRow: (r, reload) => saleDetail(r.id, reload),
    onAct: (act, r, reload, b) => { if (act === 'export') { const q = b.closest('#view'); A.download(`/api/reports/sales_detail/excel?from=${$('[data-f=from]', q).value}&to=${$('[data-f=to]', q).value}`); } else saleDetail(r.id, reload); },
  }) });
  async function saleDetail(id, reload) {
    const s = await POS.get('/api/sales/' + id);
    if (s.kind !== 'POS') { s.taxLabel = `PPN ${s.tax_rate}%${s.tax_mode === 'INCLUDE' ? ' (termasuk)' : ''}`; s.pphLabel = `PPH ${s.pph_rate}%${s.pph_mode === 'INCLUDE' ? ' (termasuk)' : ''}`; }
    const TAXM = { NONE: 'Tanpa pajak', EXCLUDE: 'Pajak ditambahkan', INCLUDE: 'Harga sudah termasuk pajak' };
    const m = A.dialog('Penjualan ' + s.sale_no, `${info([['Jenis', s.kind === 'POS' ? '' : { INAPROC: 'Penjualan INAPROC', SP: 'Penjualan SP', LANGSUNG: 'Penjualan Langsung' }[s.kind]], ['No. Kontrak / SP', s.contract_no && esc(s.contract_no)], ['Tanggal Kontrak / SP', s.contract_date && POS.d(s.contract_date)], ['PPN', s.kind !== 'POS' ? esc(TAXM[s.tax_mode] || '') + (s.tax_mode && s.tax_mode !== 'NONE' ? ' ' + s.tax_rate + '%' : '') : ''], ['PPH', s.kind !== 'POS' && s.pph_mode && s.pph_mode !== 'NONE' ? esc(TAXM[s.pph_mode].replace('pajak', 'PPH')) + ' ' + s.pph_rate + '%' : ''], ['Waktu', POS.dt(s.created_at)], ['Kasir', esc(s.cashier)], ['Pelanggan', esc(s.customer_name || 'Umum')], ['Metode', esc(POS.METHOD[s.method])], ['Jatuh tempo', s.due_date && POS.d(s.due_date)], ['Status', A.statusTag(s.status) + ' ' + A.payTag(s)]])}
      ${A.table([{ h: 'Barang', f: (i) => esc(i.name) + (s.kind !== 'POS' && ((s.tax_mode && s.tax_mode !== 'NONE' && i.ppn_on === 0) || (s.pph_mode && s.pph_mode !== 'NONE' && i.pph_on === 0)) ? ` <span class="muted" style="font-size:11.5px">(${[s.tax_mode !== 'NONE' && i.ppn_on === 0 ? 'bebas PPN' : '', s.pph_mode && s.pph_mode !== 'NONE' && i.pph_on === 0 ? 'bebas PPH' : ''].filter(Boolean).join(', ')})</span>` : '') }, { h: 'Qty', cls: 'r mono', f: (i) => nf(i.qty) + ' ' + esc(i.unit || '') }, { h: 'Harga', cls: 'r mono', f: (i) => money(i.price) }, { h: 'Jumlah', cls: 'r mono', f: (i) => money(i.total) }], s.items)}
      <div style="margin-top:12px">${totalsBox(s)}</div>
      ${s.payments.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Pembayaran</h3>${A.table([{ h: 'Waktu', f: (p) => POS.dt(p.created_at) }, { h: 'Metode', f: (p) => esc(p.method) }, { h: 'Catatan', f: (p) => esc(p.note || '') }, { h: 'Nominal', cls: 'r mono', f: (p) => money(p.amount) }], s.payments)}` : ''}`,
      { footer: `${s.kind !== 'POS' ? '' : '<button data-r>Cetak struk</button>'}${s.status === 'DONE' ? docBtns('sale', s.id, s.outstanding) : ''}<span style="flex:1"></span>${s.status === 'DONE' && s.outstanding > 0 ? '<button class="primary" data-pay>Terima pembayaran</button>' : ''}${s.status === 'DONE' ? '<button class="danger" data-void>Batalkan</button>' : ''}<button data-x>Tutup</button>` });
    bindDocs(m, 'sale', s.id);
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-r]')) POS.printReceipt(s, A.ST); });
    m.el.querySelector('[data-pay]') && (m.el.querySelector('[data-pay]').onclick = async () => {
      const ok = await A.form({ title: 'Terima pembayaran', fields: [{ name: 'amount', label: `Nominal (sisa ${rp(s.outstanding)})`, type: 'number', required: true, value: s.outstanding, span: 2 }, { name: 'method', label: 'Metode', type: 'select', options: Object.entries(POS.METHOD).filter(([k]) => k !== 'KREDIT') }, { name: 'note', label: 'Catatan' }], onSubmit: (v) => POS.post(`/api/sales/${s.id}/payments`, v) });
      if (ok) { m.close(); toast('Pembayaran dicatat', 'ok'); reload(); }
    });
    m.el.querySelector('[data-void]') && (m.el.querySelector('[data-void]').onclick = async () => {
      const ok = await A.form({ title: 'Batalkan transaksi', fields: [{ name: 'reason', label: 'Alasan pembatalan', required: true, span: 2 }], submit: 'Batalkan transaksi', hint: 'Stok barang dikembalikan', onSubmit: (v) => POS.post(`/api/sales/${s.id}/void`, v) });
      if (ok) { m.close(); toast('Transaksi dibatalkan, stok dikembalikan', 'ok'); reload(); }
    });
  }

  // ================= Pembelian =================
  A.route('purchases', { title: 'Pembelian', render: async (el) => { const sup = (await POS.get('/api/suppliers?limit=500')).rows; return A.list(el, {
    title: 'Pembelian', sub: 'Pesanan ke pemasok, hutang, dan dokumen pembayaran', actions: '<a href="#/purchase/new"><button class="primary">Pembelian baru</button></a>',
    filters: [{ name: 'from', label: 'Dari', type: 'date' }, { name: 'to', label: 'Sampai', type: 'date' }, { name: 'q', label: 'Cari', placeholder: 'No. / pemasok / faktur', grow: true }, { name: 'supplier_id', label: 'Pemasok', type: 'select', options: [['', 'Semua'], ...sup.map((s) => [s.id, s.name])] }, { name: 'status', label: 'Status', type: 'select', options: [['', 'Semua'], ['OPEN', 'Menunggu'], ['PARTIAL', 'Sebagian'], ['RECEIVED', 'Diterima'], ['CANCELLED', 'Dibatalkan']] }, { name: 'unpaid', label: 'Filter', type: 'check', text: 'Belum lunas' }],
    url: (q) => '/api/purchases?' + POS.qs(q),
    cols: [{ h: 'No', f: (r) => `<span class="mono">${esc(r.po_no)}</span>` }, { h: 'Tanggal', f: (r) => POS.d(r.date) }, { h: 'Pemasok', f: (r) => esc(r.supplier_name) + (r.supplier_ref ? `<div class="muted" style="font-size:12px">Faktur ${esc(r.supplier_ref)}</div>` : '') }, { h: 'Jatuh tempo', f: (r) => POS.d(r.due_date) }, { h: 'Total', cls: 'r mono', f: (r) => money(r.total) }, { h: 'Sisa hutang', cls: 'r mono', f: (r) => (r.status === 'CANCELLED' ? '' : money(r.total - r.paid)) }, { h: 'Status', f: (r) => A.statusTag(r.status) + ' ' + A.payTag(r) }, { h: '', cls: 'r', f: () => A.btn('view', 'Detail') }],
    onRow: (r, reload) => purchaseDetail(r.id, reload), onAct: (a, r, reload) => purchaseDetail(r.id, reload),
  }); } });
  async function purchaseDetail(id, reload) {
    const p = await POS.get('/api/purchases/' + id); const open = p.status === 'OPEN' || p.status === 'PARTIAL';
    const m = A.dialog('Pembelian ' + p.po_no, `${info([['Pemasok', esc(p.supplier_name)], ['Tanggal', POS.d(p.date)], ['Jatuh tempo', p.due_date && POS.d(p.due_date)], ['No. faktur pemasok', esc(p.supplier_ref || '')], ['Status', A.statusTag(p.status) + ' ' + A.payTag(p)], ['Catatan', esc(p.note || '')]])}
      ${A.table([{ h: 'Barang', f: (i) => esc(i.name) }, { h: 'Dipesan', cls: 'r mono', f: (i) => nf(i.qty) + ' ' + esc(i.unit || '') }, { h: 'Diterima', cls: 'r mono', f: (i) => nf(i.received) }, { h: 'Harga', cls: 'r mono', f: (i) => money(i.price) }, { h: 'Jumlah', cls: 'r mono', f: (i) => money(i.total) }], p.items)}
      <div style="margin-top:12px">${totalsBox(p)}</div>
      ${p.receipts.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Penerimaan barang</h3>${A.table([{ h: 'No', f: (g) => `<span class="mono">${esc(g.gr_no)}</span>` }, { h: 'Tanggal', f: (g) => POS.d(g.date) }, { h: 'SJ pemasok', f: (g) => esc(g.supplier_do || '') }, { h: 'Status', f: (g) => A.statusTag(g.status) }], p.receipts)}` : ''}
      ${p.payments.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Pembayaran</h3>${A.table([{ h: 'Waktu', f: (x) => POS.dt(x.created_at) }, { h: 'Metode', f: (x) => esc(x.method) }, { h: 'Catatan', f: (x) => esc(x.note || '') }, { h: 'Nominal', cls: 'r mono', f: (x) => money(x.amount) }], p.payments)}` : ''}`,
      { footer: `${p.status !== 'CANCELLED' ? docBtns('purchase', p.id, p.outstanding) : ''}<span style="flex:1"></span>${open ? '<button class="primary" data-recv>Terima barang</button>' : ''}${p.outstanding > 0 ? '<button data-pay>Bayar hutang</button>' : ''}${p.status === 'OPEN' ? '<button data-edit>Ubah</button><button class="danger" data-cancel>Batalkan</button>' : ''}<button data-x>Tutup</button>` });
    bindDocs(m, 'purchase', p.id);
    const on = (s, f) => { const b = m.el.querySelector(s); if (b) b.onclick = f; };
    on('[data-recv]', () => { m.close(); location.hash = '#/receipt/new/' + p.id; });
    on('[data-edit]', () => { m.close(); location.hash = '#/purchase/' + p.id; });
    on('[data-cancel]', async () => { if (await POS.confirm('Batalkan pembelian ini?', 'Batalkan', true)) { try { await POS.post(`/api/purchases/${p.id}/cancel`); m.close(); toast('Dibatalkan', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); } } });
    on('[data-pay]', async () => { const ok = await A.form({ title: 'Bayar hutang', fields: [{ name: 'amount', label: `Nominal (sisa ${rp(p.outstanding)})`, type: 'number', required: true, value: p.outstanding, span: 2 }, { name: 'method', label: 'Metode', type: 'select', options: Object.entries(POS.METHOD).filter(([k]) => k !== 'KREDIT'), value: 'TRANSFER' }, { name: 'note', label: 'Catatan' }], onSubmit: (v) => POS.post(`/api/purchases/${p.id}/payments`, v) }); if (ok) { m.close(); toast('Pembayaran dicatat', 'ok'); reload(); } });
  }
  A.route('purchase', { title: 'Pembelian', async render(el, [arg]) {
    const sup = (await POS.get('/api/suppliers?limit=500&active=1')).rows; const edit = arg && arg !== 'new' ? await POS.get('/api/purchases/' + arg) : null;
    if (edit && edit.status !== 'OPEN') throw new Error('Pembelian ini sudah diterima/dibatalkan dan tidak bisa diubah');
    el.innerHTML = A.head(edit ? 'Ubah ' + edit.po_no : 'Pembelian baru', 'Pesanan ke pemasok. Stok bertambah saat barang diterima.', '<a href="#/purchases"><button>Kembali</button></a>') + `
      <div class="card"><div class="form-grid">
        <div><label class="f">Pemasok *</label><select id="p_sup"><option value="">- pilih -</option>${sup.map((s) => `<option value="${s.id}" ${edit && edit.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div><label class="f">No. faktur / PO pemasok</label><input id="p_ref" value="${esc(edit ? edit.supplier_ref || '' : '')}"></div>
        <div><label class="f">Tanggal</label><input type="date" id="p_date" value="${edit ? edit.date : today}"></div>
        <div><label class="f">Jatuh tempo pembayaran</label><input type="date" id="p_due" value="${edit ? edit.due_date || '' : ''}"></div>
      </div><h3 style="margin:20px 0 8px">Barang</h3><div id="p_items"></div>
      <div class="form-grid" style="margin-top:16px"><div><label class="f">Diskon (Rp)</label><input id="p_disc" value="${edit ? edit.discount : 0}"></div><div><label class="f">Pajak (%)</label><input id="p_tax" value="${edit && edit.subtotal - edit.discount > 0 ? Math.round(edit.tax / (edit.subtotal - edit.discount) * 10000) / 100 : 0}"></div><div class="span2"><label class="f">Catatan</label><input id="p_note" value="${esc(edit ? edit.note || '' : '')}"></div></div>
      <div id="p_tot" style="margin-top:14px"></div><div id="p_err" class="err hidden"></div></div>
      <div class="sticky-save"><button id="p_save" class="primary">Simpan pembelian</button></div>`;
    let ed = null;
    ed = A.itemsEditor($('#p_items', el), { init: edit ? edit.items.map((i) => ({ product_id: i.product_id, sku: i.sku, name: i.name, qty: i.qty, price: i.price })) : [], onChange: tot });
    function tot() { if (!ed) return; const sub = ed.subtotal(); const d = POS.toNum($('#p_disc', el).value) || 0; const t = (sub - d) * (POS.toNum($('#p_tax', el).value) || 0) / 100; $('#p_tot', el).innerHTML = totalsBox({ subtotal: sub, discount: d, tax: t, total: sub - d + t }); }
    $('#p_disc', el).oninput = tot; $('#p_tax', el).oninput = tot; tot();
    $('#p_save', el).onclick = async () => {
      const err = $('#p_err', el); err.classList.add('hidden'); const body = { supplier_id: $('#p_sup', el).value, date: $('#p_date', el).value, due_date: $('#p_due', el).value || null, supplier_ref: $('#p_ref', el).value, discount: POS.toNum($('#p_disc', el).value) || 0, tax_percent: POS.toNum($('#p_tax', el).value) || 0, note: $('#p_note', el).value, items: ed.items() };
      try { if (!body.supplier_id) throw new Error('Pilih pemasok'); const r = edit ? await POS.put('/api/purchases/' + edit.id, body) : await POS.post('/api/purchases', body); toast('Pembelian tersimpan: ' + r.po_no, 'ok'); location.hash = '#/purchases'; }
      catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    };
  } });

  // ================= Penerimaan =================
  A.route('receipts', { title: 'Penerimaan', render: (el) => A.list(el, {
    title: 'Penerimaan barang', sub: 'Stok langsung bertambah saat disimpan, tanpa persetujuan', actions: '<a href="#/receipt/new"><button class="primary">Penerimaan baru</button></a>',
    filters: [{ name: 'from', label: 'Dari', type: 'date' }, { name: 'to', label: 'Sampai', type: 'date' }, { name: 'q', label: 'Cari', placeholder: 'No. / pemasok / SJ', grow: true }],
    url: (q) => '/api/receipts?' + POS.qs(q),
    cols: [{ h: 'No', f: (r) => `<span class="mono">${esc(r.gr_no)}</span>` }, { h: 'Tanggal', f: (r) => POS.d(r.date) }, { h: 'Pemasok', f: (r) => esc(r.supplier_name) }, { h: 'No. pembelian', f: (r) => `<span class="mono">${esc(r.po_no)}</span>` }, { h: 'SJ pemasok', f: (r) => esc(r.supplier_do || '') }, { h: 'Status', f: (r) => A.statusTag(r.status) }, { h: '', cls: 'r', f: () => A.btn('view', 'Detail') }],
    onRow: (r, reload) => receiptDetail(r.id, reload), onAct: (a, r, reload) => receiptDetail(r.id, reload),
  }) });
  async function receiptDetail(id, reload) {
    const g = await POS.get('/api/receipts/' + id);
    const m = A.dialog('Penerimaan ' + g.gr_no, `${info([['Pemasok', esc(g.supplier_name)], ['Tanggal', POS.d(g.date)], ['No. pembelian', esc(g.po_no)], ['SJ pemasok', esc(g.supplier_do || '')], ['Diterima oleh', esc(g.user_name || '')], ['Status', A.statusTag(g.status)], ['Catatan', esc(g.note || '')]])}${A.table([{ h: 'Barang', f: (i) => esc(i.name) + (s.kind !== 'POS' && ((s.tax_mode && s.tax_mode !== 'NONE' && i.ppn_on === 0) || (s.pph_mode && s.pph_mode !== 'NONE' && i.pph_on === 0)) ? ` <span class="muted" style="font-size:11.5px">(${[s.tax_mode !== 'NONE' && i.ppn_on === 0 ? 'bebas PPN' : '', s.pph_mode && s.pph_mode !== 'NONE' && i.pph_on === 0 ? 'bebas PPH' : ''].filter(Boolean).join(', ')})</span>` : '') }, { h: 'Qty', cls: 'r mono', f: (i) => nf(i.qty) + ' ' + esc(i.unit || '') }, { h: 'Harga', cls: 'r mono', f: (i) => money(i.price) }, { h: 'Nilai', cls: 'r mono', f: (i) => money(i.qty * i.price) }], g.items)}`,
      { footer: `${g.status === 'DONE' ? '<button class="danger" data-void>Batalkan penerimaan</button>' : ''}<span style="flex:1"></span><button data-x>Tutup</button>` });
    const v = m.el.querySelector('[data-void]');
    if (v) v.onclick = async () => { const ok = await A.form({ title: 'Batalkan penerimaan', hint: 'Stok dikurangi kembali', fields: [{ name: 'reason', label: 'Alasan', required: true, span: 2 }], submit: 'Batalkan', onSubmit: (x) => POS.post(`/api/receipts/${g.id}/void`, x) }); if (ok) { m.close(); toast('Penerimaan dibatalkan', 'ok'); reload(); } };
  }
  A.route('receipt', { title: 'Penerimaan', async render(el, [arg, pid]) {
    const sup = (await POS.get('/api/suppliers?limit=500&active=1')).rows;
    const pend = [...(await POS.get('/api/purchases?status=OPEN&limit=200')).rows, ...(await POS.get('/api/purchases?status=PARTIAL&limit=200')).rows].sort((a, b) => b.id - a.id);
    let mode = pid ? 'po' : 'po'; let po = null; let ed = null;
    el.innerHTML = A.head('Penerimaan baru', 'Catat barang yang masuk. Stok langsung bertambah.', '<a href="#/receipts"><button>Kembali</button></a>') + `<div class="card">
      <div class="bar"><div><label class="f">Sumber</label><select id="r_mode"><option value="po">Berdasarkan pembelian</option><option value="direct">Langsung (tanpa pembelian)</option></select></div><div class="grow" id="r_src"></div></div>
      <div class="form-grid"><div><label class="f">Tanggal</label><input type="date" id="r_date" value="${today}"></div><div><label class="f">No. surat jalan pemasok</label><input id="r_do"></div><div class="span2"><label class="f">Catatan</label><input id="r_note"></div><div class="span2"><label class="sw"><input type="checkbox" id="r_cost" checked> Perbarui harga beli barang sesuai harga di pembelian</label></div></div>
      <h3 style="margin:20px 0 8px">Barang diterima</h3><div id="r_items"></div><div id="r_err" class="err hidden"></div></div><div class="sticky-save"><button class="primary" id="r_save">Simpan penerimaan</button></div>`;
    const src = $('#r_src', el); const items = $('#r_items', el);
    async function drawPO(id) {
      po = id ? await POS.get('/api/purchases/' + id) : null;
      if (!po) { items.innerHTML = '<div class="empty">Pilih pembelian terlebih dahulu</div>'; return; }
      items.innerHTML = A.table([{ h: 'Barang', f: (i) => esc(i.name) }, { h: 'Dipesan', cls: 'r mono', f: (i) => nf(i.qty) }, { h: 'Sudah diterima', cls: 'r mono', f: (i) => nf(i.received) }, { h: 'Diterima sekarang', cls: 'r', f: (i) => `<input class="r" style="width:110px" data-pi="${i.id}" value="${String(Math.max(i.qty - i.received, 0)).replace('.', ',')}" inputmode="decimal">` }], po.items);
    }
    function drawMode() {
      mode = $('#r_mode', el).value;
      if (mode === 'po') { src.innerHTML = `<label class="f">Pembelian</label><select id="r_po"><option value="">- pilih pembelian yang masih menunggu -</option>${pend.map((p) => `<option value="${p.id}" ${String(p.id) === String(pid) ? 'selected' : ''}>${esc(p.po_no)} - ${esc(p.supplier_name)}</option>`).join('')}</select>`; $('#r_po', el).onchange = (e) => drawPO(e.target.value); drawPO($('#r_po', el).value); }
      else { src.innerHTML = `<label class="f">Pemasok</label><select id="r_sup"><option value="">- pilih -</option>${sup.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`; ed = A.itemsEditor(items, {}); }
    }
    $('#r_mode', el).onchange = drawMode; drawMode();
    $('#r_save', el).onclick = async () => {
      const err = $('#r_err', el); err.classList.add('hidden');
      const body = { date: $('#r_date', el).value, supplier_do: $('#r_do', el).value, note: $('#r_note', el).value, update_cost: $('#r_cost', el).checked };
      try {
        if (mode === 'po') { if (!po) throw new Error('Pilih pembelian'); body.purchase_id = po.id; body.items = $$('[data-pi]', items).map((n) => ({ purchase_item_id: +n.dataset.pi, qty: POS.toNum(n.value) || 0 })); }
        else { body.supplier_id = $('#r_sup', el).value; if (!body.supplier_id) throw new Error('Pilih pemasok'); body.items = ed.items(); }
        const g = await POS.post('/api/receipts', body); toast('Penerimaan tersimpan: ' + g.gr_no, 'ok'); location.hash = '#/receipts';
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    };
  } });

  // ================= Stok opname =================
  A.route('opnames', { title: 'Stok Opname', render: (el) => A.list(el, {
    title: 'Stok opname', sub: 'Hasil hitung fisik langsung menyesuaikan stok, tanpa persetujuan', actions: '<a href="#/opname/new"><button class="primary">Opname baru</button></a>',
    url: (q) => '/api/opnames?' + POS.qs(q),
    cols: [{ h: 'No', f: (r) => `<span class="mono">${esc(r.opname_no)}</span>` }, { h: 'Tanggal', f: (r) => POS.d(r.date) }, { h: 'Petugas', f: (r) => esc(r.user_name || '') }, { h: 'Barang dihitung', cls: 'r mono', f: (r) => r.items }, { h: 'Nilai selisih', cls: 'r mono', f: (r) => `<span style="color:${r.diff_value < 0 ? 'var(--red)' : 'inherit'}">${money(r.diff_value)}</span>` }, { h: 'Catatan', f: (r) => esc(r.note || '') }, { h: '', cls: 'r', f: () => A.btn('view', 'Detail') }],
    onRow: (r) => opnameDetail(r.id), onAct: (a, r) => opnameDetail(r.id),
  }) });
  async function opnameDetail(id) {
    const o = await POS.get('/api/opnames/' + id);
    A.dialog('Opname ' + o.opname_no, info([['Tanggal', POS.d(o.date)], ['Petugas', esc(o.user_name || '')], ['Catatan', esc(o.note || '')]]) + A.table([{ h: 'Barang', f: (i) => esc(i.name) }, { h: 'Stok sistem', cls: 'r mono', f: (i) => nf(i.system_qty) }, { h: 'Hasil hitung', cls: 'r mono', f: (i) => nf(i.counted_qty) }, { h: 'Selisih', cls: 'r mono', f: (i) => `<span style="color:${i.diff < 0 ? 'var(--red)' : i.diff > 0 ? 'var(--green)' : 'inherit'}">${i.diff > 0 ? '+' : ''}${nf(i.diff)}</span>` }, { h: 'Nilai', cls: 'r mono', f: (i) => money(i.diff * i.cost) }], o.items));
  }
  A.route('opname', { title: 'Opname baru', async render(el) {
    const cats = (await POS.get('/api/categories?limit=500')).rows; let sheet = await POS.get('/api/opnames/sheet'); const counted = new Map();
    el.innerHTML = A.head('Opname baru', 'Isi kolom "Hitung" hanya untuk barang yang dihitung. Atau scan barcode: setiap scan menambah hitungan 1. Kolom kosong diabaikan.', '<a href="#/opnames"><button>Kembali</button></a>') + `<div class="bar"><div class="grow"><label class="f">Cari barang</label><input id="o_q" placeholder="Nama / SKU / barcode"></div><div><label class="f">Kategori</label><select id="o_cat"><option value="">Semua</option>${cats.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></div><div><label class="f">Tanggal</label><input type="date" id="o_date" value="${today}"></div><div><label class="f">Catatan</label><input id="o_note" placeholder="Opname rak depan"></div></div>
      <div class="tablewrap" id="o_tw"></div><div class="sticky-save"><span class="muted" id="o_sum" style="align-self:center"></span><button class="primary" id="o_save">Simpan hasil opname</button></div><div id="o_err" class="err hidden"></div>`;
    const draw = () => {
      const q = $('#o_q', el).value.toLowerCase(); const c = $('#o_cat', el).value;
      const rows = sheet.filter((p) => (!c || p.category === c) && (!q || `${p.name} ${p.sku} ${p.barcode || ''}`.toLowerCase().includes(q))).slice(0, 400);
      $('#o_tw', el).innerHTML = A.table([{ h: 'SKU', f: (p) => `<span class="mono muted">${esc(p.sku)}</span>` }, { h: 'Barang', f: (p) => esc(p.name) + (p.category ? `<div class="muted" style="font-size:12px">${esc(p.category)}</div>` : '') }, { h: 'Stok sistem', cls: 'r mono', f: (p) => nf(p.stock) + ' ' + esc(p.unit) }, { h: 'Hitung', cls: 'r', f: (p) => `<input class="r" style="width:110px" data-id="${p.id}" value="${counted.has(p.id) ? esc(counted.get(p.id)) : ''}" inputmode="decimal">` }, { h: 'Selisih', cls: 'r mono', f: (p) => `<span data-diff="${p.id}"></span>` }], rows, { empty: 'Tidak ada barang' });
      rows.forEach((p) => diff(p.id)); sum();
    };
    const diff = (id) => { const s = $(`[data-diff="${id}"]`, el); if (!s) return; const p = sheet.find((x) => x.id === id); const v = counted.get(id); if (v === undefined || v === '') { s.textContent = ''; return; } const n = POS.toNum(v); if (!Number.isFinite(n)) { s.textContent = '?'; return; } const d = Math.round((n - p.stock) * 1000) / 1000; s.textContent = (d > 0 ? '+' : '') + nf(d); s.style.color = d < 0 ? 'var(--red)' : d > 0 ? 'var(--green)' : ''; };
    const sum = () => { const n = [...counted.values()].filter((v) => v !== '').length; $('#o_sum', el).textContent = `${n} barang diisi`; };
    $('#o_tw', el).addEventListener('input', (e) => { const id = +e.target.dataset.id; if (!id) return; counted.set(id, e.target.value.trim()); diff(id); sum(); });
    $('#o_tw', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.id) { e.preventDefault(); const all = $$('[data-id]', el); const i = all.indexOf(e.target); if (all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); } } });
    $('#o_q', el).oninput = A.debounce(draw, 200); $('#o_cat', el).onchange = draw; draw();
    // Scanner: scan barcode = hitung +1 untuk barang tersebut (Enter dari scanner tidak menyimpan apa pun)
    $('#o_q', el).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const t = e.target.value.trim(); if (!t) return;
      const p = sheet.find((x) => x.barcode === t || x.sku === t);
      if (!p) { POS.beep(false); toast('Barcode tidak dikenal: ' + t, 'err'); e.target.select(); return; }
      const cur = POS.toNum(counted.get(p.id)); const n = (Number.isFinite(cur) ? cur : 0) + 1; counted.set(p.id, String(n));
      e.target.value = ''; POS.beep(true); toast(`${p.name}: ${n} ${p.unit}`, 'ok'); draw(); e.target.focus();
    });
    $('#o_save', el).onclick = async () => {
      const err = $('#o_err', el); err.classList.add('hidden');
      const items = [...counted.entries()].filter(([, v]) => v !== '').map(([id, v]) => ({ product_id: id, counted: POS.toNum(v) }));
      try {
        if (!items.length) throw new Error('Isi minimal satu hasil hitung');
        if (items.some((i) => !Number.isFinite(i.counted) || i.counted < 0)) throw new Error('Ada hasil hitung yang bukan angka');
        if (!(await POS.confirm(`Simpan opname ${items.length} barang? Stok langsung disesuaikan.`, 'Simpan'))) return;
        const o = await POS.post('/api/opnames', { date: $('#o_date', el).value, note: $('#o_note', el).value, items }); toast('Opname tersimpan: ' + o.opname_no, 'ok'); location.hash = '#/opnames';
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    };
  } });

  // ================= Kartu stok =================
  const MT = { OPENING: 'Stok awal', SALE: 'Penjualan', SALE_VOID: 'Batal jual', SALE_EDIT: 'Ubah jual', RECEIPT: 'Penerimaan', RECEIPT_VOID: 'Batal terima', OPNAME: 'Opname', ADJUST: 'Penyesuaian' };
  A.route('stockcard', { title: 'Kartu Stok', async render(el) {
    let prod = null; try { prod = JSON.parse(sessionStorage.getItem('stockcard.product') || 'null'); } catch (_) {}
    const d30 = new Date(); d30.setDate(d30.getDate() - 30); const from0 = POS.today.call ? `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}` : today;
    el.innerHTML = A.head('Kartu stok', 'Riwayat keluar-masuk barang beserta saldo', '<button id="k_adj" disabled>Penyesuaian stok</button>') + `<div class="bar"><div class="grow"><label class="f">Barang</label><button id="k_pick" style="width:100%;text-align:left"></button></div><div><label class="f">Dari</label><input type="date" id="k_from" value="${from0}"></div><div><label class="f">Sampai</label><input type="date" id="k_to" value="${today}"></div></div><div class="tablewrap" id="k_tw"><div class="empty">Pilih barang untuk melihat kartu stok</div></div>`;
    const setBtn = () => { $('#k_pick', el).textContent = prod ? prod.name : 'Klik untuk memilih barang'; $('#k_adj', el).disabled = !prod; };
    async function load() {
      setBtn(); if (!prod) return;
      const r = await POS.get(`/api/stock/card?product_id=${prod.id}&from=${$('#k_from', el).value}&to=${$('#k_to', el).value}`);
      $('#k_tw', el).innerHTML = A.table([{ h: 'Waktu', f: (x) => x.created_at ? POS.dt(x.created_at) : '' }, { h: 'Jenis', f: (x) => esc(x.type === '_open' ? 'Saldo awal periode' : MT[x.type] || x.type) }, { h: 'Referensi', f: (x) => `<span class="mono">${esc(x.ref_no || '')}</span>` }, { h: 'Keterangan', f: (x) => esc(x.note || '') + (x.user_name ? ` <span class="muted">(${esc(x.user_name)})</span>` : '') }, { h: 'Masuk', cls: 'r mono', f: (x) => (x.qty > 0 && x.type !== '_open' ? nf(x.qty) : '') }, { h: 'Keluar', cls: 'r mono', f: (x) => (x.qty < 0 ? nf(-x.qty) : '') }, { h: 'Saldo', cls: 'r mono', f: (x) => `<b>${nf(x.balance)}</b>` }], [{ type: '_open', qty: 0, balance: r.opening }, ...r.rows]);
      $('#k_tw', el).insertAdjacentHTML('afterbegin', `<div style="padding:12px 16px;border-bottom:1px solid var(--line)"><b>${esc(r.product.name)}</b> <span class="muted mono">${esc(r.product.sku)}</span> &middot; stok saat ini <b>${nf(r.product.stock)} ${esc(r.product.unit)}</b></div>`);
    }
    $('#k_pick', el).onclick = async () => { const p = await A.pickProduct(); if (p) { prod = { id: p.id, name: p.name }; sessionStorage.setItem('stockcard.product', JSON.stringify(prod)); A.guard(load); } };
    $('#k_from', el).onchange = () => A.guard(load); $('#k_to', el).onchange = () => A.guard(load);
    $('#k_adj', el).onclick = async () => { const ok = await A.form({ title: 'Penyesuaian stok: ' + prod.name, hint: 'Gunakan opname untuk hitung fisik', fields: [{ name: 'qty', label: 'Perubahan qty (+ tambah / - kurang)', type: 'number', required: true, span: 2 }, { name: 'note', label: 'Alasan (rusak, hilang, dll)', required: true, span: 2 }], onSubmit: (v) => POS.post('/api/stock/adjust', { ...v, product_id: prod.id }) }); if (ok) { toast('Stok disesuaikan', 'ok'); A.guard(load); } };
    await load();
  } });

  // ================= Laporan =================
  A.route('reports', { title: 'Laporan', async render(el) {
    const list = await POS.get('/api/reports'); let cur = list[0];
    const d7 = new Date(); d7.setDate(d7.getDate() - 6); const from0 = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;
    el.innerHTML = A.head('Laporan & Excel', 'Pilih laporan, atur periode, lalu tampilkan atau unduh sebagai Excel') + `<div class="bar"><div class="grow"><label class="f">Laporan</label><select id="rp_sel">${list.map((r) => `<option value="${r.id}">${esc(r.title)}</option>`).join('')}</select></div><div id="rp_dates" style="display:flex;gap:10px"><div><label class="f">Dari</label><input type="date" id="rp_from" value="${from0}"></div><div><label class="f">Sampai</label><input type="date" id="rp_to" value="${today}"></div></div><div><button class="primary" id="rp_go">Tampilkan</button> <button id="rp_xl">Unduh Excel</button></div></div><div class="tablewrap" id="rp_tw"><div class="empty">Pilih laporan lalu klik Tampilkan</div></div>`;
    const fmt = { money: (v) => money(v), int: (v) => nf(v), qty: (v) => nf(v), date: (v) => POS.d(v), datetime: (v) => POS.dt(v), text: (v) => esc(v ?? '') };
    const qs = () => `from=${$('#rp_from', el).value}&to=${$('#rp_to', el).value}`;
    const sync = () => { cur = list.find((r) => r.id === $('#rp_sel', el).value); $('#rp_dates', el).style.display = cur.ranged ? 'flex' : 'none'; };
    $('#rp_sel', el).onchange = sync; sync();
    $('#rp_go', el).onclick = () => A.guard(async () => {
      const r = await POS.get(`/api/reports/${cur.id}?${qs()}`);
      const sums = r.cols.map((c) => (c.sum ? r.rows.reduce((a, x) => a + (+x[c.key] || 0), 0) : null));
      const tcols = r.cols.map((c, i) => ({ h: c.label, cls: ['money', 'int', 'qty'].includes(c.type) ? 'r mono' : '', f: (x) => fmt[c.type](x[c.key]) }));
      let html = A.table(tcols, r.rows, { empty: 'Tidak ada data pada periode ini' });
      if (r.rows.length && sums.some((s) => s != null)) html = html.replace('</tbody>', `<tr style="font-weight:600;background:var(--bg)">${r.cols.map((c, i) => `<td class="${['money', 'int', 'qty'].includes(c.type) ? 'r mono' : ''}">${i === 0 ? 'TOTAL' : sums[i] != null ? fmt[c.type](sums[i]) : ''}</td>`).join('')}</tr></tbody>`);
      $('#rp_tw', el).innerHTML = `<div style="padding:12px 16px;border-bottom:1px solid var(--line)"><b>${esc(r.title)}</b> <span class="muted">${r.ranged ? POS.d(r.from) + ' - ' + POS.d(r.to) : 'per ' + POS.d(today)} &middot; ${r.rows.length} baris</span></div>` + html;
    });
    $('#rp_xl', el).onclick = () => A.download(`/api/reports/${cur.id}/excel?${qs()}`);
  } });
  Object.assign(A, { saleDetail, totalsBox, info, docBtns, bindDocs });
})();
