// /api/images/:key — serves report images with an access check on every request.
// Public images of visible reports: anyone. Private images, or any image of a removed report: owner and admins.
// Everyone else gets the same 404 as for a key that doesn't exist.
const express = require('express');
const { readImage } = require('../services/imageStore');
const { notFound } = require('../utils/errors');

const router = express.Router();

router.get('/:key', async (req, res) => {
  const img = await readImage(req.params.key);
  const privileged = Boolean(req.user && img && (req.user.role === 'admin' || req.user.id === img.ownerId));
  const visible = img && (privileged || (img.visibility === 'public' && img.reportStatus !== 'removed'));
  if (!visible) throw notFound('Image not found.');
  res.set('Content-Type', img.mime);
  // Private images must not be stored by shared caches; public ones are still per-session (removal is immediate).
  res.set('Cache-Control', img.visibility === 'private' ? 'private, no-store' : 'private, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', 'inline');
  res.send(img.data);
});

module.exports = router;
