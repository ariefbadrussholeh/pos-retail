// Barcode internal EAN-13. Awalan "20" dipakai standar GS1 untuk penggunaan internal toko,
// sehingga tidak bentrok dengan barcode produk pabrikan.
function checkDigit(d12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
const validEan13 = (c) => /^\d{13}$/.test(c) && +c[12] === checkDigit(c.slice(0, 12));

// Harus dipanggil di dalam transaksi `t`. Dijamin belum dipakai barang lain.
async function next(t) {
  for (let i = 0; i < 20; i++) {
    const n = await t.nextCounter('BARCODE');
    const body = '20' + String(n).padStart(10, '0');
    const code = body + checkDigit(body);
    if (!(await t.one('SELECT id FROM products WHERE barcode = ? OR sku = ?', [code, code]))) return code;
  }
  throw Object.assign(new Error('Gagal membuat barcode unik'), { status: 500 });
}
module.exports = { next, checkDigit, validEan13 };
