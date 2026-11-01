const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cfg = require('./config');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

const master = require('./routes/master');
const purchasing = require('./routes/purchasing');
const inventory = require('./routes/inventory');
const reports = require('./routes/reports');
app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/categories', master.categories);
app.use('/api/suppliers', master.suppliers);
app.use('/api/customers', master.customers);
app.use('/api/users', master.users);
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', purchasing.purchases);
app.use('/api/receipts', purchasing.receipts);
app.use('/api/opnames', inventory.opnames);
app.use('/api/stock', inventory.stock);
app.use('/api/reports', reports);
app.use('/api/dashboard', reports.dashboard);
app.use('/api/docs', require('./routes/docs'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1h', etag: true, extensions: ['html'] }));

// Penanganan error: pesan ramah untuk pelanggaran constraint database
app.use((e, req, res, next) => {
  let status = e.status || 500; let msg = e.message;
  const code = e.code || e.errno;
  if (code === '23505' || code === 'ER_DUP_ENTRY' || code === 1062) { status = 409; msg = 'Data sudah ada (duplikat)'; }
  else if (code === '23503' || code === 'ER_ROW_IS_REFERENCED_2' || code === 1451) { status = 409; msg = 'Data masih dipakai oleh transaksi lain'; }
  else if (status === 500) { console.error(e); msg = 'Terjadi kesalahan pada server'; }
  if (res.headersSent) return next(e);
  res.status(status).json({ error: msg, details: e.details });
});

if (require.main === module) {
  if (cfg.jwtSecret === 'dev-secret-change-me') console.warn('PERINGATAN: JWT_SECRET belum diatur di .env');
  app.listen(cfg.port, () => console.log(`POS berjalan di http://localhost:${cfg.port}  (db: ${db.client}, tz: ${cfg.tz})`));
}
module.exports = app;
