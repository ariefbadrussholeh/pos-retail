// Katalog barang bersama: satu barang (item_id) punya satu baris di tiap toko (stok, harga dasar, harga jual per toko).
// Data bersama (SKU, barcode, nama, kategori, satuan, aktif) disamakan di semua baris item yang sama.
const SHARED = ['sku', 'barcode', 'name', 'category_id', 'unit', 'active'];
const PER_STORE = ['buy_price', 'sell_price', 'wholesale_price', 'wholesale_min', 'min_stock'];
const COPY = [...SHARED, 'buy_price', 'sell_price', 'wholesale_price', 'wholesale_min', 'created_at'];

// Lengkapi: setiap toko punya baris untuk setiap barang (stok 0, harga disalin dari baris pertama).
async function fillAllStores(t) {
  const stores = await t.query('SELECT id FROM stores ORDER BY id');
  const reps = await t.query('SELECT * FROM products WHERE id IN (SELECT MIN(id) FROM products GROUP BY item_id)');
  const have = new Set((await t.query('SELECT item_id, store_id FROM products')).map((r) => r.item_id + ':' + r.store_id));
  let n = 0;
  for (const r of reps) {
    for (const s of stores) {
      if (have.has(r.item_id + ':' + s.id)) continue;
      const d = { store_id: s.id, item_id: r.item_id, stock: 0, min_stock: r.min_stock };
      for (const k of COPY) d[k] = r[k];
      await t.insert('products', d); n++;
    }
  }
  return n;
}
// Pisahkan field bersama vs per toko
function split(d) {
  const shared = {}; const store = {};
  for (const k of Object.keys(d)) { if (SHARED.includes(k)) shared[k] = d[k]; else if (PER_STORE.includes(k)) store[k] = d[k]; }
  return { shared, store };
}
module.exports = { fillAllStores, split, SHARED, PER_STORE };
