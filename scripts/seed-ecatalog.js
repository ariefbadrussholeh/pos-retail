// Seeder master barang dari "RINCIAN BARANG E-CATALOG" (scripts/data/ecatalog.json).
// Isi: nama + harga dasar. Harga jual (POS) = harga offline sesuai Excel, ((dasar + akomodasi) + laba per barang).
// Master bersama: semua toko mendapat barang ini (stok 0, harga dasar & harga jual sama; ubah per toko di menu Barang).
// Aman diulang: barang yang namanya sudah ada diperbarui harganya, bukan digandakan.
// Pakai: npm run seed:ecatalog
const db = require('../src/db');
const { ensureSchema } = require('../src/db/schema');
const barcode = require('../src/services/barcode');
const catalog = require('../src/services/catalog');
const data = require('./data/ecatalog.json');

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
(async () => {
  await ensureSchema();
  const sid = (await db.one('SELECT id FROM stores ORDER BY id LIMIT 1')).id;
  let created = 0; let updated = 0;
  await db.tx(async (t) => {
    for (const it of data) {
      const sell = r2((it.buy + it.akomodasi) * (1 + it.laba / 100));
      const ex = await t.one('SELECT item_id FROM products WHERE LOWER(name) = ? ORDER BY id LIMIT 1', [it.name.toLowerCase()]);
      if (ex) { await t.exec('UPDATE products SET buy_price = ?, sell_price = ? WHERE item_id = ?', [it.buy, sell, ex.item_id]); updated++; continue; }
      let sku;
      for (let i = 0; i < 500; i++) { sku = 'B' + String(await t.nextCounter('SKU')).padStart(6, '0'); if (!(await t.one('SELECT id FROM products WHERE sku = ? OR barcode = ?', [sku, sku]))) break; }
      const id = await t.insert('products', { store_id: sid, sku, barcode: await barcode.next(t), name: it.name, unit: 'pcs', buy_price: it.buy, sell_price: sell, wholesale_price: 0, wholesale_min: 0, min_stock: 0, stock: 0, active: 1, created_at: t.now() });
      await t.exec('UPDATE products SET item_id = id WHERE id = ?', [id]);
      created++;
    }
    await catalog.fillAllStores(t);
  });
  console.log(`Master barang e-katalog: ${created} baru, ${updated} diperbarui (total ${data.length}). Satuan awal "pcs", stok 0.`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
