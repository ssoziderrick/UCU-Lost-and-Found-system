// /api/reports — browse and search, create and edit your own reports, manage their images, claim found items.
// Contract: docs/v2/phase-3-reports-contract.md
const express = require('express');
const db = require('../db');
const { validate } = require('../validation');
const { requireAuth } = require('../middleware/auth');
const { photosUpload, prepareImage, MAX_FILES } = require('../utils/images');
const images = require('../services/imageStore');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');

const router = express.Router();
const PAGE_SIZE = 12;

/** FD-000042 for report 42. Derived, never stored. */
const refCode = (id) => `FD-${String(id).padStart(6, '0')}`;

// Columns that are safe to show to ANYONE. Confidential details live in report_confidential and are
// joined only for the owner or an administrator; private images are never part of this list.
const PUBLIC_COLUMNS = `
  r.id, r.type, r.title, r.description, r.event_date AS eventDate, r.location_detail AS locationDetail,
  r.status, r.custody, r.returned_at AS returnedAt, r.created_at AS createdAt, r.updated_at AS updatedAt,
  c.id AS categoryId, c.name AS category, cg.name AS categoryGroup,
  l.id AS locationId, l.name AS location, z.id AS zoneId, z.name AS zone,
  (SELECT ri.storage_key FROM report_images ri WHERE ri.report_id = r.id AND ri.is_cover = 1) AS coverKey`;

const FROM = `
  FROM reports r
  JOIN categories c ON c.id = r.category_id
  LEFT JOIN categories cg ON cg.id = c.parent_id
  JOIN campus_locations l ON l.id = r.location_id
  LEFT JOIN campus_zones z ON z.id = l.zone_id`;

const toPublic = ({ coverKey, ...row }) => ({
  ...row,
  refCode: refCode(row.id),
  coverImage: coverKey ? { url: images.imageUrl(coverKey) } : null,
  hasPhoto: Boolean(coverKey),
});

// ---------------------------------------------------------------------------------------------
// Lookups for forms and filters (active entries only)
router.get('/meta', async (_req, res) => {
  const [cats, locations, zones] = await Promise.all([
    db.query(
      `SELECT c.id, c.name, c.parent_id AS parentId, g.name AS \`group\`,
              EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id AND k.is_active = 1) AS isGroup
         FROM categories c LEFT JOIN categories g ON g.id = c.parent_id
        WHERE c.is_active = 1 AND (g.id IS NULL OR g.is_active = 1)
        ORDER BY c.sort_order, c.name`),
    db.query(
      `SELECT l.id, l.name, l.zone_id AS zoneId, z.name AS zone, l.kind, l.description
         FROM campus_locations l LEFT JOIN campus_zones z ON z.id = l.zone_id
        WHERE l.is_active = 1 ORDER BY z.sort_order, l.sort_order, l.name`),
    db.query('SELECT id, name FROM campus_zones ORDER BY sort_order, name'),
  ]);
  res.json({
    categories: cats.filter((c) => !c.isGroup).map(({ isGroup, ...c }) => c), // eslint-disable-line no-unused-vars
    categoryGroups: cats.filter((c) => c.isGroup).map(({ id, name }) => ({ id, name })),
    locations,
    zones: zones.filter((z) => locations.some((l) => l.zoneId === z.id)),
  });
});

