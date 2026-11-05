// ACUAN HARGA JUAL (sama dengan Excel e-katalog). Angka dasar diatur per toko di Pengaturan > Acuan harga.
//   jumlah           = harga dasar + akomodasi
//   harga jual offline = jumlah + laba (jumlah x laba%)         -> kasir (POS), Penjualan SP, Penjualan Langsung
//   harga INAPROC    = harga jual offline + PPH + PPN            -> Penjualan INAPROC (PPN sudah termasuk)
//   PPH = harga offline x pph%,  PPN = harga offline x ppn%     (keduanya dari harga offline, seperti di Excel)
const { round2 } = require('./util');

// Penjualan SP / Langsung: bila subtotal di atas angka ini, PPN wajib ditambahkan
const PPN_WAJIB_MIN = 2000000;

function calc(buy, cfg) {
  const dasar = round2(Number(buy) || 0);
  const akomodasi = round2(Number(cfg.price_akomodasi) || 0);
  const jumlah = round2(dasar + akomodasi);
  const laba = round2(jumlah * (Number(cfg.price_laba) || 0) / 100);
  const offline = round2(jumlah + laba);
  const pph = round2(offline * (Number(cfg.price_pph) || 0) / 100);
  const beforePpn = round2(offline + pph);
  const ppn = round2(offline * (Number(cfg.price_ppn) || 0) / 100);
  const inaproc = round2(beforePpn + ppn);
  return { dasar, akomodasi, jumlah, laba, offline, pph, beforePpn, ppn, inaproc };
}
module.exports = { calc, PPN_WAJIB_MIN };
