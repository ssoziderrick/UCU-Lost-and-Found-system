// Report images: metadata in report_images, bytes in image_blobs, addressed only by a random 64-hex key.
// Kept behind this module so the bytes can move to object storage later without touching the routes.
const crypto = require('crypto');
const db = require('../db');

const imageUrl = (key) => `/api/images/${key}`;

/** Normalises the multipart "photoVisibility" field (string, array or missing) to one value per file. */
function visibilities(raw, count) {
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return Array.from({ length: count }, (_, i) => (list[i] === 'private' ? 'private' : 'public'));
}

/** Makes sure the report has a cover if it has any public image: the first public one by order. */
async function ensureCover(tx, reportId) {
  const [cover] = await tx.query('SELECT id FROM report_images WHERE report_id = ? AND is_cover = 1', [reportId]);
  if (cover) return;
  const [first] = await tx.query(
    "SELECT id FROM report_images WHERE report_id = ? AND visibility = 'public' ORDER BY sort_order, id LIMIT 1", [reportId]);
  if (first) await tx.query('UPDATE report_images SET is_cover = 1 WHERE id = ?', [first.id]);
}

/** Stores prepared images (see utils/images.prepareImage) for a report, inside the caller's transaction. */
async function addImages(tx, { reportId, userId, images, visibility }) {
  const [{ maxOrder }] = await tx.query('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM report_images WHERE report_id = ?', [reportId]);
  let order = Number(maxOrder);
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const key = crypto.randomBytes(32).toString('hex');
    order += 1;
    await tx.query(
      `INSERT INTO report_images (report_id, storage_key, mime_type, size_bytes, width, height, visibility, sort_order, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportId, key, img.mime, img.size, img.width, img.height, visibility[i], order, userId]);
    await tx.query('INSERT INTO image_blobs (storage_key, data) VALUES (?, ?)', [key, img.data]);
  }
  await ensureCover(tx, reportId);
}

/** Images for a report; private ones only when includePrivate is true. */
async function listImages(reportId, { includePrivate }) {
  const rows = await db.query(
    `SELECT id, storage_key AS storageKey, visibility, is_cover AS isCover, width, height
       FROM report_images WHERE report_id = ? ${includePrivate ? '' : "AND visibility = 'public'"}
      ORDER BY is_cover DESC, sort_order, id`, [reportId]);
  return rows.map(({ storageKey, ...r }) => ({ ...r, isCover: Boolean(r.isCover), url: imageUrl(storageKey) }));
}

async function countImages(tx, reportId) {
  const [{ n }] = await tx.query('SELECT COUNT(*) AS n FROM report_images WHERE report_id = ?', [reportId]);
  return Number(n);
}

/** Image bytes plus what's needed for the access check. */
async function readImage(key) {
  if (!/^[0-9a-f]{64}$/.test(String(key))) return null;
  const [row] = await db.query(
    `SELECT i.mime_type AS mime, i.visibility, r.status AS reportStatus, r.user_id AS ownerId, b.data
       FROM report_images i JOIN image_blobs b ON b.storage_key = i.storage_key JOIN reports r ON r.id = i.report_id
      WHERE i.storage_key = ?`, [key]);
  return row || null;
}

module.exports = { imageUrl, visibilities, ensureCover, addImages, listImages, countImages, readImage };