// ---------------------------------------------------------------------------------------------
// Public search & browse
router.get('/', async (req, res) => {
  const { q, type, categoryId, locationId, zoneId, dateFrom, dateTo, status, sort } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const where = ["r.status <> 'removed'"];
  const params = [];

  if (q && String(q).trim()) {
    const text = String(q).trim().slice(0, 100);
    const term = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const ref = text.match(/^(?:FD-?)?0*(\d{1,9})$/i);
    where.push(`(r.title LIKE ? OR r.description LIKE ? OR r.location_detail LIKE ? OR l.name LIKE ?${ref ? ' OR r.id = ?' : ''})`);
    params.push(term, term, term, term, ...(ref ? [Number(ref[1])] : []));
  }
  if (type === 'lost' || type === 'found') { where.push('r.type = ?'); params.push(type); }
  if (Number(categoryId) > 0) { where.push('(c.id = ? OR c.parent_id = ?)'); params.push(Number(categoryId), Number(categoryId)); }
  if (Number(locationId) > 0) { where.push('r.location_id = ?'); params.push(Number(locationId)); }
  if (Number(zoneId) > 0) { where.push('l.zone_id = ?'); params.push(Number(zoneId)); }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom && dateRe.test(dateFrom)) { where.push('r.event_date >= ?'); params.push(dateFrom); }
  if (dateTo && dateRe.test(dateTo)) { where.push('r.event_date <= ?'); params.push(dateTo); }
  if (status === 'open') where.push("r.status IN ('open','awaiting_collection')");
  else if (status === 'returned') where.push("r.status IN ('returned','closed')");

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const order = sort === 'oldest'
    ? 'r.event_date ASC, r.id ASC'
    : "(r.status IN ('open','awaiting_collection')) DESC, r.event_date DESC, r.id DESC";
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total ${FROM} ${whereSql}`, params);
  const rows = await db.query(`SELECT ${PUBLIC_COLUMNS} ${FROM} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

  res.json({ items: rows.map(toPublic), page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
});

// ---------------------------------------------------------------------------------------------
// Single report. Confidential details, the custody note and private images: owner and admins only.
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, r.user_id AS ownerId, r.custody_note AS custodyNote, rc.identifying_details AS identifyingDetails
       ${FROM} LEFT JOIN report_confidential rc ON rc.report_id = r.id WHERE r.id = ?`, [id]);
  const isOwner = Boolean(req.user && row && req.user.id === row.ownerId);
  const isAdmin = req.user?.role === 'admin';
  if (!row || (row.status === 'removed' && !isOwner && !isAdmin)) throw notFound('This report does not exist or has been removed.');

  const { ownerId, custodyNote, identifyingDetails, ...pub } = row;
  const report = toPublic(pub);
  report.isOwner = isOwner;
  report.images = await images.listImages(id, { includePrivate: isOwner || isAdmin });
  if (isOwner || isAdmin) Object.assign(report, { identifyingDetails, custodyNote });

  let myClaim = null;
  if (req.user) {
    [myClaim] = await db.query('SELECT id, status, created_at AS createdAt FROM claims WHERE report_id = ? AND claimant_id = ?', [id, req.user.id]);
  }
  report.myClaim = myClaim || null;
  report.canClaim = Boolean(req.user && !isAdmin && !isOwner && !myClaim && report.type === 'found' && report.status === 'open');
  report.canEdit = isOwner && report.status === 'open';
  res.json({ report, ownerId: isAdmin ? ownerId : undefined });
});

// ---------------------------------------------------------------------------------------------
async function assertLookupsUsable({ categoryId, locationId }) {
  const [[c], [l]] = await Promise.all([
    db.query(
      `SELECT c.is_active AS active, EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id) AS isGroup
         FROM categories c WHERE c.id = ?`, [categoryId]),
    db.query('SELECT is_active AS active FROM campus_locations WHERE id = ?', [locationId]),
  ]);
  const fields = {};
  if (!c || !c.active) fields.categoryId = 'Choose a category from the list.';
  else if (c.isGroup) fields.categoryId = 'Choose a specific category, not a group.';
  if (!l || !l.active) fields.locationId = 'Choose a campus location from the list.';
  if (Object.keys(fields).length) throw badRequest('Some fields need attention. Please correct them and try again.', { fields });
}

/** Lost reports never carry confidential details or custody; found reports may. */
const foundOnly = (data) => (data.type === 'found'
  ? { identifyingDetails: data.identifyingDetails, custody: data.custody, custodyNote: data.custodyNote }
  : { identifyingDetails: null, custody: null, custodyNote: null });

async function saveConfidential(tx, reportId, text) {
  if (text) {
    await tx.query(
      `INSERT INTO report_confidential (report_id, identifying_details) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE identifying_details = VALUES(identifying_details)`, [reportId, text]);
  } else {
    await tx.query('DELETE FROM report_confidential WHERE report_id = ?', [reportId]);
  }
}

// Create a report, with up to 4 photos (multipart). Any signed-in user.
router.post('/', requireAuth, photosUpload, async (req, res) => {
  const data = validate('report', req.body);
  await assertLookupsUsable(data);
  const prepared = (req.files || []).map(prepareImage); // validate every image before writing anything
  const vis = images.visibilities(req.body.photoVisibility, prepared.length);
  const extra = foundOnly(data);

  const id = await db.transaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO reports (user_id, type, title, category_id, description, event_date, location_id, location_detail, custody, custody_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, data.type, data.title, data.categoryId, data.description, data.eventDate, data.locationId,
        data.locationDetail, extra.custody, extra.custodyNote]);
    await saveConfidential(tx, r.insertId, extra.identifyingDetails);
    if (prepared.length) await images.addImages(tx, { reportId: r.insertId, userId: req.user.id, images: prepared, visibility: vis });
    return r.insertId;
  });
  res.status(201).json({ message: 'Your report has been published.', id, refCode: refCode(id) });
});

/** Loads a report the signed-in user owns and can still change. */
async function ownOpenReport(tx, id, userId, { lock = false } = {}) {
  const [r] = await tx.query(`SELECT id, user_id, type, status FROM reports WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [Number(id)]);
  if (!r) throw notFound('This report does not exist.');
  if (r.user_id !== userId) throw forbidden('You can only change reports that you created.');
  if (r.status !== 'open') throw conflict('This report can no longer be changed because it is not open.');
  return r;
}

