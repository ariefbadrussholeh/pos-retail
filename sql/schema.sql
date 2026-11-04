-- Token: {{ID}} {{TS}} {{LONGTEXT}} diganti sesuai dialek (pg / mysql) oleh src/db/schema.js
CREATE TABLE IF NOT EXISTS app_meta (
  k VARCHAR(64) PRIMARY KEY,
  v VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS stores (
  id {{ID}},
  code VARCHAR(12) NOT NULL,
  name VARCHAR(150) NOT NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at {{TS}} NOT NULL
);
CREATE TABLE IF NOT EXISTS store_settings (
  store_id BIGINT NOT NULL,
  k VARCHAR(64) NOT NULL,
  v {{LONGTEXT}},
  PRIMARY KEY (store_id, k)
);
CREATE TABLE IF NOT EXISTS counters (
  k VARCHAR(64) PRIMARY KEY,
  v BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id {{ID}},
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'kasir',
  password_hash VARCHAR(100) NOT NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  store_id BIGINT,
  created_at {{TS}} NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
  id {{ID}},
  name VARCHAR(150) NOT NULL,
  contact VARCHAR(100),
  phone VARCHAR(40),
  email VARCHAR(100),
  address VARCHAR(300),
  npwp VARCHAR(40),
  note VARCHAR(300),
  active SMALLINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS customers (
  id {{ID}},
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(100),
  address VARCHAR(300),
  npwp VARCHAR(40),
  spp_to VARCHAR(300),
  note VARCHAR(300),
  active SMALLINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  sku VARCHAR(50) NOT NULL,
  barcode VARCHAR(60),
  name VARCHAR(200) NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  buy_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  wholesale_min DECIMAL(15,3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(15,3) NOT NULL DEFAULT 0,
  stock DECIMAL(15,3) NOT NULL DEFAULT 0,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at {{TS}} NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_moves (
  id {{ID}},
  product_id BIGINT NOT NULL REFERENCES products(id),
  type VARCHAR(20) NOT NULL,
  qty DECIMAL(15,3) NOT NULL,
  balance DECIMAL(15,3) NOT NULL,
  ref_type VARCHAR(20),
  ref_id BIGINT,
  ref_no VARCHAR(40),
  note VARCHAR(300),
  user_id BIGINT,
  created_at {{TS}} NOT NULL
);
CREATE TABLE IF NOT EXISTS sales (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  sale_no VARCHAR(40) NOT NULL,
  kind VARCHAR(10) NOT NULL DEFAULT 'POS',
  doc_date DATE,
  contract_no VARCHAR(80),
  contract_date DATE,
  po_ref VARCHAR(80),
  tax_mode VARCHAR(8),
  tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  spp_to VARCHAR(300),
  created_at {{TS}} NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id),
  customer_id BIGINT REFERENCES customers(id),
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid DECIMAL(15,2) NOT NULL DEFAULT 0,
  change_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  method VARCHAR(12) NOT NULL DEFAULT 'TUNAI',
  due_date DATE,
  status VARCHAR(10) NOT NULL DEFAULT 'DONE',
  note VARCHAR(300),
  void_at {{TS}},
  void_by BIGINT
);
CREATE TABLE IF NOT EXISTS sale_items (
  id {{ID}},
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  sku VARCHAR(50),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  qty DECIMAL(15,3) NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  po_no VARCHAR(30) NOT NULL,
  created_at {{TS}} NOT NULL,
  date DATE NOT NULL,
  due_date DATE,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  supplier_ref VARCHAR(60),
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid DECIMAL(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  note VARCHAR(300),
  user_id BIGINT
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id {{ID}},
  purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  sku VARCHAR(50),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  qty DECIMAL(15,3) NOT NULL,
  received DECIMAL(15,3) NOT NULL DEFAULT 0,
  price DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS goods_receipts (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  gr_no VARCHAR(30) NOT NULL,
  created_at {{TS}} NOT NULL,
  date DATE NOT NULL,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  supplier_do VARCHAR(60),
  status VARCHAR(10) NOT NULL DEFAULT 'DONE',
  note VARCHAR(300),
  user_id BIGINT
);
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id {{ID}},
  receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id),
  purchase_item_id BIGINT NOT NULL REFERENCES purchase_items(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  qty DECIMAL(15,3) NOT NULL,
  price DECIMAL(15,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS opnames (
  id {{ID}},
  store_id BIGINT NOT NULL DEFAULT 1,
  opname_no VARCHAR(30) NOT NULL,
  created_at {{TS}} NOT NULL,
  date DATE NOT NULL,
  note VARCHAR(300),
  user_id BIGINT
);
CREATE TABLE IF NOT EXISTS opname_items (
  id {{ID}},
  opname_id BIGINT NOT NULL REFERENCES opnames(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  system_qty DECIMAL(15,3) NOT NULL,
  counted_qty DECIMAL(15,3) NOT NULL,
  diff DECIMAL(15,3) NOT NULL,
  cost DECIMAL(15,2) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id {{ID}},
  ref_type VARCHAR(10) NOT NULL,
  ref_id BIGINT NOT NULL,
  created_at {{TS}} NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  method VARCHAR(12) NOT NULL DEFAULT 'TUNAI',
  note VARCHAR(300),
  user_id BIGINT
);

CREATE TABLE IF NOT EXISTS doc_types (
  id {{ID}},
  name VARCHAR(100) NOT NULL,
  active SMALLINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sale_docs (
  id {{ID}},
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  type_id BIGINT REFERENCES doc_types(id),
  title VARCHAR(200) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  data {{LONGTEXT}} NOT NULL,
  created_at {{TS}} NOT NULL,
  user_id BIGINT
);
