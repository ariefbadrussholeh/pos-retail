require('dotenv').config();
process.env.TZ = process.env.APP_TZ || 'Asia/Jakarta';

const url = process.env.DATABASE_URL || '';
const client = /^mysql/i.test(url) ? 'mysql' : 'pg';

module.exports = {
  port: +process.env.PORT || 3000,
  tz: process.env.TZ,
  dbUrl: url,
  dbClient: client,
  dbSsl: (process.env.DB_SSL || 'auto').toLowerCase(),
  poolMax: +process.env.DB_POOL_MAX || 10,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  admin: {
    user: process.env.ADMIN_USER || 'owner',
    password: process.env.ADMIN_PASSWORD || 'owner123',
    name: process.env.ADMIN_NAME || 'Pemilik Toko',
  },
};
