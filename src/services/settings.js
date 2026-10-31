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
};
const BOOL = ['receipt_show_logo', 'receipt_show_npwp', 'tax_inclusive', 'allow_negative_stock', 'auto_barcode'];
const NUM = ['tax_percent', 'default_due_days', 'paper_width'];

let cache = null;
async function load() {
  const rows = await db.query('SELECT k, v FROM settings');
  const o = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) o[r.k] = r.v == null ? '' : r.v;
  cache = o;
  return o;
}
function typed(o) {
  const t = { ...o };
  for (const k of BOOL) t[k] = o[k] === '1' || o[k] === 1 || o[k] === true;
  for (const k of NUM) t[k] = Number(o[k]) || 0;
  return t;
}
async function get() { return typed(cache || await load()); }
async function save(input) {
  const rows = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in input)) continue;
    let v = input[k];
    if (BOOL.includes(k)) v = (v === true || v === '1' || v === 1 || v === 'true') ? '1' : '0';
    else v = v == null ? '' : String(v);
    if (k === 'logo' && v) {
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw Object.assign(new Error('Logo harus PNG/JPEG/WebP'), { status: 400 });
      if (v.length > 600000) throw Object.assign(new Error('Ukuran logo terlalu besar (maks ~400 KB)'), { status: 400 });
    }
    if (k === 'paper_width' && !['58', '80'].includes(v)) v = '80';
    if (k === 'tax_percent') { const n = Number(v); if (!(n >= 0 && n <= 100)) throw Object.assign(new Error('Pajak harus 0-100'), { status: 400 }); }
    rows.push([k, v]);
  }
  await db.tx(async (t) => { for (const [k, v] of rows) await t.upsert('settings', { k, v }, ['k']); });
  cache = null;
  return get();
}
// Logo sebagai Buffer (untuk PDF) + data URL (untuk web)
async function logoBuffer() {
  const s = await get();
  if (!s.logo) return null;
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(s.logo);
  if (!m) return null;
  if (m[1] === 'webp') return null; // pdfkit tidak mendukung webp
  return Buffer.from(m[2], 'base64');
}
const publicInfo = (s) => ({ store_name: s.store_name, store_tagline: s.store_tagline, has_logo: !!s.logo });
module.exports = { get, save, logoBuffer, publicInfo, DEFAULTS };
