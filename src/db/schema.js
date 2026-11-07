const fs = require('fs');
const path = require('path');
const db = require('./index');

const VERSION = 6; // 6 = harga manual (e-katalog/SP/langsung per barang), PPH; 3 = multi toko; 4 = pelanggan/pemasok bersama, dokumen; 5 = barang & kategori bersama, jenis penjualan
const INDEXES = [
  'CREATE INDEX idx_products_barcode ON products(barcode)',
  'CREATE INDEX idx_products_name ON products(name)',
  'CREATE INDEX idx_products_cat ON products(category_id)',
  'CREATE INDEX idx_products_store_barcode ON products(store_id, barcode)',
  'CREATE INDEX idx_moves_prod ON stock_moves(product_id, created_at)',
  'CREATE INDEX idx_sales_created ON sales(created_at)',
  'CREATE INDEX idx_sales_store_created ON sales(store_id, created_at)',
  'CREATE INDEX idx_sales_customer ON sales(customer_id)',
  'CREATE INDEX idx_sale_items_sale ON sale_items(sale_id)',
  'CREATE INDEX idx_sale_items_prod ON sale_items(product_id)',
  'CREATE INDEX idx_purchases_date ON purchases(date)',
  'CREATE INDEX idx_purchases_store_date ON purchases(store_id, date)',
  'CREATE INDEX idx_pitems_purchase ON purchase_items(purchase_id)',
  'CREATE INDEX idx_gr_purchase ON goods_receipts(purchase_id)',
  'CREATE INDEX idx_gritems_gr ON goods_receipt_items(receipt_id)',
  'CREATE INDEX idx_opitems_op ON opname_items(opname_id)',
  'CREATE INDEX idx_payments_ref ON payments(ref_type, ref_id)',
  // keunikan per toko (bukan global)
  'CREATE UNIQUE INDEX ux_stores_code ON stores(code)',
  'CREATE UNIQUE INDEX ux_categories_uname ON categories(name)',
  'CREATE UNIQUE INDEX ux_products_item_store ON products(item_id, store_id)',
  'CREATE UNIQUE INDEX ux_products_sku ON products(store_id, sku)',
  'CREATE UNIQUE INDEX ux_sales_no ON sales(store_id, sale_no)',
  'CREATE UNIQUE INDEX ux_purchases_no ON purchases(store_id, po_no)',
  'CREATE UNIQUE INDEX ux_gr_no ON goods_receipts(store_id, gr_no)',
  'CREATE UNIQUE INDEX ux_opnames_no ON opnames(store_id, opname_no)',
];
// pelanggan & pemasok (customers, suppliers) milik bersama semua toko
// kategori juga milik bersama sejak v5; barang = satu baris per toko (stok & harga), dikelompokkan oleh item_id
const STORE_TABLES = ['products', 'sales', 'purchases', 'goods_receipts', 'opnames'];
const ADD_COLS = [
  ['users', 'store_id', 'BIGINT'],
  ['customers', 'spp_to', 'VARCHAR(300)'],
  ['products', 'item_id', 'BIGINT'],
  ...STORE_TABLES.map((t) => [t, 'store_id', 'BIGINT NOT NULL DEFAULT 1']),
  ['sales', 'kind', "VARCHAR(10) NOT NULL DEFAULT 'POS'"],
  ['sales', 'doc_date', 'DATE'],
  ['sales', 'contract_no', 'VARCHAR(80)'],
  ['sales', 'contract_date', 'DATE'],
  ['sales', 'po_ref', 'VARCHAR(80)'],
  ['sales', 'tax_mode', 'VARCHAR(8)'],
  ['sales', 'tax_rate', 'DECIMAL(6,2) NOT NULL DEFAULT 0'],
  ['sales', 'spp_to', 'VARCHAR(300)'],
  ['sales', 'pph_mode', 'VARCHAR(8)'],
  ['sales', 'pph_rate', 'DECIMAL(6,2) NOT NULL DEFAULT 0'],
  ['sales', 'pph', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
  ['products', 'price_ekatalog', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
  ['products', 'price_sp', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
  ['products', 'price_langsung', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
];
// kolom UNIQUE lama (global) yang diganti unik per toko
const OLD_UNIQUE = [['categories', 'name'], ['products', 'sku'], ['sales', 'sale_no'], ['purchases', 'po_no'], ['goods_receipts', 'gr_no'], ['opnames', 'opname_no']];
const TABLES = ['app_meta', 'stores', 'store_settings', 'counters', 'users', 'categories', 'suppliers', 'customers', 'products', 'stock_moves', 'sales', 'sale_items', 'purchases', 'purchase_items', 'goods_receipts', 'goods_receipt_items', 'opnames', 'opname_items', 'payments', 'doc_types', 'sale_docs'];

const ignore = (re) => (e) => { if (!re.test(e.message)) throw e; };

async function addColumn(table, col, ddl) {
  if (db.client === 'pg') return db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${ddl}`);
  try { await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); } catch (e) { ignore(/Duplicate column/i)(e); }
}
async function dropOldUnique(table, col) {
  if (db.client === 'pg') return db.exec(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_${col}_key`);
  try { await db.exec(`ALTER TABLE ${table} DROP INDEX ${col}`); } catch (e) { ignore(/check that column\/key exists|Can't DROP|doesn't exist/i)(e); }
}
async function tableExists(name) {
  const q = db.client === 'pg'
    ? 'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = ? AND table_schema = current_schema()'
    : 'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = ? AND table_schema = DATABASE()';
  return (await db.one(q, [name])).n > 0;
}
async function getVersion() {
  if (!(await tableExists('app_meta'))) return 0;
  const r = await db.one("SELECT v FROM app_meta WHERE k = 'schema'"); return r ? +r.v : 0;
}

async function createSchema() {
  const pg = db.client === 'pg';
  const sql = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8')
    .replace(/\{\{ID\}\}/g, pg ? 'BIGSERIAL PRIMARY KEY' : 'BIGINT AUTO_INCREMENT PRIMARY KEY')
    .replace(/\{\{TS\}\}/g, pg ? 'TIMESTAMP' : 'DATETIME')
    .replace(/\{\{LONGTEXT\}\}/g, pg ? 'TEXT' : 'MEDIUMTEXT');
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.exec(stmt);

  const ver = await getVersion();
  // --- migrasi dari versi lama (satu toko) ---
  for (const [t, c, ddl] of ADD_COLS) await addColumn(t, c, ddl);
  if (ver < 3) for (const [t, c] of OLD_UNIQUE) await dropOldUnique(t, c);
  if (pg) {
    // Supabase membuka schema public lewat Data API (PostgREST). Aplikasi ini memakai koneksi
    // Postgres langsung (bypass RLS), jadi RLS dinyalakan tanpa policy agar anon key tidak bisa baca/tulis.
    for (const t of TABLES) await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    if (await tableExists('settings')) await db.exec('ALTER TABLE settings ENABLE ROW LEVEL SECURITY');
  }
  // toko pertama: ambil nama dari pengaturan lama jika ada
  if (!(await db.one('SELECT id FROM stores LIMIT 1'))) {
    let name = 'Toko Saya'; let old = [];
    if (await tableExists('settings')) old = await db.query('SELECT k, v FROM settings'); // pengaturan lama (satu toko)
    const o = old.find((r) => r.k === 'store_name'); if (o && o.v) name = o.v;
    const code = (name.match(/[A-Za-z0-9]+/g) || ['T']).map((w) => w[0]).join('').toUpperCase().slice(0, 6) || 'T1';
    const sid = await db.insert('stores', { code, name, active: 1, created_at: db.now() });
    for (const r of old) await db.upsert('store_settings', { store_id: sid, k: r.k, v: r.v }, ['store_id', 'k']);
  }
  if (ver < 3) {
    // nomor/counter lama menjadi milik toko 1; barcode tetap global
    const cs = await db.query('SELECT k FROM counters');
    for (const c of cs) if (c.k !== 'BARCODE' && !/^\d+:/.test(c.k)) await db.exec('UPDATE counters SET k = ? WHERE k = ?', ['1:' + c.k, c.k]);
    await db.exec("UPDATE users SET store_id = 1 WHERE role = 'kasir' AND store_id IS NULL");
  }
  if (ver < 5) await migrateV5();
  if (ver < 6) await migrateV6();
  for (const ix of INDEXES) {
    try { await db.exec(pg ? ix.replace(/CREATE (UNIQUE )?INDEX/, (m) => m + ' IF NOT EXISTS') : ix); }
    catch (e) { if (!/exist|Duplicate key name/i.test(e.message)) throw e; }
  }
  await seedDocTypes();
  await db.upsert('app_meta', { k: 'schema', v: String(VERSION) }, ['k']);
}
// v5: kategori digabung per nama; barang dikelompokkan per item_id (SKU sama di beberapa toko = satu barang),
// setiap toko punya baris untuk setiap barang; kind CUSTOM -> INAPROC; No. Kontrak dan No. SP disatukan.
async function migrateV5() {
  const cats = await db.query('SELECT id, name FROM categories ORDER BY id');
  const keep = new Map();
  for (const c of cats) {
    const k = c.name.trim().toLowerCase();
    if (!keep.has(k)) { keep.set(k, c.id); continue; }
    await db.exec('UPDATE products SET category_id = ? WHERE category_id = ?', [keep.get(k), c.id]);
    await db.exec('DELETE FROM categories WHERE id = ?', [c.id]);
  }
  if (db.client === 'pg') await db.exec('DROP INDEX IF EXISTS ux_categories_name');
  else { try { await db.exec('DROP INDEX ux_categories_name ON categories'); } catch (e) { ignore(/check that column\/key exists|Can't DROP|doesn't exist/i)(e); } }

  const prods = await db.query('SELECT id, sku FROM products ORDER BY id');
  const first = new Map();
  for (const p of prods) { if (!first.has(p.sku)) first.set(p.sku, p.id); await db.exec('UPDATE products SET item_id = ? WHERE id = ?', [first.get(p.sku), p.id]); }
  await require('../services/catalog').fillAllStores(db);
  await db.exec("UPDATE sales SET kind = 'INAPROC' WHERE kind = 'CUSTOM'");
  await db.exec("UPDATE sales SET contract_no = po_ref WHERE (contract_no IS NULL OR contract_no = '') AND po_ref IS NOT NULL AND po_ref <> ''");
}
// v6: harga e-katalog / SP / langsung disimpan manual per barang per toko. Barang lama diisi dari acuan harga v1.5
// (pengaturan price_* toko) supaya harga yang sedang berlaku tidak berubah; setelah itu murni isian manual.
async function migrateV6() {
  const stores = await db.query('SELECT id FROM stores');
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const st of stores) {
    const rows = await db.query("SELECT k, v FROM store_settings WHERE store_id = ? AND k LIKE 'price_%'", [st.id]);
    const c = { price_akomodasi: 2000, price_laba: 15, price_pph: 1.5, price_ppn: 11 };
    for (const r of rows) if (r.k in c && r.v !== '' && !Number.isNaN(Number(r.v))) c[r.k] = Number(r.v);
    const prods = await db.query('SELECT id, buy_price FROM products WHERE store_id = ? AND price_ekatalog = 0 AND price_sp = 0 AND price_langsung = 0', [st.id]);
    for (const p of prods) {
      const jumlah = r2(Number(p.buy_price) + c.price_akomodasi);
      const offline = r2(jumlah + r2(jumlah * c.price_laba / 100));
      const ekat = r2(offline + r2(offline * c.price_pph / 100) + r2(offline * c.price_ppn / 100));
      await db.exec('UPDATE products SET price_ekatalog = ?, price_sp = ?, price_langsung = ? WHERE id = ?', [ekat, offline, offline, p.id]);
    }
  }
  await db.exec("DELETE FROM store_settings WHERE k IN ('price_akomodasi', 'price_laba', 'price_pph', 'price_ppn')");
}
// Jenis dokumen awal untuk Penjualan INAPROC (bisa diubah di menu Master Dokumen). "Lainnya" selalu tersedia di layar upload.
const DOC_TYPES = ['Surat Pesanan (SP)', 'Kontrak / SPK', 'Berita Acara Serah Terima (BAST)', 'Surat Jalan (bertanda tangan)', 'Invoice / Kwitansi', 'Faktur Pajak', 'Bukti Transfer'];
async function seedDocTypes() {
  if ((await db.one('SELECT COUNT(*) AS n FROM doc_types')).n > 0) return;
  for (const name of DOC_TYPES) await db.insert('doc_types', { name, active: 1 });
}
// Dipakai server: migrasi otomatis sekali per proses (aman diulang)
let ready = null;
function ensureSchema() {
  if (!ready) ready = getVersion().then((v) => (v >= VERSION ? null : createSchema())).catch((e) => { ready = null; throw e; });
  return ready;
}
module.exports = { createSchema, ensureSchema, seedDocTypes, TABLES, VERSION };
