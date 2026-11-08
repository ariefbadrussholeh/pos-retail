// Menyamakan faktur lama (sebelum v1.8) dengan aturan baru: total = subtotal + PPN, PPH hanya untuk laporan.
// Hitung ulang dari baris barang: subtotal, PPN (dibulatkan ke atas), total, dan PPH laporan (INAPROC saja).
// Pembayaran yang sudah masuk TIDAK diubah. Faktur yang total barunya lebih kecil dari yang sudah dibayar dilewati dan dilaporkan.
//
// Pakai:
//   npm run fix:tax                 -> hanya menampilkan apa yang akan berubah (tidak menyimpan)
//   npm run fix:tax -- --yes        -> menyimpan perubahan
//   npm run fix:tax -- --yes --pay=UP   -> sekaligus mengisi UP/LS (UP atau LS) pada faktur INAPROC yang belum punya
// Tanpa --pay, faktur INAPROC lama tanpa UP/LS bernilai PPH 0 di laporan sampai dibuka lewat Ubah dan dipilih UP/LS.
const db = require('../src/db');
const { ensureSchema } = require('../src/db/schema');
const pph = require('../src/services/pph');

const yes = process.argv.includes('--yes');
const payArg = (process.argv.find((a) => a.startsWith('--pay=')) || '').slice(6).toUpperCase();
if (payArg && !pph.PAY_TYPES.includes(payArg)) { console.error('--pay harus UP atau LS'); process.exit(1); }

(async () => {
  await ensureSchema();
  const sales = await db.query("SELECT * FROM sales WHERE kind <> 'POS' ORDER BY id");
  let changed = 0; let skipped = 0;
  for (const s of sales) {
    const items = await db.query('SELECT total, ppn_on FROM sale_items WHERE sale_id = ?', [s.id]);
    const lines = items.map((i) => ({ total: +i.total, ppn_on: i.ppn_on !== 0 }));
    const x = pph.calcTax(lines, s.tax_mode || 'NONE', +s.tax_rate || 11);
    const pay = s.kind === 'INAPROC' ? (s.pay_type || payArg || null) : null;
    const hp = pph.calc(s.kind, pay, x.dpp);
    const same = +s.subtotal === x.subtotal && +s.tax === x.tax && +s.total === x.total && +s.pph === hp.pph && (s.pay_type || null) === pay && (!s.pph_mode || s.pph_mode === 'NONE');
    if (same) continue;
    if (s.status === 'DONE' && x.total < +s.paid) { skipped++; console.log(`DILEWATI ${s.sale_no}: total baru ${x.total} < sudah dibayar ${s.paid} (ubah manual)`); continue; }
    console.log(`${s.sale_no}  subtotal ${s.subtotal}->${x.subtotal}  PPN ${s.tax}->${x.tax}  total ${s.total}->${x.total}  PPH ${s.pph}->${hp.pph}${pay ? ' (' + pay + ')' : ''}`);
    changed++;
    if (!yes) continue;
    let method = s.method;
    if (s.status === 'DONE') {
      if (+s.paid >= x.total && x.total > 0) {
        if (method === 'KREDIT') { const lp = await db.one("SELECT method FROM payments WHERE ref_type = 'SALE' AND ref_id = ? ORDER BY id DESC LIMIT 1", [s.id]); method = lp ? lp.method : 'TRANSFER'; }
      } else method = 'KREDIT';
    }
    await db.exec('UPDATE sales SET subtotal = ?, tax = ?, total = ?, pph_mode = ?, pph_rate = ?, pph = ?, pay_type = ?, method = ? WHERE id = ?',
      [x.subtotal, x.tax, x.total, 'NONE', hp.rate, hp.pph, pay, method, s.id]);
  }
  console.log(`${changed} faktur ${yes ? 'diperbarui' : 'akan berubah (jalankan dengan --yes untuk menyimpan)'}${skipped ? `, ${skipped} dilewati` : ''}.`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