// Edit the text of your own open report (JSON). Images have their own endpoints below.
router.put('/:id', requireAuth, async (req, res) => {
  const data = validate('report', req.body);
  await assertLookupsUsable(data);
  const extra = foundOnly(data);
  await db.transaction(async (tx) => {
    const existing = await ownOpenReport(tx, req.params.id, req.user.id, { lock: true });
    if (data.type !== existing.type) {
      throw badRequest('The report type cannot be changed after it is created.', { fields: { type: 'Create a new report instead.' } });
    }
    await tx.query(
      `UPDATE reports SET title = ?, category_id = ?, description = ?, event_date = ?, location_id = ?, location_detail = ?,
              custody = ?, custody_note = ? WHERE id = ?`,
      [data.title, data.categoryId, data.description, data.eventDate, data.locationId, data.locationDetail,
        extra.custody, extra.custodyNote, existing.id]);
    await saveConfidential(tx, existing.id, extra.identifyingDetails);
  });
  res.json({ message: 'Your report has been updated.', id: Number(req.params.id) });
});

// ---------------------------------------------------------------------------------------------
// Images on your own open report
router.post('/:id/images', requireAuth, photosUpload, async (req, res) => {
  const prepared = (req.files || []).map(prepareImage);
  if (!prepared.length) throw badRequest('Choose at least one photo.', { fields: { photos: 'Choose at least one photo.' } });
  const vis = images.visibilities(req.body.photoVisibility, prepared.length);
  await db.transaction(async (tx) => {
    const r = await ownOpenReport(tx, req.params.id, req.user.id, { lock: true });
    const existing = await images.countImages(tx, r.id);
    if (existing + prepared.length > MAX_FILES) {
      const msg = `A report can have at most ${MAX_FILES} photos. This one has ${existing}; remove some first.`;
      throw badRequest(msg, { fields: { photos: msg } });
    }
    await images.addImages(tx, { reportId: r.id, userId: req.user.id, images: prepared, visibility: vis });
  });
  res.status(201).json({ message: prepared.length === 1 ? 'Photo added.' : `${prepared.length} photos added.`,
    images: await images.listImages(Number(req.params.id), { includePrivate: true }) });
});

async function ownImage(tx, reportId, imageId) {
  const [img] = await tx.query('SELECT id, visibility, is_cover FROM report_images WHERE id = ? AND report_id = ? FOR UPDATE',
    [Number(imageId), Number(reportId)]);
  if (!img) throw notFound('Photo not found.');
  return img;
}

