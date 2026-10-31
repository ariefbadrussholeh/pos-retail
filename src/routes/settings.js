const router = require('express').Router();
const settings = require('../services/settings');
const { auth, owner } = require('../middleware/auth');
const { wrap } = require('../services/util');

// Publik: nama + logo untuk halaman login
router.get('/public', wrap(async (req, res) => res.json(settings.publicInfo(await settings.get()))));
router.get('/logo', wrap(async (req, res) => {
  const s = await settings.get();
  const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(s.logo || '');
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]).set('Cache-Control', 'no-cache').send(Buffer.from(m[2], 'base64'));
}));
router.get('/', auth, wrap(async (req, res) => res.json(await settings.get())));
router.put('/', auth, owner, wrap(async (req, res) => res.json(await settings.save(req.body || {}))));
module.exports = router;
