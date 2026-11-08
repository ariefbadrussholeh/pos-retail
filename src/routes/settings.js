const router = require('express').Router();
const settings = require('../services/settings');
const stores = require('../services/stores');
const { auth, owner } = require('../middleware/auth');
const { wrap } = require('../services/util');

// Publik (halaman login & logo): toko yang ditunjuk ?store=, atau toko aktif pertama
async function publicStore(req) {
  const list = await stores.all();
  const want = +req.query.store || 0;
  const st = (want && list.find((s) => s.id === want)) || list.find((s) => s.active) || list[0];
  return st ? st.id : 1;
}
router.get('/public', wrap(async (req, res) => res.json(settings.publicInfo(await settings.get(await publicStore(req))))));
router.get('/logo', wrap(async (req, res) => {
  const s = await settings.get(await publicStore(req));
  const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(s.logo || '');
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]).set('Cache-Control', 'no-cache').send(Buffer.from(m[2], 'base64'));
}));
router.get('/templates', auth, (req, res) => res.json(Object.entries(require('../templates')).map(([id, t]) => ({ id, label: t.label }))));
// + aturan toko (services/store-rules.js): jenis penjualan faktur yang tersedia
const withRules = async (req) => ({ ...(await settings.get(req.sid)), faktur_types: require('../services/store-rules').fakturTypes(req.store.code) });
router.get('/', auth, wrap(async (req, res) => res.json(await withRules(req))));
router.put('/', auth, owner, wrap(async (req, res) => { stores.clear(); await settings.save(req.sid, req.body || {}); res.json(await withRules(req)); }));
module.exports = router;
