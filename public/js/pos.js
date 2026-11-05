// Layar kasir: seluruh alur bisa dijalankan dari keyboard.
(async function () {
  const { $, esc, money, nf, rp, toNum, toast, beep } = POS;
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

  let ME, ST, CAT = [], IDX = [], BYCODE = new Map();
  const S = { cart: [], sel: 0, discount: 0, customer: null, pend: null, results: [], rsel: 0, rOpen: false, last: null, busy: false };
  const q = $('#q');

  // ---------- Muat data ----------
  try {
    ME = await POS.me(); ST = await POS.get('/api/settings');
  } catch (e) { return; }
  if (ME.role === 'owner' && ME.stores.length > 1) {
    const sel = $('#storeSel'); sel.classList.remove('hidden');
    sel.innerHTML = ME.stores.map((s) => `<option value="${s.id}" ${s.id === ME.store.id ? 'selected' : ''}>${POS.esc(s.name)}</option>`).join('');
    sel.onchange = async (e) => { if (S.cart.length && !(await POS.confirm('Keranjang masih berisi barang. Pindah toko?', 'Pindah', true))) { sel.value = ME.store.id; return; } POS.setStore(e.target.value); location.reload(); };
  }
  document.title = 'Kasir - ' + ST.store_name;
  $('#brand').innerHTML = POS.brand(ST);
  $('#who').textContent = ME.name;
  if (ME.role === 'owner') $('#adminLink').classList.remove('hidden');
  if (!ST.tax_percent) $('#taxrow').classList.add('hidden'); else $('#taxlbl').textContent = ST.tax_label + ' ' + ST.tax_percent + '%' + (ST.tax_inclusive ? ' (incl.)' : '');

  async function loadCatalog(silent) {
    try {
      CAT = await POS.get('/api/products/catalog');
      IDX = CAT.map((p) => ({ p, hay: `${p.name} ${p.sku} ${p.barcode || ''} ${p.category || ''}`.toLowerCase() }));
      BYCODE = new Map();
      for (const p of CAT) { if (p.barcode) BYCODE.set(p.barcode.toLowerCase(), p); BYCODE.set(p.sku.toLowerCase(), p); }
    } catch (e) { if (!silent) toast('Gagal memuat katalog: ' + e.message, 'err'); }
  }
  await loadCatalog();
  restore();

  // ---------- Pencarian ----------
  function search(term) {
    const t = term.toLowerCase().split(/\s+/).filter(Boolean); if (!t.length) return [];
    const out = [];
    for (const x of IDX) {
      let ok = true; for (const w of t) if (!x.hay.includes(w)) { ok = false; break; }
      if (ok) {
        const n = x.p.name.toLowerCase(); const code = (x.p.barcode || '').toLowerCase() === t[0] || x.p.sku.toLowerCase() === t[0];
        out.push({ p: x.p, rank: code ? 0 : n.startsWith(t[0]) ? 1 : 2 });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name));
    return out.slice(0, 15).map((o) => o.p);
  }
  const priceFor = (p, qty) => (p.wmin > 0 && p.wprice > 0 && qty >= p.wmin ? p.wprice : p.price);

  // ---------- Hitungan ----------
  function totals() {
    let sub = 0, items = 0;
    for (const l of S.cart) { l.price = priceFor(l.p, l.qty); l.total = r2(l.price * l.qty - l.discount); sub += l.total; items += l.qty; }
    sub = r2(sub);
    const disc = Math.min(S.discount, sub); const base = r2(sub - disc);
    let tax = 0, total = base; const rate = ST.tax_percent / 100;
    if (rate > 0) { if (ST.tax_inclusive) tax = r2(base - base / (1 + rate)); else { tax = r2(base * rate); total = r2(base + tax); } }
    return { sub, disc, tax, total, items: r3(items) };
  }

  // ---------- Render ----------
  function render() {
    const T = totals();
    $('#lines').innerHTML = S.cart.map((l, i) => `<tr data-i="${i}" class="${i === S.sel ? 'sel' : ''}"><td class="no">${i + 1}</td><td class="kode">${esc(l.p.barcode || l.p.sku)}</td><td>${esc(l.p.name)}</td><td class="r m">${nf(l.qty)}</td><td class="sat">${esc(l.p.unit)}</td><td class="r m">${money(l.price)}${l.price !== l.p.price ? ' <span class="tag blue">G</span>' : ''}</td><td class="r m jml">${money(l.total)}</td></tr>`).join('');
    $('#empty').classList.toggle('hidden', S.cart.length > 0);
    const row = $('#lines tr.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
    $('#total').textContent = money(T.total); $('#s-items').textContent = nf(T.items); $('#s-sub').textContent = money(T.sub);
    $('#s-tax').textContent = money(T.tax);
    $('#cust').textContent = S.customer ? S.customer.name : 'Umum';
    $('#last').textContent = S.last ? `${S.last.sale_no.slice(-4)}  ${rp(S.last.total)}${S.last.method === 'TUNAI' ? '  kembali ' + money(S.last.change_amount) : ''}` : '-';
    $('#heldc').textContent = held().length;
    const pend = $('#pend'); pend.classList.toggle('hidden', !S.pend); if (S.pend) pend.textContent = 'Qty x' + nf(S.pend);
    persist();
  }
  function renderResults() {
    const box = $('#results');
    if (!S.rOpen) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (!S.results.length) { box.innerHTML = '<div class="none">Tidak ada barang yang cocok</div>'; return; }
    box.innerHTML = '<table>' + S.results.map((p, i) => `<tr class="${i === S.rsel ? 'sel' : ''}" data-i="${i}"><td class="mono muted">${esc(p.barcode || p.sku)}</td><td class="n">${esc(p.name)}${p.category ? ` <span class="muted">&middot; ${esc(p.category)}</span>` : ''}</td><td class="mono right">${money(p.price)}</td><td class="mono right ${p.stock <= 0 ? 'neg' : ''}">${nf(p.stock)} ${esc(p.unit)}</td></tr>`).join('') + '</table>';
    const s = box.querySelector('tr.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Keranjang ----------
  function addProduct(p, qty) {
    if (S.pend) { qty = S.pend; S.pend = null; }
    if (!(qty > 0)) { beep(false); return; }
    const ex = S.cart.find((l) => l.p.id === p.id);
    const want = r3((ex ? ex.qty : 0) + qty);
    if (!ST.allow_negative_stock && want > p.stock) { beep(false); toast(`Stok ${p.name} hanya ${nf(p.stock)} ${p.unit}`, 'err'); render(); return; }
    if (p.stock <= 0 && ST.allow_negative_stock) toast(`Stok ${p.name} tercatat ${nf(p.stock)}`);
    if (ex) { ex.qty = want; S.sel = S.cart.indexOf(ex); } else { S.cart.push({ p, qty, discount: 0 }); S.sel = S.cart.length - 1; }
    beep(true); render();
  }
  const cur = () => S.cart[S.sel];
  function moveCart(d) { if (!S.cart.length) return; S.sel = Math.min(Math.max(S.sel + d, 0), S.cart.length - 1); render(); }
  function changeQty(d) { const l = cur(); if (!l) return; const n = r3(l.qty + d); if (n <= 0) return; if (!ST.allow_negative_stock && n > l.p.stock) { beep(false); toast('Stok tidak cukup', 'err'); return; } l.qty = n; if (l.discount > l.price * n) l.discount = 0; render(); }
  function removeLine() { if (!S.cart.length) return; S.cart.splice(S.sel, 1); S.sel = Math.min(S.sel, S.cart.length - 1); if (S.sel < 0) S.sel = 0; render(); }
  async function editQty() {
    const l = cur(); if (!l) return;
    const v = await POS.prompt('Ubah qty', `${l.p.name} (${l.p.unit})`, String(l.qty).replace('.', ','));
    if (v === undefined) return; const n = toNum(v);
    if (!(n > 0)) { toast('Qty tidak valid', 'err'); return; }
    if (!ST.allow_negative_stock && n > l.p.stock) { toast('Stok tidak cukup', 'err'); return; }
    l.qty = r3(n); render();
  }
  async function clearCart() {
    if (!S.cart.length) return;
    if (await POS.confirm('Kosongkan seluruh keranjang?', 'Kosongkan', true)) { resetCart(); }
  }
  function resetCart() { S.cart = []; S.sel = 0; S.discount = 0; S.customer = null; S.pend = null; render(); }

  // Simpan keranjang agar aman dari refresh/mati listrik
  function persist() {
    try { localStorage.setItem('pos.cart', JSON.stringify({ c: S.cart.map((l) => [l.p.id, l.qty, l.discount]), d: S.discount, cu: S.customer })); } catch (_) {}
  }
  function restore() {
    try {
      const j = JSON.parse(localStorage.getItem('pos.cart') || 'null'); if (!j) return;
      const m = new Map(CAT.map((p) => [p.id, p]));
      S.cart = j.c.filter((x) => m.has(x[0])).map((x) => ({ p: m.get(x[0]), qty: x[1], discount: x[2] }));
      S.discount = j.d || 0; S.customer = j.cu || null;
    } catch (_) {}
  }
  const held = () => { try { return JSON.parse(localStorage.getItem('pos.held') || '[]'); } catch (_) { return []; } };
  const saveHeld = (h) => { try { localStorage.setItem('pos.held', JSON.stringify(h)); } catch (_) {} };

  // ---------- Input utama ----------
  function clearQ() { q.value = ''; S.rOpen = false; S.results = []; renderResults(); }
  // blur+focus: Chromium kadang menganggap q sudah fokus padahal fokus keyboard hilang setelah dialog ditutup
  function focusQ() {
    const go = () => { if (!document.querySelector('dialog[open]')) { q.blur(); q.focus(); } };
    go(); setTimeout(go, 60);
  }
  const MUL = /^(\d+(?:[.,]\d+)?)\*(.*)$/;
  q.addEventListener('input', () => {
    let term = q.value.trim(); const m = MUL.exec(term); if (m) term = m[2].trim();
    if (!term) { S.rOpen = false; renderResults(); return; }
    S.results = search(term); S.rsel = 0; S.rOpen = true; renderResults();
  });
  q.addEventListener('keydown', (e) => {
    const v = q.value;
    if (e.key === 'Enter') { e.preventDefault(); submitQ(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const d = e.key === 'ArrowDown' ? 1 : -1;
      if (S.rOpen && S.results.length) { S.rsel = (S.rsel + d + S.results.length) % S.results.length; renderResults(); } else moveCart(d);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); if (v || S.rOpen) clearQ(); else if (S.pend) { S.pend = null; render(); } return; }
    if (!v) {
      if (e.key === '+') { e.preventDefault(); changeQty(1); }
      else if (e.key === '-') { e.preventDefault(); changeQty(-1); }
      else if (e.key === 'Delete') { e.preventDefault(); removeLine(); }
    }
  });
  function exact(term) { return BYCODE.get(term.toLowerCase()); }
  function submitQ() {
    const raw = q.value.trim();
    if (!raw) { if (S.cart.length) openPay(); return; }
    let qty = 1, term = raw; const m = MUL.exec(raw);
    if (m) { qty = toNum(m[1]); term = m[2].trim(); if (!term) { S.pend = qty > 0 ? qty : null; clearQ(); render(); return; } }
    let p = S.rOpen && S.results.length ? S.results[S.rsel] : exact(term);
    if (!p) { const rs = search(term); if (rs.length === 1) p = rs[0]; }
    if (!p) { beep(false); toast('Barang tidak ditemukan: ' + term, 'err'); q.select(); return; }
    addProduct(p, qty); clearQ();
  }
  $('#results').addEventListener('mousedown', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { e.preventDefault(); addProduct(S.results[+tr.dataset.i], MUL.exec(q.value.trim()) ? toNum(MUL.exec(q.value.trim())[1]) : 1); clearQ(); } });
  $('#lines').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) { S.sel = +tr.dataset.i; render(); } });
  $('#lines').addEventListener('dblclick', editQty);

  // ---------- Pelanggan ----------
  async function pickCustomer() {
    let list = [], sel = 0, mode = 'list';
    const m = POS.modal({
      title: 'Pelanggan', hint: '<kbd>&uarr;</kbd><kbd>&darr;</kbd> pilih &middot; <kbd>Enter</kbd> pilih &middot; <kbd>Ins</kbd> baru',
      body: `<div id="cv1"><input id="cq" placeholder="Cari nama atau telepon" autocomplete="off" autofocus><table class="lst" style="margin-top:10px"><tbody id="cl"></tbody></table></div>
        <div id="cv2" class="hidden" style="display:none;gap:10px"><div><label class="f">Nama *</label><input id="nn"></div><div><label class="f">Telepon</label><input id="np"></div><div><label class="f">Alamat</label><input id="na"></div></div>`,
      footer: '<button data-g>Umum / tanpa pelanggan</button><span style="flex:1"></span><button data-b>Batal <kbd>Esc</kbd></button><button class="primary" data-ok>Pilih <kbd>Enter</kbd></button>',
      onKey: async (e, mm) => {
        if (mode === 'new') { if (e.key === 'Enter') { e.preventDefault(); save(mm); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMode('list'); } return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; draw(); } }
        else if (e.key === 'Enter') { e.preventDefault(); if (list[sel]) mm.close(list[sel]); }
        else if (e.key === 'Insert') { e.preventDefault(); setMode('new'); }
      },
    });
    const el = m.el; const cq = $('#cq', el);
    function draw() { $('#cl', el).innerHTML = list.length ? list.map((c, i) => `<tr class="${i === sel ? 'sel' : ''}" data-i="${i}"><td>${esc(c.name)}</td><td class="muted">${esc(c.phone || '')}</td><td class="muted">${esc(c.address || '')}</td></tr>`).join('') : '<tr><td class="muted">Tidak ada pelanggan. Tekan Insert untuk menambah.</td></tr>'; }
    let tm; async function load() { try { list = (await POS.get('/api/customers?' + POS.qs({ q: cq.value, active: 1, limit: 10 }))).rows; } catch (_) { list = []; } sel = 0; draw(); }
    cq.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(load, 120); });
    function setMode(x) { mode = x; $('#cv1', el).style.display = x === 'list' ? '' : 'none'; $('#cv2', el).style.display = x === 'new' ? 'grid' : 'none'; (x === 'list' ? cq : $('#nn', el)).focus(); }
    async function save(mm) {
      const name = $('#nn', el).value.trim(); if (!name) { toast('Nama wajib diisi', 'err'); return; }
      try { mm.close(await POS.post('/api/customers', { name, phone: $('#np', el).value, address: $('#na', el).value })); } catch (er) { toast(er.message, 'err'); }
    }
    el.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-i]'); if (tr) m.close(list[+tr.dataset.i]);
      if (e.target.closest('[data-g]')) m.close(null); if (e.target.closest('[data-b]')) m.close(undefined);
      if (e.target.closest('[data-ok]')) { if (mode === 'new') save(m); else if (list[sel]) m.close(list[sel]); }
    });
    load();
    const r = await m.done;
    if (r === undefined) return S.customer;
    S.customer = r ? { id: r.id, name: r.name } : null; render(); return S.customer;
  }

  // ---------- Tahan / panggil ----------
  async function holdCart() {
    if (!S.cart.length) return;
    const note = await POS.prompt('Tahan transaksi', 'Catatan (nama pelanggan / meja, opsional)', '');
    if (note === undefined) return;
    const h = held(); h.push({ t: Date.now(), note, c: S.cart.map((l) => [l.p.id, l.qty, l.discount]), d: S.discount, cu: S.customer, total: totals().total });
    saveHeld(h); resetCart(); toast('Transaksi ditahan', 'ok');
  }
  async function recall() {
    const h = held(); if (!h.length) { toast('Tidak ada transaksi ditahan'); return; }
    let sel = 0;
    const draw = () => { $('#hl', m.el).innerHTML = h.map((x, i) => `<tr class="${i === sel ? 'sel' : ''}" data-i="${i}"><td class="mono">${new Date(x.t).toTimeString().slice(0, 5)}</td><td>${esc(x.note || '-')}</td><td class="muted">${x.c.length} baris</td><td class="r mono">${money(x.total)}</td></tr>`).join(''); };
    const m = POS.modal({ title: 'Transaksi ditahan', hint: '<kbd>Enter</kbd> panggil &middot; <kbd>Del</kbd> hapus', body: '<table class="lst"><tbody id="hl"></tbody></table>', footer: '<button data-b>Tutup <kbd>Esc</kbd></button>',
      onKey: (e, mm) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + h.length) % h.length; draw(); }
        else if (e.key === 'Enter') { e.preventDefault(); mm.close(sel); }
        else if (e.key === 'Delete') { e.preventDefault(); h.splice(sel, 1); saveHeld(h); sel = 0; if (!h.length) mm.close(undefined); else draw(); render(); }
      } });
    draw();
    m.el.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) m.close(+tr.dataset.i); if (e.target.closest('[data-b]')) m.close(undefined); });
    const i = await m.done; if (i === undefined) return;
    if (S.cart.length) { const hh = held(); hh.push({ t: Date.now(), note: '(otomatis ditahan)', c: S.cart.map((l) => [l.p.id, l.qty, l.discount]), d: S.discount, cu: S.customer, total: totals().total }); saveHeld(hh); }
    const x = held().filter((y) => y.t === h[i].t)[0] || h[i];
    const map = new Map(CAT.map((p) => [p.id, p]));
    S.cart = x.c.filter((c) => map.has(c[0])).map((c) => ({ p: map.get(c[0]), qty: c[1], discount: c[2] })); S.discount = x.d || 0; S.customer = x.cu || null; S.sel = 0;
    saveHeld(held().filter((y) => y.t !== x.t)); render();
  }

  // ---------- Pembayaran ----------
  async function openPay() {
    if (!S.cart.length) { toast('Keranjang kosong'); return; }
    const T = totals(); let method = 'TUNAI'; const keys = Object.keys(POS.METHOD);
    const m = POS.modal({
      title: 'Pembayaran', hint: S.customer ? 'Pelanggan: ' + esc(S.customer.name) : '',
      body: `<div class="muted" style="font-size:12px;letter-spacing:.12em">TOTAL TAGIHAN</div><div class="paybig">${rp(T.total)}</div>
        <div class="methods">${keys.map((k, i) => `<button data-m="${k}"><kbd>F${i + 1}</kbd>${POS.METHOD[k]}</button>`).join('')}</div>
        <label class="f" id="al">Uang diterima (kosong = uang pas)</label><input id="pa" class="mono" style="font-size:22px" autocomplete="off" autofocus>
        <div class="quick" id="qk"><button data-q="0"><kbd>F6</kbd> Uang pas</button><button data-q="20000"><kbd>F7</kbd> 20.000</button><button data-q="50000"><kbd>F8</kbd> 50.000</button><button data-q="100000"><kbd>F9</kbd> 100.000</button></div>
        <div id="dueRow" style="display:none;margin-top:10px"><label class="f">Jatuh tempo</label><input type="date" id="pd"></div>
        <div class="change"><span class="muted" id="cl">Kembalian</span><b id="cv">0</b></div><div id="perr" class="neg" style="margin-top:6px;min-height:18px"></div>`,
      footer: '<button data-x>Batal <kbd>Esc</kbd></button><button class="primary" data-go>Proses <kbd>Enter</kbd></button>',
      onKey: async (e, mm) => {
        const f = /^F([1-9])$/.exec(e.key);
        if (f) { e.preventDefault(); const n = +f[1]; if (n <= 5) setMethod(keys[n - 1]); else { const b = $$('[data-q]', mm.el)[n - 6]; if (b) setAmount(+b.dataset.q); } }
        else if (e.key === 'Enter' && e.target.id !== 'pd') { e.preventDefault(); go(); }
      },
    });
    const el = m.el; const pa = $('#pa', el);
    const $$ = (s, r) => [...r.querySelectorAll(s)];
    function amount() { const v = pa.value.trim(); return v === '' ? (method === 'KREDIT' ? 0 : T.total) : toNum(v); }
    function refresh() {
      const a = amount(); const cv = $('#cv', el);
      if (method === 'TUNAI') { $('#cl', el).textContent = a >= T.total ? 'Kembalian' : 'Kurang'; cv.textContent = money(Math.abs(a - T.total)); cv.style.color = a >= T.total ? '' : 'var(--red)'; }
      else if (method === 'KREDIT') { $('#cl', el).textContent = 'Sisa tagihan'; cv.textContent = money(Math.max(T.total - (a || 0), 0)); cv.style.color = ''; }
      else { $('#cl', el).textContent = 'Dibayar pas'; cv.textContent = money(T.total); cv.style.color = ''; }
    }
    async function setMethod(k) {
      if (k === 'KREDIT' && !S.customer) { const c = await pickCustomer(); if (!c) { toast('Kredit wajib memilih pelanggan', 'err'); return; } $('.dh span', el).textContent = 'Pelanggan: ' + c.name; }
      method = k; $$('[data-m]', el).forEach((b) => b.classList.toggle('on', b.dataset.m === k));
      $('#al', el).textContent = k === 'TUNAI' ? 'Uang diterima (kosong = uang pas)' : k === 'KREDIT' ? 'Uang muka (kosong = 0)' : 'Nominal (otomatis pas)';
      $('#qk', el).style.display = k === 'TUNAI' ? '' : 'none'; pa.disabled = !(k === 'TUNAI' || k === 'KREDIT');
      $('#dueRow', el).style.display = k === 'KREDIT' ? '' : 'none';
      if (k === 'KREDIT' && !$('#pd', el).value) { const d = new Date(); d.setDate(d.getDate() + (ST.default_due_days || 14)); $('#pd', el).value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      pa.value = ''; refresh(); (pa.disabled ? el.querySelector('[data-go]') : pa).focus();
    }
    function setAmount(v) { if (method !== 'TUNAI') return; pa.value = v ? String(v) : ''; refresh(); }
    async function go() {
      if (S.busy) return; const a = amount(); const err = $('#perr', el); err.textContent = '';
      if (!Number.isFinite(a) || a < 0) { err.textContent = 'Nominal tidak valid'; return; }
      if (method === 'TUNAI' && a < T.total) { err.textContent = `Uang kurang ${rp(T.total - a)}`; beep(false); return; }
      if (method === 'KREDIT' && a >= T.total) { err.textContent = 'Uang muka harus kurang dari total'; return; }
      S.busy = true; $('[data-go]', el).disabled = true;
      try {
        const sale = await POS.post('/api/sales', { items: S.cart.map((l) => ({ product_id: l.p.id, qty: l.qty })), customer_id: S.customer && S.customer.id, method, paid: method === 'TUNAI' || method === 'KREDIT' ? a : T.total, due_date: method === 'KREDIT' ? $('#pd', el).value : undefined });
        for (const l of S.cart) { const p = CAT.find((x) => x.id === l.p.id); if (p) p.stock = r3(p.stock - l.qty); }
        S.last = sale; resetCart(); m.close(sale); finished(sale);
      } catch (er) { err.textContent = er.message; beep(false); if (er.status === 409) loadCatalog(true); }
      S.busy = false; const g = $('[data-go]', el); if (g) g.disabled = false;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m) setMethod(b.dataset.m); else if (b.dataset.q !== undefined) setAmount(+b.dataset.q);
      else if (b.dataset.x !== undefined) m.close(undefined); else if (b.dataset.go !== undefined) go();
    });
    pa.addEventListener('input', refresh);
    setMethod('TUNAI');
  }

  // ---------- Setelah bayar ----------
  async function finished(sale) {
    const d = POS.device();
    if (d.autoPrint) POS.printReceipt(sale, ST);
    const big = sale.method === 'TUNAI' ? ['KEMBALIAN', rp(sale.change_amount)] : sale.method === 'KREDIT' ? ['SISA TAGIHAN', rp(sale.outstanding)] : ['LUNAS', POS.METHOD[sale.method]];
    const docs = sale.method === 'KREDIT' ? '<kbd>K</kbd> permohonan bayar' : '';
    const m = POS.modal({
      title: 'Transaksi selesai', hint: esc(sale.sale_no),
      body: `<div class="done-big"><div class="l">${big[0]}</div><div class="k">${esc(big[1])}</div></div>
        <p class="muted center" style="margin:10px 0 0;font-size:13px">Total ${rp(sale.total)}${sale.customer_name ? ' &middot; ' + esc(sale.customer_name) : ''}</p>
        <p class="center" style="margin:14px 0 0;font-size:13px"><kbd>P</kbd> cetak struk &nbsp; <kbd>I</kbd> invoice &nbsp; <kbd>J</kbd> surat jalan &nbsp; ${docs}</p>`,
      footer: '<button class="primary" data-n autofocus>Transaksi baru <kbd>Enter</kbd></button>',
      onKey: (e, mm) => {
        const k = e.key.toLowerCase();
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); mm.close(); }
        else if (k === 'p') { e.preventDefault(); POS.printReceipt(sale, ST); }
        else if (k === 'i') { e.preventDefault(); openDoc('invoice', sale.id); }
        else if (k === 'j') { e.preventDefault(); openDoc('delivery', sale.id); }
        else if (k === 'k' && sale.method === 'KREDIT') { e.preventDefault(); openDoc('payment-request', sale.id); }
      },
    });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-n]')) m.close(); });
  }
  const openDoc = (kind, id) => window.open(POS.su(`/api/docs/${kind}/sale/${id}`), '_blank');

  // ---------- Riwayat ----------
  async function history() {
    let rows = []; let sel = 0;
    try { rows = (await POS.get('/api/sales?' + POS.qs({ from: POS.today(), to: POS.today(), limit: 40 }))).rows; } catch (e) { toast(e.message, 'err'); return; }
    const draw = () => { $('#hl', m.el).innerHTML = rows.length ? rows.map((s, i) => `<tr class="${i === sel ? 'sel' : ''}" data-i="${i}"><td class="mono">${esc(s.sale_no.slice(-4))}</td><td class="mono">${esc(s.created_at.slice(11, 16))}</td><td>${esc(s.customer_name || 'Umum')}</td><td>${esc(POS.METHOD[s.method] || s.method)}${s.status === 'VOID' ? ' <span class="tag red">batal</span>' : s.paid < s.total ? ' <span class="tag yellow">belum lunas</span>' : ''}</td><td class="r mono">${money(s.total)}</td></tr>`).join('') : '<tr><td class="muted">Belum ada transaksi hari ini</td></tr>'; };
    const m = POS.modal({ title: 'Transaksi hari ini', wide: true, hint: '<kbd>Enter</kbd> cetak struk &middot; <kbd>I</kbd> invoice &middot; <kbd>J</kbd> surat jalan &middot; <kbd>K</kbd> permohonan',
      body: '<table class="lst"><thead><tr><th>No</th><th>Jam</th><th>Pelanggan</th><th>Bayar</th><th class="r">Total</th></tr></thead><tbody id="hl"></tbody></table>', footer: '<button data-b>Tutup <kbd>Esc</kbd></button>',
      onKey: async (e, mm) => {
        const k = e.key.toLowerCase(); const s = rows[sel];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (rows.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; draw(); $('#hl tr.sel', mm.el).scrollIntoView({ block: 'nearest' }); } }
        else if (!s) return;
        else if (e.key === 'Enter') { e.preventDefault(); try { POS.printReceipt(await POS.get('/api/sales/' + s.id), ST); } catch (er) { toast(er.message, 'err'); } }
        else if (k === 'i' || k === 'j' || k === 'k') { e.preventDefault(); if (s.status === 'VOID') toast('Transaksi sudah dibatalkan', 'err'); else openDoc({ i: 'invoice', j: 'delivery', k: 'payment-request' }[k], s.id); }
      } });
    draw();
    m.el.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { sel = +tr.dataset.i; draw(); } if (e.target.closest('[data-b]')) m.close(); });
  }
  async function reprintLast() { if (S.last) POS.printReceipt(S.last, ST); else history(); }

  async function openDrawer() {
    try { if (!POS.Printer.ready()) await POS.Printer.autoconnect(); await POS.Printer.drawer(); } catch (e) { toast('Laci kas: ' + (POS.Printer.ready() ? e.message : 'hubungkan printer ESC/POS lewat Ctrl+P'), 'err'); }
  }

  function help() {
    const rows = [['F1', 'Bantuan ini'], ['F2', 'Fokus ke kolom cari'], ['F3', 'Ubah qty baris terpilih'], ['F4', 'Pilih pelanggan'], ['F5', 'Tahan transaksi'], ['F6', 'Panggil transaksi ditahan'], ['F9', 'Riwayat hari ini / cetak ulang'], ['F10', 'Buka laci kas'], ['F12 / End', 'Bayar'], ['Enter (kosong)', 'Bayar'], ['Ctrl+P', 'Printer & perangkat'], ['Ctrl+K', 'Scan barcode dengan kamera'], ['Ctrl+Del', 'Kosongkan keranjang'], ['Qty*kode', 'Contoh 3*8999...'], ['Qty*  lalu scan', 'Qty untuk barang berikut'], ['+ / -', 'Qty baris +1 / -1'], ['Del', 'Hapus baris terpilih'], ['Up / Down', 'Pilih baris / hasil'], ['Esc', 'Bersihkan input']];
    const m = POS.modal({ title: 'Pintasan keyboard', wide: true, body: '<div class="helpgrid">' + rows.map((r) => `<div><kbd>${r[0]}</kbd><span>${r[1]}</span></div>`).join('') + '</div>', footer: '<button class="primary" autofocus>Tutup <kbd>Esc</kbd></button>' });
    m.el.addEventListener('click', (e) => { if (e.target.closest('button')) m.close(); });
  }

  async function camScan() {
    const code = await POS.scanCamera(); if (!code) return;
    q.value = code; submitQ(); // sama seperti scanner: kode persis = langsung masuk keranjang
  }
  $('#cam').addEventListener('click', camScan);

  // ---------- Pintasan global ----------
  const ACT = { F1: help, F2: () => { q.focus(); q.select(); }, F3: editQty, F4: pickCustomer, F5: holdCart, F6: recall, F9: history, F10: openDrawer, F12: openPay, End: openPay };
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) { if (/^F\d+$/.test(e.key) && !['F5', 'F12'].includes(e.key)) e.preventDefault(); if (e.key === 'F5' || e.key === 'F12') e.preventDefault(); return; }
    const key = (e.ctrlKey ? 'Ctrl+' : '') + e.key;
    if (key === 'Ctrl+p' || key === 'Ctrl+P') { e.preventDefault(); POS.deviceDialog(ST); return; }
    if (key === 'Ctrl+k' || key === 'Ctrl+K') { e.preventDefault(); camScan(); return; }
    if (key === 'Ctrl+Delete') { e.preventDefault(); clearCart(); return; }
    if (ACT[e.key] && !e.ctrlKey && !e.altKey) { e.preventDefault(); ACT[e.key](); }
  }, true);
  $('#fkeys').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; if (k === 'Ctrl+P') POS.deviceDialog(ST); else ACT[k](); });
  $('#paybtn').addEventListener('click', openPay);
  $('#logout').addEventListener('click', async () => { if (S.cart.length && !(await POS.confirm('Keranjang masih berisi barang. Tetap keluar?', 'Keluar', true))) return; await POS.post('/api/auth/logout'); location.href = '/'; });
  document.addEventListener('pos:dlgclose', focusQ);
  document.addEventListener('click', (e) => { if (!e.target.closest('dialog, button, a, input, select, textarea')) focusQ(); });
  const setNet = () => { const n = $('#net'); n.textContent = navigator.onLine ? 'online' : 'offline'; n.className = 'tag ' + (navigator.onLine ? 'green' : 'red'); };
  window.addEventListener('online', setNet); window.addEventListener('offline', setNet); setNet();
  const clk = () => { const d = new Date(); $('#clock').textContent = d.toTimeString().slice(0, 8) + '  ' + POS.d(POS.today()); };
  clk(); setInterval(clk, 1000);
  // Segarkan katalog saat kasir sedang tidak aktif (stok dari terminal lain)
  setInterval(() => { if (!document.querySelector('dialog[open]') && !S.cart.length && !q.value) loadCatalog(true); }, 90000);

  POS.Printer.autoconnect();
  render(); focusQ();
})();