router.patch('/:id/images/:imageId', requireAuth, async (req, res) => {
  const { visibility, isCover } = validate('imagePatch', req.body);
  await db.transaction(async (tx) => {
    const r = await ownOpenReport(tx, req.params.id, req.user.id, { lock: true });
    const img = await ownImage(tx, r.id, req.params.imageId);
    const nextVisibility = visibility || img.visibility;
    if (isCover && nextVisibility === 'private') throw badRequest('A private photo can’t be the cover. Make it public first.');
    if (visibility === 'private' && img.is_cover) {
      await tx.query('UPDATE report_images SET is_cover = 0, visibility = ? WHERE id = ?', [visibility, img.id]);
    } else if (visibility) {
      await tx.query('UPDATE report_images SET visibility = ? WHERE id = ?', [visibility, img.id]);
    }
    if (isCover) {
      await tx.query('UPDATE report_images SET is_cover = 0 WHERE report_id = ? AND is_cover = 1', [r.id]);
      await tx.query('UPDATE report_images SET is_cover = 1 WHERE id = ?', [img.id]);
    }
    await images.ensureCover(tx, r.id);
  });
  res.json({ message: 'Photo updated.', images: await images.listImages(Number(req.params.id), { includePrivate: true }) });
});

router.delete('/:id/images/:imageId', requireAuth, async (req, res) => {
  await db.transaction(async (tx) => {
    const r = await ownOpenReport(tx, req.params.id, req.user.id, { lock: true });
    const img = await ownImage(tx, r.id, req.params.imageId);
    await tx.query('DELETE FROM report_images WHERE id = ?', [img.id]); // image_blobs row goes with it (FK cascade)
    await images.ensureCover(tx, r.id);
  });
  res.json({ message: 'Photo removed.', images: await images.listImages(Number(req.params.id), { includePrivate: true }) });
});

// ---------------------------------------------------------------------------------------------
// Owner closes their own LOST report (e.g. they found it themselves)
router.post('/:id/close', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db.query('SELECT user_id, type, status FROM reports WHERE id = ?', [id]);
  if (!r) throw notFound('This report does not exist.');
  if (r.user_id !== req.user.id) throw forbidden('You can only close reports that you created.');
  if (r.type !== 'lost') throw badRequest('Found-item reports are closed by the administrator when the item is returned.');
  if (r.status !== 'open') throw conflict('This report is already closed.');
  await db.query("UPDATE reports SET status = 'closed', status_note = 'Closed by reporter: item recovered' WHERE id = ?", [id]);
  res.json({ message: 'Report marked as resolved. Glad you found it!' });
});

// ---------------------------------------------------------------------------------------------
// Submit an ownership claim on a FOUND item
router.post('/:id/claims', requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  if (req.user.role === 'admin') throw forbidden('Administrators review claims; they cannot submit them.');
  const { evidence } = validate('claim', req.body);

  const claimId = await db.transaction(async (tx) => {
    // Lock the report row so a concurrent approval/return cannot slip in between checks.
    const [r] = await tx.query('SELECT id, user_id, type, status FROM reports WHERE id = ? FOR UPDATE', [reportId]);
    if (!r || r.status === 'removed') throw notFound('This report does not exist or has been removed.');
    if (r.type !== 'found') throw badRequest('Claims can only be made on found items. This is a lost-item report.');
    if (r.user_id === req.user.id) throw forbidden('You cannot claim an item that you reported as found.');
    if (r.status === 'returned') throw conflict('This item has already been returned to its owner, so it can no longer be claimed.');
    if (r.status !== 'open') throw conflict('A claim for this item has already been approved, so new claims are not being accepted.');

    const [dup] = await tx.query('SELECT id FROM claims WHERE report_id = ? AND claimant_id = ?', [reportId, req.user.id]);
    if (dup) throw conflict('You have already submitted a claim for this item. Check "My claims" for its status.');

    const ins = await tx.query('INSERT INTO claims (report_id, claimant_id, evidence) VALUES (?, ?, ?)', [reportId, req.user.id, evidence]);
    return ins.insertId;
  });
  res.status(201).json({ message: 'Your claim has been submitted privately. The administrator will review it.', id: claimId });
});

module.exports = router;
module.exports.refCode = refCode;
