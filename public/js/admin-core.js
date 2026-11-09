// Inti panel admin: router, komponen dialog/form/tabel/daftar, pemilih barang.
(function () {
  const { $, $$, esc, money, nf, rp, toast } = POS;
  const A = (window.A = { routes: {}, ME: null, ST: null });
  const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;
  A.tag = tag;
  A.STATUS = { DONE: ['Selesai', 'green'], VOID: ['Batal', 'red'], OPEN: ['Menunggu', 'yellow'], PARTIAL: ['Sebagian', 'blue'], RECEIVED: ['Diterima', 'green'], CANCELLED: ['Dibatalkan', 'red'] };
  A.statusTag = (s) => { const x = A.STATUS[s] || [s, '']; return tag(x[0], x[1]); };
  A.payTag = (r) => (r.status === 'VOID' || r.status === 'CANCELLED' ? '' : r.paid >= r.total ? tag('Lunas', 'green') : r.paid > 0 ? tag('Dicicil', 'blue') : tag('Belum bayar', 'yellow'));
  const debounce = (f, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  A.debounce = debounce;
  A.head = (title, sub, acts = '') => `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="acts">${acts}</div></div>`;
  A.openDoc = (kind, type, id) => window.open(POS.su(`/api/docs/${kind}/${type}/${id}`), '_blank');
  A.download = (url) => { const a = document.createElement('a'); a.href = POS.su(url); a.download = ''; document.body.appendChild(a); a.click(); a.remove(); };
  A.guard = async (f) => { try { return await f(); } catch (e) { toast(e.message, 'err'); } };

  // ---------- Router ----------
  A.route = (name, def) => (A.routes[name] = def);
  async function go() {
    const [name, ...rest] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
    const r = A.routes[name] || A.routes.dashboard;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + (A.routes[name] ? name : 'dashboard')));
    $('#side').classList.remove('open'); $('#scrim') && $('#scrim').classList.remove('on'); A.openActiveGroup && A.openActiveGroup();
    // Wadah baru di setiap navigasi: listener halaman sebelumnya ikut terbuang (tidak menumpuk)
    const old = $('#view'); const v = old.cloneNode(false); old.replaceWith(v); document.onkeydown = null;
    v.innerHTML = '<div class="empty">Memuat...</div>';
    document.title = (r.title || 'Admin') + ' - ' + (A.ST ? A.ST.store_name : '');
    POS.progress.start();
    try { await r.render(v, rest); } catch (e) { v.innerHTML = `<div class="err">${esc(e.message)}</div>`; } finally { POS.progress.done(); }
  }
  window.addEventListener('hashchange', go);

  // ---------- Dialog & form ----------
  // fields: {name,label,type,options,required,span,hint,placeholder,rows}
  A.form = function ({ title, fields, values = {}, submit = 'Simpan', wide, onSubmit, hint, onOpen }) {
    const f = (x) => {
      if (x.type === 'note') return `<div class="span2">${x.hint || ''}</div>`;
      const v = values[x.name] ?? x.value ?? ''; const id = 'ff_' + x.name; const req = x.required ? ' *' : '';
      let ctl;
      if (x.type === 'select') ctl = `<select id="${id}">${(x.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
      else if (x.type === 'textarea') ctl = `<textarea id="${id}" rows="${x.rows || 3}" placeholder="${esc(x.placeholder || '')}">${esc(v)}</textarea>`;
      else if (x.type === 'checkbox') return `<div class="${x.span === 2 ? 'span2' : ''}"><label class="sw"><input type="checkbox" id="${id}" ${v === true || v === 1 || v === '1' ? 'checked' : ''}> ${esc(x.label)}</label>${x.hint ? `<div class="hint">${x.hint}</div>` : ''}</div>`;
      else {
        ctl = `<input id="${id}" type="${x.type === 'number' ? 'text' : x.type || 'text'}" ${x.type === 'number' ? 'inputmode="decimal"' : ''} ${x.scan ? 'data-scan' : ''} value="${esc(v)}" placeholder="${esc(x.placeholder || '')}" autocomplete="off">`;
        if (x.gen || x.cam) ctl = `<div style="display:flex;gap:6px">${ctl}${x.gen ? `<button type="button" class="sm" data-gen="${x.name}" style="white-space:nowrap">Buat otomatis</button>` : ''}${x.cam ? `<button type="button" class="sm" data-cam="${x.name}">Kamera</button>` : ''}</div>`;
      }
      return `<div class="${x.span === 2 ? 'span2' : ''}"><label class="f" for="${id}">${esc(x.label)}${req}</label>${ctl}${x.hint ? `<div class="hint">${x.hint}</div>` : ''}</div>`;
    };
    const m = POS.modal({
      title, wide, hint, body: `<div class="form-grid">${fields.map(f).join('')}</div><div id="ferr" class="err hidden"></div>`,
      footer: `<button data-x>Batal <kbd>Esc</kbd></button><button class="primary" data-ok>${esc(submit)} <kbd>Enter</kbd></button>`,
      onKey: (e) => {
        if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        // Scanner mengirim Enter setelah kode: pindah ke kolom berikutnya, jangan menyimpan form
        if (e.target.hasAttribute('data-scan')) { const all = [...el.querySelectorAll('input:not([type=checkbox]),select,textarea')]; const n = all[all.indexOf(e.target) + 1]; if (n) { n.focus(); n.select && n.select(); } return; }
        save();
      },
    });
    const el = m.el; let busy = false;
    if (onOpen) onOpen(el);
    async function save() {
      if (busy) return; const out = {}; const err = $('#ferr', el); err.classList.add('hidden');
      for (const x of fields) {
        if (x.type === 'note') continue;
        const n = $('#ff_' + x.name, el); let v = x.type === 'checkbox' ? n.checked : n.value.trim();
        if (x.required && v === '') { err.textContent = `${x.label} wajib diisi`; err.classList.remove('hidden'); n.focus(); return; }
        if (x.type === 'number') { if (v === '') v = x.empty === undefined ? 0 : x.empty; else { v = POS.toNum(v); if (!Number.isFinite(v)) { err.textContent = `${x.label} harus berupa angka`; err.classList.remove('hidden'); n.focus(); return; } } }
        out[x.name] = v;
      }
      busy = true; $('[data-ok]', el).disabled = true;
      try { const r = onSubmit ? await onSubmit(out) : out; m.close(r === undefined ? true : r); }
      catch (e) { err.textContent = e.message; err.classList.remove('hidden'); busy = false; $('[data-ok]', el).disabled = false; }
    }
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x]')) m.close(undefined); if (e.target.closest('[data-ok]')) save();
      const g = e.target.closest('[data-gen]'); if (g) { const x = fields.find((f) => f.name === g.dataset.gen); try { $('#ff_' + x.name, el).value = await x.gen(); } catch (er) { toast(er.message, 'err'); } }
      const c = e.target.closest('[data-cam]'); if (c) { const code = await POS.scanCamera(); if (code) $('#ff_' + c.dataset.cam, el).value = code; }
    });
    return m.done;
  };
  A.dialog = (title, body, { wide = true, footer = '<button class="primary" data-x autofocus>Tutup <kbd>Esc</kbd></button>', hint } = {}) => {
    const m = POS.modal({ title, body, footer, wide, hint });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) m.close(); });
    return m;
  };

  // ---------- Tabel & daftar ----------
  A.table = (cols, rows, { empty = 'Belum ada data' } = {}) => {
    if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
    return `<table class="t"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}">${cols.map((c) => `<td class="${c.cls || ''}">${c.f(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  // Tombol aksi di tabel: ikon saja (teks jadi tooltip + aria-label). Aksi tanpa ikon tetap berupa teks.
  const ic = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  A.ICON = {
    view: ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    edit: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    del: ic('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
    docs: ic('<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>'),
    label: ic('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/>'),
    card: ic('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>'),
    open: ic('<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  };
  A.btn = (act, label, cls = 'sm', extra = '') => (A.ICON[act]
    ? `<button class="${cls} ic" data-act="${act}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${A.ICON[act]}</button>`
    : `<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`);

  // cfg: {title, sub, actions, filters:[{name,label,type,options}], url(st), cols, onAct(act,row,reload), limit, empty}
  A.list = async function (el, cfg) {
    const st = { page: 1, ...(cfg.initial || {}) }; let rows = [];
    const fl = (cfg.filters || []).map((x) => `<div class="${x.grow ? 'grow' : ''}"><label class="f">${esc(x.label)}</label>${x.type === 'select' ? `<select data-f="${x.name}">${x.options.map(([v, l]) => `<option value="${esc(v)}" ${String(st[x.name] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : x.type === 'check' ? `<label class="sw" style="height:33px"><input type="checkbox" data-f="${x.name}"> ${esc(x.text)}</label>` : `<input data-f="${x.name}" type="${x.type || 'text'}" value="${esc(st[x.name] ?? '')}" placeholder="${esc(x.placeholder || '')}" autocomplete="off">`}</div>`).join('');
    el.innerHTML = A.head(cfg.title, cfg.sub, cfg.actions || '') + (fl ? `<div class="bar">${fl}</div>` : '') + '<div class="tablewrap" id="tw"></div><div class="pager" id="pg"></div>';
    const limit = cfg.limit || 50;
    async function load() {
      const q = Object.entries(st).filter(([k]) => k !== 'page').reduce((a, [k, v]) => { a[k] = v; return a; }, {});
      const r = await POS.get(cfg.url({ ...q, page: st.page, limit }, st));
      rows = r.rows || r; const total = r.total ?? rows.length;
      $('#tw', el).innerHTML = A.table(cfg.cols, rows, { empty: cfg.empty });
      const pages = Math.max(Math.ceil(total / limit), 1);
      $('#pg', el).innerHTML = `<span>${nf(total)} data${r.sum != null ? ` &middot; total ${rp(r.sum)}` : ''}</span>${total > limit ? `<span><button class="sm" data-p="-1" ${st.page <= 1 ? 'disabled' : ''}>Sebelumnya</button> <span style="margin:0 8px">${st.page} / ${pages}</span> <button class="sm" data-p="1" ${st.page >= pages ? 'disabled' : ''}>Berikutnya</button></span>` : ''}`;
    }
    const reload = () => A.guard(load);
    const onF = debounce((e) => { const n = e.target.dataset.f; if (!n) return; st[n] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value; st.page = 1; reload(); }, 220);
    el.addEventListener('input', onF); el.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'date') onF(e); });
    el.addEventListener('click', (e) => {
      const p = e.target.closest('[data-p]'); if (p) { st.page += +p.dataset.p; reload(); return; }
      const b = e.target.closest('[data-act]'); if (!b || !cfg.onAct) { const tr = e.target.closest('tbody tr'); if (tr && cfg.onRow && !e.target.closest('button, a')) cfg.onRow(rows[+tr.dataset.i], reload); return; }
      const tr = b.closest('tr'); cfg.onAct(b.dataset.act, tr ? rows[+tr.dataset.i] : null, reload, b, rows);
    });
    await load();
    return { reload, st };
  };

  // CRUD sederhana untuk master data
  A.crud = (name, o) => A.route(name, {
    title: o.title,
    render: (el) => A.list(el, {
      title: o.title, sub: o.sub, empty: o.empty,
      actions: `<button class="primary" data-act="new">${o.newLabel || 'Tambah'}</button>`,
      filters: [{ name: 'q', label: 'Cari', placeholder: 'Ketik untuk mencari', grow: true }],
      url: (q) => `${o.endpoint}?${POS.qs(q)}`,
      cols: [...o.cols, { h: '', cls: 'r', f: () => A.btn('edit', 'Ubah') + ' ' + A.btn('del', 'Hapus', 'sm danger') }],
      async onAct(act, row, reload) {
        if (act === 'new' || act === 'edit') {
          const ok = await A.form({ title: act === 'new' ? o.newLabel || 'Tambah' : 'Ubah', fields: o.fields, values: row || {}, onSubmit: (v) => (row ? POS.put(`${o.endpoint}/${row.id}`, v) : POS.post(o.endpoint, v)) });
          if (ok) { toast('Tersimpan', 'ok'); reload(); }
        } else if (act === 'del' && (await POS.confirm(`Hapus "${row.name}"?`, 'Hapus', true))) {
          try { await POS.del(`${o.endpoint}/${row.id}`); toast('Dihapus', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); }
        }
      },
    }),
  });

  // ---------- Pemilih barang (dialog cari + Enter) ----------
  A.pickProduct = function () {
    let list = [], sel = 0, lastQ = null;
    const m = POS.modal({ title: 'Pilih barang', hint: 'ketik atau scan barcode &middot; <kbd>&uarr;</kbd><kbd>&darr;</kbd> <kbd>Enter</kbd>', body: '<input id="pq" placeholder="Nama, SKU, atau barcode" autocomplete="off" autofocus><table class="lst" style="margin-top:10px;width:100%"><tbody id="pl"></tbody></table>',
      onKey: async (e, mm) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; draw(); } }
        else if (e.key === 'Enter') {
          e.preventDefault();
          // scanner mengirim Enter sebelum pencarian (debounce) selesai: muat dulu, lalu pilih yang kodenya persis sama
          const term = $('#pq', el).value.trim(); if (term !== lastQ) await loadNow();
          const exact = list.find((p) => p.barcode === term || p.sku === term);
          const pick = exact || list[sel]; if (pick) mm.close(pick);
        }
      } });
    const el = m.el; const draw = () => { $('#pl', el).innerHTML = list.length ? list.map((p, i) => `<tr data-i="${i}" class="${i === sel ? 'sel' : ''}"><td class="mono muted">${esc(p.barcode || p.sku)}</td><td>${esc(p.name)}</td><td class="r mono">${nf(p.stock)} ${esc(p.unit)}</td></tr>`).join('') : '<tr><td class="muted">Tidak ada hasil</td></tr>'; };
    const loadNow = async () => { const t = $('#pq', el).value.trim(); list = (await POS.get('/api/products?' + POS.qs({ q: t, active: 1, limit: 10 }))).rows; lastQ = t; sel = 0; draw(); };
    const load = debounce(loadNow, 150);
    $('#pq', el).addEventListener('input', load); loadNow();
    el.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) m.close(list[+tr.dataset.i]); });
    return m.done;
  };

  // Editor baris barang (pembelian / penerimaan langsung). Mengembalikan {el, items(), refresh}
  A.itemsEditor = function (host, { priceLabel = 'Harga beli', init = [], onChange } = {}) {
    let items = init.map((i) => ({ ...i }));
    const draw = () => {
      host.innerHTML = `<table class="t items"><thead><tr><th>Barang</th><th class="r" style="width:110px">Qty</th><th class="r" style="width:140px">${esc(priceLabel)}</th><th class="r" style="width:130px">Jumlah</th><th style="width:44px"></th></tr></thead><tbody>${items.map((i, n) => `<tr data-n="${n}"><td>${esc(i.name)}<div class="muted mono" style="font-size:11.5px">${esc(i.sku || '')}</div></td><td><input class="r" data-k="qty" value="${esc(String(i.qty).replace('.', ','))}" inputmode="decimal"></td><td><input class="r" data-k="price" value="${esc(String(i.price).replace('.', ','))}" inputmode="decimal"></td><td class="r mono">${money((POS.toNum(i.qty) || 0) * (POS.toNum(i.price) || 0))}</td><td><button class="sm ghost" data-del title="Hapus baris">&times;</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Belum ada barang</td></tr>'}</tbody></table><div style="margin-top:10px"><button data-add>Tambah barang <kbd>Ins</kbd></button></div>`;
      onChange && onChange(); };
    const add = async () => { const p = await A.pickProduct(); if (!p) return; const ex = items.find((i) => i.product_id === p.id); if (ex) ex.qty = (POS.toNum(ex.qty) || 0) + 1; else items.push({ product_id: p.id, sku: p.sku, name: p.name, qty: 1, price: p.buy_price || 0 }); draw(); };
    host.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) add(); const d = e.target.closest('[data-del]'); if (d) { items.splice(+d.closest('tr').dataset.n, 1); draw(); } });
    host.addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; const n = +e.target.closest('tr').dataset.n; items[n][k] = e.target.value; draw(); });
    host.addEventListener('keydown', (e) => { if (e.key === 'Insert') { e.preventDefault(); add(); } });
    draw();
    return { items: () => items.map((i) => ({ product_id: i.product_id, qty: POS.toNum(i.qty), price: POS.toNum(i.price) })), subtotal: () => items.reduce((a, i) => a + (POS.toNum(i.qty) || 0) * (POS.toNum(i.price) || 0), 0), count: () => items.length, add };
  };

  // ---------- Awal ----------
  const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    bag: '<path d="M6 7h12l1 13H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    inbox: '<path d="M4 13l2-8h12l2 8"/><path d="M4 13v6h16v-6h-5a3 3 0 0 1-6 0z"/>',
    check: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="1.7"/><circle cx="17" cy="18" r="1.7"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 0 1 0 6M18 14c1.9.7 3 2.5 3 4.5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', cv: '<path d="M6 9l6 6 6-6"/>',
  };
  // [kunci grup, judul grup, [[rute, label, ikon], ...]]; grup tanpa judul = selalu tampil
  A.NAV = [
    ['', '', [['dashboard', 'Dashboard', 'home']]],
    ['trx', 'Transaksi', [['sales', 'Semua Penjualan', 'cart'], ['invoices', 'Penjualan Faktur', 'file'], ['purchases', 'Pembelian', 'bag'], ['receipts', 'Penerimaan', 'inbox'], ['opnames', 'Stok Opname', 'check']]],
    ['data', 'Data', [['products', 'Barang', 'box'], ['categories', 'Kategori', 'tag'], ['suppliers', 'Pemasok', 'truck'], ['customers', 'Pelanggan', 'users'], ['doctypes', 'Master Dokumen', 'folder']]],
    ['rep', 'Laporan', [['stockcard', 'Kartu Stok', 'layers'], ['reports', 'Laporan & Excel', 'chart']]],
    ['sys', 'Sistem', [['stores', 'Toko', 'store'], ['users', 'Pengguna', 'user'], ['backup', 'Backup & Restore', 'db'], ['settings', 'Identitas & Pengaturan', 'gear']]],
  ];
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* abaikan */ } };
  A.renderNav = () => {
    const closed = lsGet('pos_navgrp', {});
    $('#nav').innerHTML = A.NAV.map(([key, title, items], gi) => {
      const links = items.map(([r, t, ic]) => `<a href="#/${r}" title="${esc(t)}">${I(ICON[ic])}<span>${esc(t)}</span></a>`).join('');
      if (!key) return `<div class="gi">${links}</div>`;
      return `<div class="gsep"></div><button class="gh" data-g="${key}" aria-expanded="${closed[key] ? 'false' : 'true'}"><span>${esc(title)}</span>${I(ICON.cv).replace('<svg', '<svg class="cv"')}</button><div class="gi" data-gi="${key}" ${closed[key] ? 'hidden' : ''}>${links}</div>`;
    }).join('');
    $('#nav').onclick = (e) => {
      const g = e.target.closest('.gh'); if (!g) return;
      const c = lsGet('pos_navgrp', {}); const open = g.getAttribute('aria-expanded') === 'true';
      c[g.dataset.g] = open; lsSet('pos_navgrp', c); g.setAttribute('aria-expanded', String(!open));
      $(`[data-gi="${g.dataset.g}"]`).hidden = open;
    };
  };
  // buka grup tempat halaman aktif berada
  A.openActiveGroup = () => {
    const a = $('#nav a.on'); const gi = a && a.closest('[data-gi]'); if (!gi || !gi.hidden) return;
    gi.hidden = false; const h = $(`.gh[data-g="${gi.dataset.gi}"]`); if (h) h.setAttribute('aria-expanded', 'true');
    const c = lsGet('pos_navgrp', {}); delete c[gi.dataset.gi]; lsSet('pos_navgrp', c);
  };
  // Pemilih toko di topbar: pindah toko = muat ulang halaman dengan toko baru
  A.renderStoreBox = () => {
    const sb = $('#storebox'); if (!sb) return;
    sb.innerHTML = A.ME.stores.length < 2 && !A.ME.stores[0] ? '' : `<label class="f" for="storeSel">Toko</label><select id="storeSel">${A.ME.stores.map((s) => `<option value="${s.id}" ${s.id === A.ME.store.id ? 'selected' : ''}>${esc(s.name)} (${esc(s.code)})${s.active ? '' : ' - nonaktif'}</option>`).join('')}</select>`;
    const sel = $('#storeSel'); if (sel) sel.onchange = (e) => { POS.setStore(e.target.value); // tetap di halaman yang sama; halaman berisi ID/isian satu toko (ubah, baru) kembali ke daftarnya
      const h = location.hash || '#/dashboard'; const seg = h.replace(/^#\//, '').split('/');
      if (seg.length > 1) location.hash = ({ invoice: '#/invoices', purchase: '#/purchases', receipt: '#/receipts', opname: '#/opnames' })[seg[0]] || '#/dashboard';
      location.reload(); };
  };
  // Sidebar hanya berisi logo toko (tanpa nama)
  A.refreshBrand = () => {
    const st = A.ST || {};
    $('#brand').innerHTML = st.logo || st.has_logo ? `<img src="${POS.logo()}v=${(st.store_name || '').length}" alt="${esc(st.store_name || '')}" class="brand-logo">` : I(ICON.store).replace('<svg', '<svg class="brand-mark"');
    document.title = (document.title.split(' - ')[0] || 'Admin') + ' - ' + (st.store_name || '');
  };
  A.init = async function () {
    try { A.ME = await POS.me(); A.ST = await POS.get('/api/settings'); } catch (_) { return; }
    if (A.ME.role !== 'owner') { location.href = '/pos.html'; return; }
    A.renderNav(); A.renderStoreBox(); A.refreshBrand();
    $('#meName').textContent = A.ME.name; $('#meRole').textContent = 'Owner'; $('#meAv').textContent = (A.ME.name || '?').trim().charAt(0).toUpperCase();
    $('#menu').innerHTML = I(ICON.menu);
    // sidebar: ciut ke ikon (desktop) / laci (ponsel)
    const shell = $('#shell'); const mob = () => matchMedia('(max-width: 760px)').matches;
    if (lsGet('pos_rail', false)) shell.classList.add('rail');
    const closeDrawer = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); };
    $('#menu').onclick = () => { if (mob()) { const o = $('#side').classList.toggle('open'); $('#scrim').classList.toggle('on', o); } else { const r = shell.classList.toggle('rail'); lsSet('pos_rail', r); } };
    $('#scrim').onclick = closeDrawer; $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });
    // menu pengguna (topbar kanan atas)
    const um = $('#umMenu'); const closeUm = () => { um.classList.add('hidden'); $('#umBtn').setAttribute('aria-expanded', 'false'); };
    $('#umBtn').onclick = (e) => { e.stopPropagation(); const h = um.classList.toggle('hidden'); $('#umBtn').setAttribute('aria-expanded', String(!h)); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.um')) closeUm(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUm(); });
    $('#out').onclick = async () => { await POS.post('/api/auth/logout'); location.href = '/'; };
    $('#pw').onclick = () => { closeUm(); return A.form({ title: 'Ganti password', fields: [{ name: 'old_password', label: 'Password lama', type: 'password', required: true, span: 2 }, { name: 'new_password', label: 'Password baru (min. 6 karakter)', type: 'password', required: true, span: 2 }], onSubmit: (v) => POS.post('/api/auth/password', v) }).then((ok) => ok && toast('Password diganti', 'ok')); };
    go();
  };
  window.addEventListener('DOMContentLoaded', () => setTimeout(() => A.init(), 0));
  A.go = go;
})();
