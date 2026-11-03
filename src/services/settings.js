const db = require('../db');

const DEFAULTS = {
  store_name: 'Toko Saya',
  store_tagline: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  npwp: '',
  logo: '',                 // data URL (png/jpeg), maks ~400 KB
  receipt_header: '',
  receipt_footer: 'Terima kasih atas kunjungan Anda',
  receipt_show_logo: '1',
  receipt_show_npwp: '0',
  paper_width: '80',        // 58 | 80
  tax_percent: '0',
  tax_inclusive: '0',       // 1 = harga sudah termasuk pajak
  tax_label: 'PPN',
  allow_negative_stock: '1',
  auto_barcode: '1',        // barang baru tanpa barcode otomatis diberi EAN-13
  default_due_days: '14',
  bank_name: '',
  bank_account: '',
  bank_holder: '',
  signer_name: '',
  signer_title: 'Pimpinan',
  doc_note: '',             // catatan kaki invoice
  doc_template: 'default',  // default | ardana  (template invoice, surat jalan, SPP)
  doc_accent: '#E8710A',    // warna aksen template (hex)
  doc_accent2: '#1F3864',   // warna kedua (template Ardana)
  doc_no_format: '{n} / {rom} / {code} / {yyyy}', // format nomor Penjualan Custom
  custom_tax_percent: '11', // tarif pajak bawaan Penjualan Custom
  doc_thanks: 'TERIMA KASIH\nATAS PEMBELIAN ANDA', // teks ucapan di surat jalan/invoice
  tpl_header: '',           // gambar ornamen kanan atas (PNG/JPEG)
  tpl_footer: '',           // gambar ornamen/strip bawah (PNG/JPEG)
  tpl_phone_icon: '',       // ikon telepon di strip bawah (PNG/JPEG)
};
const IMG_KEYS = ['tpl_header', 'tpl_footer', 'tpl_phone_icon'];
const TEMPLATES = ['default', 'ardana'];
const BOOL = ['receipt_show_logo', 'receipt_show_npwp', 'tax_inclusive', 'allow_negative_stock', 'auto_barcode'];
const NUM = ['tax_percent', 'default_due_days', 'paper_width', 'custom_tax_percent'];

const cache = new Map(); // storeId -> pengaturan mentah
async function load(sid) {
  const rows = await db.query('SELECT k, v FROM store_settings WHERE store_id = ?', [sid]);
  const o = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) o[r.k] = r.v == null ? '' : r.v;
  const st = await db.one('SELECT code, name FROM stores WHERE id = ?', [sid]);
  if (st) { o.store_code = st.code; if (!rows.some((r) => r.k === 'store_name')) o.store_name = st.name; }
  cache.set(sid, o);
  return o;
}
function typed(o) {
  const t = { ...o };
  for (const k of BOOL) t[k] = o[k] === '1' || o[k] === 1 || o[k] === true;
  for (const k of NUM) t[k] = Number(o[k]) || 0;
  return t;
}
const bad = (m) => Object.assign(new Error(m), { status: 400 });
async function get(sid) { sid = +sid; return typed(cache.get(sid) || await load(sid)); }
async function save(sid, input) {
  sid = +sid;
  const rows = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in input)) continue;
    let v = input[k];
    if (BOOL.includes(k)) v = (v === true || v === '1' || v === 1 || v === 'true') ? '1' : '0';
    else v = v == null ? '' : String(v);
    if (k === 'logo' && v) {
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw bad('Logo harus PNG/JPEG/WebP');
      if (v.length > 600000) throw bad('Ukuran logo terlalu besar (maks ~400 KB)');
    }
    if (IMG_KEYS.includes(k) && v) {
      if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(v)) throw bad('Gambar template harus PNG atau JPEG');
      if (v.length > 900000) throw bad('Ukuran gambar template terlalu besar (maks ~650 KB)');
    }
    if (k === 'paper_width' && !['58', '80'].includes(v)) v = '80';
    if (k === 'doc_template' && !TEMPLATES.includes(v)) throw bad('Template tidak dikenal');
    if (k === 'doc_accent' || k === 'doc_accent2') { if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw bad('Warna harus berformat #RRGGBB'); }
    if (k === 'doc_no_format' && !/\{n\}/.test(v)) throw bad('Format nomor harus memuat {n}');
    if (k === 'tax_percent' || k === 'custom_tax_percent') { const n = Number(v); if (!(n >= 0 && n <= 100)) throw bad('Pajak harus 0-100'); }
    rows.push([k, v]);
  }
  await db.tx(async (t) => {
    for (const [k, v] of rows) await t.upsert('store_settings', { store_id: sid, k, v }, ['store_id', 'k']);
    const nm = rows.find(([k]) => k === 'store_name');
    if (nm && nm[1].trim()) await t.exec('UPDATE stores SET name = ? WHERE id = ?', [nm[1].trim().slice(0, 150), sid]);
  });
  cache.delete(sid);
  return get(sid);
}
const clearCache = () => cache.clear();
// Data URL -> Buffer (untuk PDF). webp tidak didukung pdfkit.
function toBuffer(url) {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(url || '');
  if (!m || m[1] === 'webp') return null;
  return Buffer.from(m[2], 'base64');
}
const logoBuffer = async (sid) => toBuffer((await get(sid)).logo);
const publicInfo = (s) => ({ store_name: s.store_name, store_tagline: s.store_tagline, has_logo: !!s.logo });
module.exports = { get, save, logoBuffer, toBuffer, publicInfo, clearCache, DEFAULTS, TEMPLATES };
