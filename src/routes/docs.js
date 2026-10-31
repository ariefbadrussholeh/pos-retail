const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { wrap, err } = require('../services/util');
const settings = require('../services/settings');
const pdf = require('../services/pdf');
const { loadSale } = require('./sales');
const { loadPurchase } = require('./purchasing');

const SIG = {
  sale: { invoice: ['Penerima', 'Hormat kami'], delivery: ['Penerima', 'Pengirim / Sopir', 'Hormat kami'] },
  purchase: { invoice: ['Dibuat oleh'], delivery: ['Penerima Barang', 'Pengirim / Sopir', 'Pemasok'] },
};
// Normalisasi penjualan / pembelian menjadi satu bentuk dokumen
function fromSale(s) {
  return {
    side: 'sale', no: s.sale_no, date: s.created_at.slice(0, 10), due_date: s.due_date,
    partyLabel: 'Kepada Yth.', party: { name: s.customer_name || 'Pelanggan Umum', address: s.customer_address, phone: s.customer_phone },
    items: s.items, subtotal: s.subtotal, discount: s.discount, tax: s.tax, total: s.total, paid: Math.min(s.paid, s.total),
    titles: { invoice: 'INVOICE' }, sig: SIG.sale,
    meta: [['No. Invoice', s.sale_no], ['Tanggal', null], ['Jatuh Tempo', null], ['Pembayaran', s.method], ['Kasir', s.cashier]],
    metaDelivery: [['No. Surat Jalan', 'SJ/' + s.sale_no], ['Tanggal', null], ['Ref. Invoice', s.sale_no]],
  };
}
function fromPurchase(p) {
  return {
    side: 'purchase', no: p.po_no, date: p.date, due_date: p.due_date,
    partyLabel: 'Pemasok', party: { name: p.supplier_name, address: p.supplier_address, phone: p.supplier_phone },
    items: p.items, subtotal: p.subtotal, discount: p.discount, tax: p.tax, total: p.total, paid: p.paid,
    titles: { invoice: 'INVOICE PEMBELIAN' }, sig: SIG.purchase,
    meta: [['No. Pembelian', p.po_no], ['Tanggal', null], ['Jatuh Tempo', null], ['Ref. Faktur', p.supplier_ref || '-'], ['Status', p.status]],
    metaDelivery: [['No. Surat Jalan', 'SJ/' + p.po_no], ['Tanggal', null], ['Ref. Pembelian', p.po_no], ['Ref. Faktur', p.supplier_ref || '-']],
  };
}
const fillDates = (d) => {
  const f = (m) => m.map(([k, v]) => [k, v === null ? (k === 'Jatuh Tempo' ? fmt(d.due_date) : fmt(d.date)) : v]);
  d.meta = f(d.meta); d.metaDelivery = f(d.metaDelivery);
};
const BUL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const fmt = (s) => { if (!s) return '-'; const [y, m, dd] = String(s).slice(0, 10).split('-'); return `${+dd} ${BUL[+m - 1]} ${y}`; };

// GET /api/docs/:kind/:type/:id   kind = invoice | delivery | payment-request ; type = sale | purchase
router.get('/:kind/:type/:id', auth, wrap(async (req, res) => {
  const { kind, type, id } = req.params;
  if (!pdf.KINDS[kind]) throw err(404, 'Jenis dokumen tidak dikenal');
  let d;
  if (type === 'sale') {
    const s = await loadSale(id);
    if (!s) throw err(404, 'Transaksi tidak ditemukan');
    if (req.user.role !== 'owner' && s.user_id !== req.user.id) throw err(403, 'Tidak punya akses');
    if (s.status === 'VOID') throw err(409, 'Transaksi sudah dibatalkan');
    d = fromSale(s);
  } else if (type === 'purchase') {
    if (req.user.role !== 'owner') throw err(403, 'Tidak punya akses');
    const p = await loadPurchase(id);
    if (!p) throw err(404, 'Pembelian tidak ditemukan');
    d = fromPurchase(p);
  } else throw err(404, 'Jenis transaksi tidak dikenal');
  if (kind === 'payment-request' && d.total - d.paid <= 0) throw err(409, 'Tagihan sudah lunas, tidak perlu permohonan pembayaran');
  fillDates(d);
  const [s, logo] = await Promise.all([settings.get(), settings.logoBuffer()]);
  const doc = pdf.render(kind, s, logo, d);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${kind}-${d.no}.pdf"`);
  doc.pipe(res);
}));
module.exports = router;
