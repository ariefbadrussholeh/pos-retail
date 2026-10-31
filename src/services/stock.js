const { err, round3 } = require('./util');
const settings = require('./settings');

// Ubah stok + catat kartu stok. Harus dipanggil di dalam transaksi `t`.
// qty bertanda: + masuk, - keluar. Baris produk terkunci oleh UPDATE sampai commit.
async function move(t, o) {
  const r = await t.exec('UPDATE products SET stock = stock + ? WHERE id = ?', [round3(o.qty), o.product_id]);
  if (!r.rowCount) throw err(400, 'Barang tidak ditemukan');
  const p = await t.one('SELECT stock, name FROM products WHERE id = ?', [o.product_id]);
  if (o.qty < 0 && p.stock < 0 && !o.allowNegative) {
    throw err(409, `Stok ${p.name} tidak cukup (sisa ${p.stock - o.qty})`);
  }
  await t.insert('stock_moves', {
    product_id: o.product_id, type: o.type, qty: round3(o.qty), balance: p.stock,
    ref_type: o.ref_type || null, ref_id: o.ref_id || null, ref_no: o.ref_no || null,
    note: o.note ? String(o.note).slice(0, 300) : null, user_id: o.user_id || null, created_at: t.now(),
  });
  return p.stock;
}
async function allowNegative() { return (await settings.get()).allow_negative_stock; }
module.exports = { move, allowNegative };
