// Pustaka bersama: API, format, dialog, struk (browser + ESC/POS), koneksi printer.
(function () {
  const POS = (window.POS = {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  Object.assign(POS, { $, $$ });

  // ---------- Bar progres ----------
  // POS.progress.start()/done() bisa dipanggil bertumpuk; bar tampil selama ada pekerjaan berjalan.
  const PG = (POS.progress = { n: 0, w: 0, t: null, el: null });
  const bar = () => { if (!PG.el) { PG.el = document.createElement('div'); PG.el.id = 'topbar'; PG.el.innerHTML = '<i></i>'; document.body.appendChild(PG.el); } return PG.el; };
  const setW = (w) => { PG.w = w; const e = bar(); e.firstChild.style.width = w + '%'; };
  PG.start = () => {
    if (PG.n++ > 0) return;
    const e = bar(); clearTimeout(PG.hide); e.classList.add('on'); setW(8);
    clearInterval(PG.t); PG.t = setInterval(() => setW(PG.w + (92 - PG.w) * 0.12), 200); // merayap mendekati 92%
  };
  PG.done = () => {
    if (PG.n === 0 || --PG.n > 0) return;
    clearInterval(PG.t); setW(100);
    PG.hide = setTimeout(() => { bar().classList.remove('on'); setTimeout(() => { if (!PG.n) setW(0); }, 300); }, 220);
  };
  PG.wrap = async (f) => { PG.start(); try { return await f(); } finally { PG.done(); } };
  // Pindah halaman penuh (login, kasir <-> admin): tampilkan bar sampai halaman baru muncul
  window.addEventListener('beforeunload', () => { try { PG.start(); } catch (e) {} });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { PG.n = 1; PG.done(); } });

  const slot = document.getElementById('themeSlot'); if (slot && window.Theme) Theme.mount(slot);

  // ---------- API ----------
  // Toko aktif (owner bisa berpindah). Disimpan per tab (sessionStorage) dan sebagai pilihan terakhir (localStorage).
  const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k) || localStorage.getItem(k); if (v == null) { sessionStorage.removeItem(k); localStorage.removeItem(k); } else { sessionStorage.setItem(k, v); localStorage.setItem(k, v); } } catch (e) { return null; } };
  POS.storeId = +store('pos_store') || null;
  POS.setStore = (id) => { POS.storeId = id ? +id : null; store('pos_store', id ? String(id) : null); };
  POS.logo = () => '/api/settings/logo?' + (POS.storeId ? 'store=' + POS.storeId + '&' : '');
  // Ambil profil + toko aktif; bila toko tersimpan sudah tidak valid, pakai bawaan server
  POS.me = async () => { let me; try { me = await POS.get('/api/auth/me'); } catch (e) { if (e.status === 400 && POS.storeId) { POS.setStore(null); me = await POS.get('/api/auth/me'); } else throw e; } POS.setStore(me.store.id); return me; };
  POS.su = (u) => (POS.storeId ? u + (u.includes('?') ? '&' : '?') + 'store=' + POS.storeId : u); // untuk tautan/unduhan (tanpa header)
  POS.api = async function (method, url, body) {
    PG.start();
    let r, j;
    try {
      r = await fetch(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(POS.storeId ? { 'X-Store': String(POS.storeId) } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      j = await r.json().catch(() => ({}));
    } finally { PG.done(); }
    if (r.status === 401 && !url.startsWith('/api/auth/login') && !['/', '/index.html'].includes(location.pathname)) { location.href = '/'; throw new Error('Sesi berakhir'); }
    if (!r.ok) { const e = new Error(j.error || 'Terjadi kesalahan'); e.details = j.details; e.status = r.status; throw e; }
    return j;
  };
  POS.get = (u) => POS.api('GET', u); POS.post = (u, b) => POS.api('POST', u, b || {});
  POS.put = (u, b) => POS.api('PUT', u, b); POS.del = (u) => POS.api('DELETE', u);
  POS.qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  // ---------- Format ----------
  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
  const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  POS.nf = (n) => nf.format(+n || 0);
  POS.money = (n) => nf0.format(Math.round(+n || 0));
  POS.rp = (n) => 'Rp ' + nf0.format(Math.round(+n || 0));
  POS.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  POS.dt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : '');
  POS.d = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
  POS.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Angka gaya Indonesia: 1.500 = seribu lima ratus, 1,5 / 1.5 = satu koma lima
  POS.toNum = (v) => {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/\s/g, '').replace(/^rp/i, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  };
  POS.METHOD = { TUNAI: 'Tunai', DEBIT: 'Kartu Debit', QRIS: 'QRIS', TRANSFER: 'Transfer', KREDIT: 'Kredit' };

  // ---------- Toast & bunyi ----------
  POS.toast = (msg, type = '') => {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 4500 : 2600);
  };
  let actx;
  POS.beep = (ok = true) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
      o.frequency.value = ok ? 1100 : 220; g.gain.value = 0.05; o.start(); o.stop(actx.currentTime + (ok ? 0.05 : 0.18));
    } catch (_) {}
  };

  // ---------- Dialog ----------
  // POS.modal({title, body, footer, wide, onKey}) -> {el, close(v), done: Promise}
  POS.modal = function (o) {
    const el = document.createElement('dialog'); if (o.wide) el.className = 'wide';
    el.innerHTML = `<div class="dh"><h3>${POS.esc(o.title || '')}</h3><span class="muted" style="font-size:12px">${o.hint || ''}</span></div><div class="db">${o.body || ''}</div>${o.footer ? `<div class="df">${o.footer}</div>` : ''}`;
    document.body.appendChild(el);
    let resolve; const done = new Promise((r) => (resolve = r));
    const api = { el, done, close(v) { if (el.open) el.close(); el.remove(); resolve(v); setTimeout(() => document.dispatchEvent(new Event('pos:dlgclose')), 0); } };
    el.addEventListener('cancel', (e) => { e.preventDefault(); api.close(undefined); });
    if (o.onKey) el.addEventListener('keydown', (e) => o.onKey(e, api));
    el.showModal();
    const first = $('[autofocus]', el) || $('input,select,textarea', el); if (first) { first.focus(); if (first.select) first.select(); }
    POS.openDialogs = (POS.openDialogs || 0) + 1; done.then(() => { POS.openDialogs--; });
    return api;
  };
  POS.confirm = (msg, okLabel = 'Ya', danger = false) => {
    const m = POS.modal({
      title: 'Konfirmasi', body: `<p style="margin:0">${POS.esc(msg)}</p>`,
      footer: `<button data-v="0">Batal <kbd>Esc</kbd></button><button class="${danger ? 'danger' : 'primary'}" data-v="1" autofocus>${POS.esc(okLabel)} <kbd>Enter</kbd></button>`,
      onKey: (e, mm) => { if (e.key === 'Enter') { e.preventDefault(); mm.close(true); } },
    });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) m.close(b.dataset.v === '1'); });
    return m.done.then((v) => !!v);
  };
  POS.prompt = (title, label, value = '', hint = '') => {
    const m = POS.modal({ title, body: `<label class="f">${POS.esc(label)}</label><input id="pv" value="${POS.esc(value)}" autocomplete="off" autofocus>${hint ? `<p class="muted" style="margin:8px 0 0;font-size:12px">${hint}</p>` : ''}`,
      footer: '<button data-c>Batal <kbd>Esc</kbd></button><button class="primary" data-ok>OK <kbd>Enter</kbd></button>',
      onKey: (e, mm) => { if (e.key === 'Enter') { e.preventDefault(); mm.close($('#pv', mm.el).value); } } });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-c]')) m.close(undefined); if (e.target.closest('[data-ok]')) m.close($('#pv', m.el).value); });
    return m.done;
  };

  // ---------- Struk ----------
  const asc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
  function wrap(s, w) {
    s = asc(s); const out = []; let cur = '';
    for (const word of s.split(/\s+/).filter(Boolean)) {
      let wd = word; while (wd.length > w) { if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
      if (!cur) cur = wd; else if ((cur + ' ' + wd).length <= w) cur += ' ' + wd; else { out.push(cur); cur = wd; }
    }
    if (cur) out.push(cur); return out;
  }
  const padLR = (a, b, w) => { a = asc(a); b = asc(b); const sp = w - a.length - b.length; return sp >= 1 ? a + ' '.repeat(sp) + b : a.slice(0, Math.max(w - b.length - 1, 1)) + ' ' + b; };
  const center = (s, w) => ' '.repeat(Math.max(Math.floor((w - s.length) / 2), 0)) + s;
  const money = (n) => POS.money(n);

  // Susun struk menjadi baris-baris teks lebar tetap (dipakai untuk HTML & ESC/POS)
  POS.receiptLines = function (sale, st, W) {
    const L = []; const push = (text, o = {}) => L.push({ text, ...o });
    const c = (s, o = {}) => { const w = o.big ? Math.floor(W / 2) : W; for (const x of wrap(s, w)) push(center(x, w), o); };
    const hr = (ch = '-') => push(ch.repeat(W));
    if (st.receipt_show_logo && st.logo) push('', { img: true });
    c(st.store_name, { b: 1, big: 1 });
    if (st.store_tagline) c(st.store_tagline);
    const addr = [st.address, st.city].filter(Boolean).join(', '); if (addr) c(addr);
    if (st.phone) c('Telp ' + st.phone);
    if (st.receipt_show_npwp && st.npwp) c('NPWP ' + st.npwp);
    if (st.receipt_header) st.receipt_header.split('\n').forEach((x) => c(x));
    hr();
    push(padLR('No', sale.sale_no, W)); push(padLR('Tanggal', POS.dt(sale.created_at), W)); push(padLR('Kasir', sale.cashier || '', W));
    if (sale.customer_name) push(padLR('Pelanggan', sale.customer_name, W));
    hr();
    for (const i of sale.items) {
      wrap(i.name, W).forEach((x) => push(x));
      push(padLR(`  ${POS.nf(i.qty)} ${i.unit || ''} x ${money(i.price)}`, money(i.qty * i.price), W));
      if (i.discount > 0) push(padLR('  Diskon', '-' + money(i.discount), W));
    }
    hr();
    push(padLR('Subtotal', money(sale.subtotal), W));
    if (sale.discount > 0) push(padLR('Diskon', '-' + money(sale.discount), W));
    if (sale.tax > 0) push(padLR(st.tax_label + (st.tax_inclusive ? ' (incl.)' : ''), money(sale.tax), W));
    push(padLR('TOTAL', money(sale.total), Math.floor(W / 2)), { b: 1, big: 1 });
    if (sale.method === 'KREDIT') {
      push(padLR('Uang muka', money(sale.paid), W)); push(padLR('Sisa tagihan', money(sale.total - sale.paid), W));
      if (sale.due_date) push(padLR('Jatuh tempo', POS.d(sale.due_date), W));
    } else {
      push(padLR(POS.METHOD[sale.method] || sale.method, money(sale.paid), W));
      if (sale.method === 'TUNAI') push(padLR('Kembali', money(sale.change_amount), W), { b: 1 });
    }
    hr();
    if (st.receipt_footer) st.receipt_footer.split('\n').forEach((x) => c(x));
    return L;
  };

  // --- Cetak lewat dialog print browser (kertas 58/80 mm) ---
  POS.printBrowser = function (sale, st, paper) {
    const W = +paper === 58 ? 32 : 48;
    const lines = POS.receiptLines(sale, st, W);
    const body = lines.map((l) => l.img ? `<div class="img"><img src="${POS.logo()}t=${Date.now()}" alt=""></div>` : `<div class="${l.big ? 'big ' : ''}${l.b ? 'b' : ''}">${POS.esc(l.text) || '&nbsp;'}</div>`).join('');
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${POS.esc(sale.sale_no)}</title><style>
      @page { size: ${paper}mm auto; margin: 0 }
      html,body { margin:0; padding:0; background:#fff }
      body { width:${W}ch; font: 9.5px/1.3 'Courier New', Courier, monospace; color:#000; padding: 2mm 0 6mm 1mm }
      div { white-space: pre; overflow: hidden } .b { font-weight: 700 }
      .big { font-size: 19px; line-height: 1.15 } .img { text-align:center; white-space: normal } .img img { max-width: 60%; max-height: 18mm; filter: grayscale(1) contrast(1.4) }
    </style></head><body>${body}</body></html>`);
    doc.close();
    // Iframe dibuang segera setelah selesai cetak agar fokus keyboard kembali ke jendela utama.
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true; f.remove(); window.focus();
      const dlg = document.querySelector('dialog[open]');
      const t = dlg ? (dlg.querySelector('[autofocus]') || dlg.querySelector('input,button,select,textarea')) : document.querySelector('#q');
      if (t) { t.blur(); t.focus(); }
    };
    const go = () => {
      f.contentWindow.onafterprint = () => setTimeout(cleanup, 0);
      try { f.contentWindow.print(); } catch (_) { cleanup(); return; }
      setTimeout(cleanup, 30000);
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) { img.onload = go; img.onerror = go; setTimeout(go, 1500); } else setTimeout(go, 50);
  };

  // --- ESC/POS ---
  async function logoRaster(maxDots) {
    const img = new Image(); img.src = POS.logo() + 't=' + Date.now();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const w = Math.min(img.naturalWidth, maxDots) & ~7 || 8; const h = Math.max(Math.round(img.naturalHeight * (w / img.naturalWidth)), 1);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data; const bpr = w / 8; const out = new Uint8Array(bpr * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 150) out[y * bpr + (x >> 3)] |= 0x80 >> (x & 7); }
    return new Uint8Array([0x1d, 0x76, 0x30, 0, bpr & 255, bpr >> 8, h & 255, h >> 8, ...out]);
  }
  POS.receiptEscpos = async function (sale, st, paper, drawer) {
    const W = +paper === 58 ? 32 : 48; const lines = POS.receiptLines(sale, st, W);
    const B = []; const add = (...a) => a.forEach((x) => (Array.isArray(x) || x instanceof Uint8Array ? B.push(...x) : B.push(x)));
    add(0x1b, 0x40, 0x1b, 0x74, 0); // init + code page PC437
    for (const l of lines) {
      if (l.img) { try { add(0x1b, 0x61, 1, await logoRaster(+paper === 58 ? 192 : 256), 0x1b, 0x61, 0); } catch (_) {} continue; }
      add(0x1b, 0x45, l.b ? 1 : 0, 0x1d, 0x21, l.big ? 0x11 : 0);
      for (const ch of asc(l.text)) B.push(ch.charCodeAt(0)); B.push(0x0a);
    }
    add(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00); // feed + potong
    if (drawer) add(0x1b, 0x70, 0, 25, 250);
    return new Uint8Array(B);
  };

  // ---------- Perangkat (printer) ----------
  const DEV_KEY = 'pos.device';
  POS.device = () => { try { return { mode: 'browser', paper: 0, autoPrint: true, drawer: true, baud: 9600, ...JSON.parse(localStorage.getItem(DEV_KEY) || '{}') }; } catch (_) { return { mode: 'browser', paper: 0, autoPrint: true, drawer: true, baud: 9600 }; } };
  POS.saveDevice = (d) => { try { localStorage.setItem(DEV_KEY, JSON.stringify(d)); } catch (_) {} };

  const Printer = (POS.Printer = { kind: null, port: null, usb: null, ep: null, async autoconnect() {
    const d = POS.device(); if (d.mode !== 'escpos' || this.ready()) return this.ready();
    try {
      if (d.kind === 'usb' && navigator.usb) { const l = await navigator.usb.getDevices(); if (l[0]) return await this._openUsb(l[0]); }
      if (navigator.serial) { const l = await navigator.serial.getPorts(); if (l[0]) return await this._openSerial(l[0], d.baud); }
    } catch (_) {} return false;
  },
  ready() { return !!(this.port || (this.usb && this.ep != null)); },
  label() { return this.ready() ? (this.kind === 'usb' ? 'USB terhubung' : 'Serial terhubung') : 'belum terhubung'; },
  async _openSerial(port, baud) { if (!port.readable) await port.open({ baudRate: +baud || 9600 }); this.port = port; this.kind = 'serial'; return true; },
  async _openUsb(dev) {
    await dev.open(); if (!dev.configuration) await dev.selectConfiguration(1);
    for (const itf of dev.configuration.interfaces) for (const alt of itf.alternates) {
      const ep = alt.endpoints.find((e) => e.direction === 'out');
      if (ep && (alt.interfaceClass === 7 || alt.interfaceClass === 255)) { await dev.claimInterface(itf.interfaceNumber); this.usb = dev; this.ep = ep.endpointNumber; this.kind = 'usb'; return true; }
    }
    throw new Error('Interface printer tidak ditemukan');
  },
  async connect(kind, baud) {
    if (kind === 'usb') { if (!navigator.usb) throw new Error('Browser tidak mendukung WebUSB (pakai Chrome/Edge)'); return this._openUsb(await navigator.usb.requestDevice({ filters: [] })); }
    if (!navigator.serial) throw new Error('Browser tidak mendukung Web Serial (pakai Chrome/Edge)');
    return this._openSerial(await navigator.serial.requestPort(), baud);
  },
  async write(bytes) {
    if (this.port) { const w = this.port.writable.getWriter(); try { for (let i = 0; i < bytes.length; i += 512) await w.write(bytes.slice(i, i + 512)); } finally { w.releaseLock(); } }
    else if (this.usb) { for (let i = 0; i < bytes.length; i += 4096) await this.usb.transferOut(this.ep, bytes.slice(i, i + 4096)); }
    else throw new Error('Printer belum terhubung');
  },
  async drawer() { await this.write(new Uint8Array([0x1b, 0x70, 0, 25, 250])); } });

  // Cetak struk sesuai pengaturan perangkat. Jatuh ke dialog print browser bila ESC/POS gagal.
  POS.printReceipt = async function (sale, st) {
    const d = POS.device(); const paper = d.paper || st.paper_width || 80;
    if (d.mode === 'escpos') {
      try {
        if (!Printer.ready()) await Printer.autoconnect();
        if (!Printer.ready()) throw new Error('Printer ESC/POS belum terhubung (Ctrl+P untuk menghubungkan)');
        await Printer.write(await POS.receiptEscpos(sale, st, paper, d.drawer && sale.method === 'TUNAI'));
        return true;
      } catch (e) { POS.toast(e.message + ' - memakai cetak browser', 'err'); }
    }
    POS.printBrowser(sale, st, paper); return true;
  };

  POS.deviceDialog = function (st) {
    const d = POS.device();
    const m = POS.modal({
      title: 'Printer & Perangkat', hint: 'disimpan di browser ini',
      body: `<div style="display:grid;gap:12px">
        <div><label class="f">Mode cetak struk</label><select id="dm"><option value="browser">Dialog print browser (semua printer terpasang)</option><option value="escpos">ESC/POS langsung (tanpa dialog, bisa buka laci)</option></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label class="f">Lebar kertas</label><select id="dp"><option value="0">Ikuti pengaturan toko (${st.paper_width} mm)</option><option value="58">58 mm</option><option value="80">80 mm</option></select></div>
        <div><label class="f">Kecepatan serial (baud)</label><select id="db">${[9600, 19200, 38400, 57600, 115200].map((b) => `<option>${b}</option>`).join('')}</select></div></div>
        <label><input type="checkbox" id="da"> Cetak otomatis setelah pembayaran</label>
        <label><input type="checkbox" id="dd"> Buka laci kas untuk pembayaran tunai (ESC/POS)</label>
        <div style="border-top:1px solid var(--line);padding-top:12px"><span class="muted">Status ESC/POS:</span> <b id="ds">${Printer.label()}</b>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button data-c="serial">Hubungkan Serial / Bluetooth</button><button data-c="usb">Hubungkan USB</button><button data-t="test">Cetak tes</button></div>
          <p class="muted" style="font-size:12px;margin:8px 0 0">Perlu Chrome/Edge lewat HTTPS atau localhost. Printer Bluetooth: pasangkan dulu di sistem operasi, lalu pilih port serialnya.</p></div></div>`,
      footer: '<button data-x>Batal <kbd>Esc</kbd></button><button class="primary" data-s>Simpan <kbd>Enter</kbd></button>',
      onKey: (e, mm) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); save(mm); } },
    });
    const e = m.el; $('#dm', e).value = d.mode; $('#dp', e).value = String(d.paper || 0); $('#db', e).value = String(d.baud); $('#da', e).checked = d.autoPrint; $('#dd', e).checked = d.drawer;
    function save(mm) { POS.saveDevice({ ...POS.device(), mode: $('#dm', e).value, paper: +$('#dp', e).value, baud: +$('#db', e).value, autoPrint: $('#da', e).checked, drawer: $('#dd', e).checked, kind: Printer.kind || d.kind }); mm.close(true); POS.toast('Pengaturan perangkat disimpan', 'ok'); }
    e.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.x !== undefined) m.close(false); if (b.dataset.s !== undefined) save(m);
      if (b.dataset.c) { try { await Printer.connect(b.dataset.c, +$('#db', e).value); POS.saveDevice({ ...POS.device(), kind: b.dataset.c }); $('#ds', e).textContent = Printer.label(); POS.toast('Printer terhubung', 'ok'); } catch (er) { POS.toast(er.message, 'err'); } }
      if (b.dataset.t) { try { if (!Printer.ready()) throw new Error('Hubungkan printer dulu'); await Printer.write(new Uint8Array([0x1b, 0x40, ...[...'TES PRINTER OK\n\n\n'].map((c) => c.charCodeAt(0)), 0x1d, 0x56, 0x42, 0])); } catch (er) { POS.toast(er.message, 'err'); } }
    });
    return m.done;
  };


  // ---------- Barcode (EAN-13) & label ----------
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  POS.eanOk = (c) => /^\d{13}$/.test(c) && (10 - ([...c.slice(0, 12)].reduce((s, d, i) => s + +d * (i % 2 ? 3 : 1), 0) % 10)) % 10 === +c[12];
  // UPC-A (12 digit) dicetak sebagai EAN-13 dengan awalan 0
  POS.eanNormalize = (c) => { c = String(c || '').trim(); if (/^\d{12}$/.test(c)) c = '0' + c; return POS.eanOk(c) ? c : null; };
  POS.ean13svg = (code, o = {}) => {
    const p = EAN_P[+code[0]]; let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? EAN_L : EAN_G)[+code[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[+code[i]];
    bits += '101';
    let rects = ''; for (let i = 0; i < bits.length; i++) { if (bits[i] === '1') { let j = i; while (bits[j + 1] === '1') j++; rects += `<rect x="${11 + i}" y="0" width="${j - i + 1}" height="50"/>`; i = j; } }
    let txt = `<text x="4" y="58" text-anchor="middle">${code[0]}</text>`;
    for (let i = 1; i <= 6; i++) txt += `<text x="${14 + 7 * (i - 1) + 3.5}" y="58" text-anchor="middle">${code[i]}</text>`;
    for (let i = 7; i <= 12; i++) txt += `<text x="${11 + 50 + 7 * (i - 7) + 3.5}" y="58" text-anchor="middle">${code[i]}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 61" ${o.style ? `style="${o.style}"` : ''} shape-rendering="crispEdges"><g fill="#000">${rects}</g><g font-family="'Courier New',monospace" font-size="9" fill="#000">${txt}</g></svg>`;
  };

  // Cetak HTML sembarang lewat iframe tersembunyi (fokus keyboard dikembalikan setelah selesai)
  POS.printHtml = function (html, title) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument; doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${POS.esc(title || 'Cetak')}</title>${html}`); doc.close();
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; f.remove(); window.focus(); const d = document.querySelector('dialog[open]'); const t = d ? (d.querySelector('[autofocus]') || d.querySelector('input,button,select,textarea')) : document.querySelector('#q'); if (t) { t.blur(); t.focus(); } };
    setTimeout(() => { f.contentWindow.onafterprint = () => setTimeout(cleanup, 0); try { f.contentWindow.print(); } catch (_) { cleanup(); return; } setTimeout(cleanup, 30000); }, 100);
  };

  // items: [{name, barcode, price}] ; o: {w,h,mode:'roll'|'a4',copies,price}
  POS.printLabels = function (items, o) {
    const ok = []; let skipped = 0;
    for (const i of items) { const c = POS.eanNormalize(i.barcode); if (c) ok.push({ ...i, code: c }); else skipped++; }
    if (!ok.length) return { printed: 0, skipped };
    const labels = ok.flatMap((i) => Array(Math.max(+o.copies || 1, 1)).fill(i)).map((i) => `<div class="lb"><div class="nm">${POS.esc(i.name)}</div>${POS.ean13svg(i.code, { style: 'width:100%;height:auto;max-height:' + Math.max(o.h * 0.5, 8) + 'mm' })}${o.price ? `<div class="pr">${POS.rp(i.price)}</div>` : ''}</div>`).join('');
    const css = o.mode === 'a4'
      ? `<style>@page{size:A4;margin:8mm}body{margin:0;font-family:Arial,sans-serif}.sheet{display:flex;flex-wrap:wrap;gap:2mm}.lb{width:${o.w}mm;height:${o.h}mm;box-sizing:border-box;border:.2mm dashed #bbb;padding:1.2mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-inside:avoid}.nm{font-size:7pt;line-height:1.1;max-height:2.4em;overflow:hidden;text-align:center;font-weight:600}.pr{font-size:9pt;font-weight:700}</style></head><body><div class="sheet">${labels}</div></body></html>`
      : `<style>@page{size:${o.w}mm ${o.h}mm;margin:0}body{margin:0;font-family:Arial,sans-serif}.lb{width:${o.w}mm;height:${o.h}mm;box-sizing:border-box;padding:1mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-after:always}.nm{font-size:7pt;line-height:1.1;max-height:2.4em;overflow:hidden;text-align:center;font-weight:600}.pr{font-size:9pt;font-weight:700}</style></head><body>${labels}</body></html>`;
    POS.printHtml(css, 'Label barcode');
    return { printed: ok.length, skipped };
  };

  // Scan barcode dengan kamera (BarcodeDetector: Chrome/Edge). Scanner USB/Bluetooth tidak perlu ini.
  POS.scanCamera = async function () {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      POS.toast('Scan kamera butuh Chrome/Edge lewat HTTPS. Scanner USB/Bluetooth tetap bisa dipakai langsung.', 'err'); return undefined;
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { POS.toast('Kamera tidak bisa dibuka: ' + e.message, 'err'); return undefined; }
    const m = POS.modal({ title: 'Scan dengan kamera', hint: 'arahkan ke barcode', body: '<video id="cam" playsinline muted style="width:100%;border-radius:6px;background:#000;max-height:60vh"></video>', footer: '<button data-x>Batal <kbd>Esc</kbd></button>' });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) m.close(undefined); });
    const v = m.el.querySelector('#cam'); v.srcObject = stream; await v.play().catch(() => {});
    let stop = false; m.done.then(() => { stop = true; stream.getTracks().forEach((t) => t.stop()); });
    let fmts = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
    try { const sup = await BarcodeDetector.getSupportedFormats(); fmts = fmts.filter((f) => sup.includes(f)); } catch (_) {}
    const det = new BarcodeDetector({ formats: fmts });
    (async function loop() { while (!stop) { try { const r = await det.detect(v); if (r.length && !stop) { POS.beep(true); m.close(r[0].rawValue); return; } } catch (_) {} await new Promise((r) => setTimeout(r, 160)); } })();
    return m.done;
  };

  // Identitas toko di header (nama + logo)
  POS.brand = (st) => (st.logo || st.has_logo ? `<img src="${POS.logo()}v=${(st.store_name || '').length}" alt="" class="brand-logo"> ` : '') + POS.esc(st.store_name);
})();
