// PPH (PPh Pasal 22) HANYA UNTUK LAPORAN. Tidak pernah memengaruhi total, invoice, surat jalan, atau SPP.
// Hanya penjualan INAPROC (e-katalog) yang dihitung; jenis lain = 0.
// Dasar = DPP, yaitu nilai penjualan SEBELUM PPN (semua baris, termasuk barang bebas PPN).
// Tarif menurut metode pembayaran instansi:
//   UP = Uang Persediaan, LS = Langsung.
// UBAH TARIF DI SINI. Catatan: PMK 34/PMK.010/2017 (diubah PMK 110/2018 dan 41/2022) menyebut 1,5% dari harga pembelian di luar PPN untuk
// pemungutan oleh bendahara pemerintah, tanpa membedakan UP dan LS. Tarif UP 0,5% di bawah mengikuti arahan pemilik toko; pastikan ke konsultan pajak.
const RATES = { UP: 0.5, LS: 1.5 };
const PAY_TYPES = Object.keys(RATES);
// Pembulatan ke atas ke rupiah penuh (toleransi kesalahan floating point)
const up = (x) => Math.ceil(Math.round(x * 1e6) / 1e6);
function calc(kind, payType, dpp) {
  if (kind !== 'INAPROC') return { pph: 0, rate: 0 };
  const rate = RATES[payType];
  if (!rate) return { pph: 0, rate: 0 };
  return { pph: up(dpp * rate / 100), rate };
}
// PPN dihitung dari DPP (dasar pengenaan pajak) PER BARIS. Tiap baris punya centang kena PPN (ppn_on); baris yang tidak dicentang tidak dikenai PPN.
// Pada baris yang "sudah termasuk", DPP = jumlah baris / (1 + tarif PPN). total = subtotal + PPN bila "ditambahkan".
// Semua hasil dibulatkan KE ATAS ke rupiah penuh. PPH tidak ada di nota: dihitung terpisah untuk laporan (services/pph.js).
function calcTax(lines, ppnMode, ppnRate) {
  let subtotal = 0; let ppn = 0; let dppTotal = 0;
  for (const l of lines) {
    subtotal += l.total;
    const onN = ppnMode !== 'NONE' && l.ppn_on;
    const dpp = l.total / (onN && ppnMode === 'INCLUDE' ? 1 + ppnRate / 100 : 1);
    dppTotal += dpp;
    if (onN) ppn += dpp * ppnRate / 100;
  }
  subtotal = up(subtotal); const tax = up(ppn);
  const total = subtotal + (ppnMode === 'EXCLUDE' ? tax : 0);
  return { subtotal, dpp: dppTotal, tax, total };
}
module.exports = { RATES, PAY_TYPES, up, calc, calcTax };
