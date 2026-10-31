const fs = require('fs');
const path = require('path');
const db = require('./index');

const INDEXES = [
  'CREATE INDEX idx_products_barcode ON products(barcode)',
  'CREATE INDEX idx_products_name ON products(name)',
  'CREATE INDEX idx_products_cat ON products(category_id)',
  'CREATE INDEX idx_moves_prod ON stock_moves(product_id, created_at)',
  'CREATE INDEX idx_sales_created ON sales(created_at)',
  'CREATE INDEX idx_sales_customer ON sales(customer_id)',
  'CREATE INDEX idx_sale_items_sale ON sale_items(sale_id)',
  'CREATE INDEX idx_sale_items_prod ON sale_items(product_id)',
  'CREATE INDEX idx_purchases_date ON purchases(date)',
  'CREATE INDEX idx_pitems_purchase ON purchase_items(purchase_id)',
  'CREATE INDEX idx_gr_purchase ON goods_receipts(purchase_id)',
  'CREATE INDEX idx_gritems_gr ON goods_receipt_items(receipt_id)',
  'CREATE INDEX idx_opitems_op ON opname_items(opname_id)',
  'CREATE INDEX idx_payments_ref ON payments(ref_type, ref_id)',
];
const TABLES = ['settings', 'counters', 'users', 'categories', 'suppliers', 'customers', 'products', 'stock_moves', 'sales', 'sale_items', 'purchases', 'purchase_items', 'goods_receipts', 'goods_receipt_items', 'opnames', 'opname_items', 'payments'];

async function createSchema() {
  const pg = db.client === 'pg';
  const sql = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8')
    .replace(/\{\{ID\}\}/g, pg ? 'BIGSERIAL PRIMARY KEY' : 'BIGINT AUTO_INCREMENT PRIMARY KEY')
    .replace(/\{\{TS\}\}/g, pg ? 'TIMESTAMP' : 'DATETIME')
    .replace(/\{\{LONGTEXT\}\}/g, pg ? 'TEXT' : 'MEDIUMTEXT');
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt);
  }
  for (const ix of INDEXES) {
    try { await db.exec(pg ? ix.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS') : ix); }
    catch (e) { if (!/exist|Duplicate key name/i.test(e.message)) throw e; }
  }
  if (pg) {
    // Supabase membuka schema public lewat Data API (PostgREST). Aplikasi ini memakai koneksi
    // Postgres langsung (bypass RLS), jadi RLS dinyalakan tanpa policy agar anon key tidak bisa baca/tulis.
    for (const t of TABLES) await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
}
module.exports = { createSchema, TABLES };
