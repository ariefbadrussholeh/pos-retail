const fs = require('fs');
const path = require('path');
const db = require('./index');

const VERSION = 3; // 3 = multi toko + penjualan custom
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
  'CREATE UNIQUE INDEX ux_categories_name ON categories(store_id, name)',
  'CREATE UNIQUE INDEX ux_products_sku ON products(store_id, sku)',
  'CREATE UNIQUE INDEX ux_sales_no ON sales(store_id, sale_no)',
  'CREATE UNIQUE INDEX ux_purchases_no ON purchases(store_id, po_no)',
  'CREATE UNIQUE INDEX ux_gr_no ON goods_receipts(store_id, gr_no)',
  'CREATE UNIQUE INDEX ux_opnames_no ON opnames(store_id, opname_no)',
];
const STORE_TABLES = ['categories', 'suppliers', 'customers', 'products', 'sales', 'purchases', 'goods_receipts', 'opnames'];
const ADD_COLS = [
  ['users', 'store_id', 'BIGINT'],
  ...STORE_TABLES.map((t) => [t, 'store_id', 'BIGINT NOT NULL DEFAULT 1']),
  ['sales', 'kind', "VARCHAR(10) NOT NULL DEFAULT 'POS'"],
  ['sales', 'doc_date', 'DATE'],
  ['sales', 'contract_no', 'VARCHAR(80)'],
  ['sales', 'contract_date', 'DATE'],
  ['sales', 'po_ref', 'VARCHAR(80)'],
  ['sales', 'tax_mode', 'VARCHAR(8)'],
  ['sales', 'tax_rate', 'DECIMAL(6,2) NOT NULL DEFAULT 0'],
  ['sales', 'spp_to', 'VARCHAR(300)'],
];
// kolom UNIQUE lama (global) yang diganti unik per toko
const OLD_UNIQUE = [['categories', 'name'], ['products', 'sku'], ['sales', 'sale_no'], ['purchases', 'po_no'], ['goods_receipts', 'gr_no'], ['opnames', 'opname_no']];
const TABLES = ['app_meta', 'stores', 'store_settings', 'counters', 'users', 'categories', 'suppliers', 'customers', 'products', 'stock_moves', 'sales', 'sale_items', 'purchases', 'purchase_items', 'goods_receipts', 'goods_receipt_items', 'opnames', 'opname_items', 'payments'];

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
  for (const ix of INDEXES) {
    try { await db.exec(pg ? ix.replace(/CREATE (UNIQUE )?INDEX/, (m) => m + ' IF NOT EXISTS') : ix); }
    catch (e) { if (!/exist|Duplicate key name/i.test(e.message)) throw e; }
  }
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
  await db.upsert('app_meta', { k: 'schema', v: String(VERSION) }, ['k']);
}
// Dipakai server: migrasi otomatis sekali per proses (aman diulang)
let ready = null;
function ensureSchema() {
  if (!ready) ready = getVersion().then((v) => (v >= VERSION ? null : createSchema())).catch((e) => { ready = null; throw e; });
  return ready;
}
module.exports = { createSchema, ensureSchema, TABLES, VERSION };
