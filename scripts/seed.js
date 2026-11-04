// Data contoh (opsional): kategori, barang, pemasok, pelanggan. Jalankan setelah db:init.
const db = require('../src/db');
const stock = require('../src/services/stock');
const { ensureSchema } = require('../src/db/schema');
(async () => {
  await ensureSchema();
  const sid = (await db.one('SELECT id FROM stores ORDER BY id LIMIT 1')).id; // data contoh masuk ke toko pertama
  const cats = {};
  for (const n of ['Minuman', 'Makanan Ringan', 'Sembako', 'Kebersihan', 'Alat Tulis']) cats[n] = await db.insert('categories', { store_id: sid, name: n });
  const items = [
    ['Air Mineral 600ml', '8991001000011', 'Minuman', 'btl', 2000, 3500, 24, 3000, 120],
    ['Teh Botol 450ml', '8991001000028', 'Minuman', 'btl', 3500, 5500, 0, 0, 60],
    ['Kopi Sachet Hitam', '8991001000035', 'Minuman', 'sct', 1000, 2000, 0, 0, 200],
    ['Keripik Singkong 150g', '8991002000010', 'Makanan Ringan', 'bks', 6000, 9500, 0, 0, 40],
    ['Biskuit Kelapa 300g', '8991002000027', 'Makanan Ringan', 'bks', 8000, 12000, 0, 0, 35],
    ['Beras Premium 5kg', '8991003000017', 'Sembako', 'krg', 62000, 72000, 0, 0, 25],
    ['Gula Pasir 1kg', '8991003000024', 'Sembako', 'kg', 14000, 17000, 0, 0, 50],
    ['Minyak Goreng 2L', '8991003000031', 'Sembako', 'btl', 32000, 38000, 0, 0, 30],
    ['Sabun Cuci Piring 400ml', '8991004000014', 'Kebersihan', 'btl', 8000, 12500, 0, 0, 20],
    ['Tisu Wajah 250s', '8991004000021', 'Kebersihan', 'bks', 9000, 14000, 0, 0, 3],
    ['Pulpen Hitam', '8991005000019', 'Alat Tulis', 'pcs', 1500, 3000, 0, 0, 100],
    ['Buku Tulis 38 Lembar', '8991005000026', 'Alat Tulis', 'pcs', 3000, 5000, 0, 0, 80],
  ];
  let n = 0;
  for (const [name, barcode, cat, unit, buy, sell, wmin, wprice, qty] of items) {
    n++;
    const id = await db.insert('products', { store_id: sid, sku: 'B' + String(n).padStart(6, '0'), barcode, name, category_id: cats[cat], unit, buy_price: buy, sell_price: sell, wholesale_min: wmin, wholesale_price: wprice, min_stock: 10, stock: 0, active: 1, created_at: db.now() });
    await db.tx((t) => stock.move(t, { store_id: sid, product_id: id, qty, type: 'OPENING', note: 'Stok awal', allowNegative: true }));
  }
  await db.upsert('counters', { k: `${sid}:SKU`, v: n }, ['k']);
  await db.insert('suppliers', { name: 'PT Sumber Pangan Nusantara', contact: 'Rudi', phone: '021-5550101', address: 'Jl. Industri No. 12, Jakarta', active: 1 });
  await db.insert('customers', { name: 'CV Mitra Sejahtera', phone: '0812-3456-7890', address: 'Jl. Kenanga No. 5, Bandung', active: 1 });
  console.log('Data contoh dimasukkan.');
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
