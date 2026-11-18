// /api/reports — public search/browse, create & edit own reports, submit claims
const express = require('express');
const db = require('../db');
const { validate } = require('../validation');
const { requireAuth } = require('../middleware/auth');
const { photoUpload, checkPhoto } = require('../utils/photos');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');

const router = express.Router();
const PAGE_SIZE = 12;

// Columns that are safe to show to ANYONE. Note: no private_details, no reporter contact details.
const PUBLIC_COLUMNS = `
  r.id, r.type, r.title, r.description, r.event_date AS eventDate, r.location_detail AS locationDetail,
  r.status, r.returned_at AS returnedAt, r.created_at AS createdAt, r.updated_at AS updatedAt,
  c.id AS categoryId, c.name AS category, l.id AS locationId, l.name AS location,
  (p.report_id IS NOT NULL) AS hasPhoto`;

const FROM = `
  FROM reports r
  JOIN categories c ON c.id = r.category_id
  JOIN locations  l ON l.id = r.location_id
  LEFT JOIN report_photos p ON p.report_id = r.id`;

const toPublic = (row) => ({ ...row, hasPhoto: Boolean(row.hasPhoto) });

// ---------------------------------------------------------------------------
// Lookups for forms and filters
router.get('/meta', async (_req, res) => {
  const [categories, locations] = await Promise.all([
    db.query('SELECT id, name FROM categories ORDER BY name'),
    db.query('SELECT id, name FROM locations ORDER BY name'),
  ]);
  res.json({ categories, locations });
});

// ---------------------------------------------------------------------------
// Public search & browse
router.get('/', async (req, res) => {
  const { q, type, categoryId, locationId, dateFrom, dateTo, status } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const where = ["r.status <> 'removed'"];
  const params = [];

  if (q && String(q).trim()) {
    const term = `%${String(q).trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(r.title LIKE ? OR r.description LIKE ? OR r.location_detail LIKE ?)');
    params.push(term, term, term);
  }
  if (type === 'lost' || type === 'found') { where.push('r.type = ?'); params.push(type); }
  if (Number(categoryId) > 0) { where.push('r.category_id = ?'); params.push(Number(categoryId)); }
  if (Number(locationId) > 0) { where.push('r.location_id = ?'); params.push(Number(locationId)); }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom && dateRe.test(dateFrom)) { where.push('r.event_date >= ?'); params.push(dateFrom); }
  if (dateTo && dateRe.test(dateTo)) { where.push('r.event_date <= ?'); params.push(dateTo); }
  if (status === 'open') where.push("r.status IN ('open','awaiting_collection')");
  else if (status === 'returned') where.push("r.status IN ('returned','closed')");

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM reports r ${whereSql}`, params);
  const rows = await db.query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM} ${whereSql}
     ORDER BY (r.status IN ('open','awaiting_collection')) DESC, r.event_date DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

  res.json({ items: rows.map(toPublic), page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) });
});

// ---------------------------------------------------------------------------
// Single report. Private details are added ONLY for the reporter or an admin.
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.query(`SELECT ${PUBLIC_COLUMNS}, r.user_id, r.private_details ${FROM} WHERE r.id = ?`, [id]);
  const isOwner = Boolean(req.user && row && req.user.id === row.user_id);
  const isAdmin = req.user?.role === 'admin';
  if (!row || (row.status === 'removed' && !isOwner && !isAdmin)) throw notFound('This report does not exist or has been removed.');

  const { user_id: ownerId, private_details: privateDetails, ...pub } = row;
  const report = toPublic(pub);
  report.isOwner = isOwner;
  if (isOwner || isAdmin) report.privateDetails = privateDetails;

  // What the current viewer may do — the backend re-checks all of these on submit.
  let myClaim = null;
  if (req.user) {
    [myClaim] = await db.query(
      'SELECT id, status, created_at AS createdAt FROM claims WHERE report_id = ? AND claimant_id = ?',
      [id, req.user.id]);
  }
  report.myClaim = myClaim || null;
  report.canClaim = Boolean(req.user && !isAdmin && !isOwner && !myClaim
    && report.type === 'found' && report.status === 'open');
  res.json({ report, ownerId: isAdmin ? ownerId : undefined });
});

// Photo (public for visible reports). Served from the DB so it survives restarts.
router.get('/:id/photo', async (req, res) => {
  const [row] = await db.query(
    `SELECT p.mime_type, p.data, r.status, r.user_id FROM report_photos p
       JOIN reports r ON r.id = p.report_id WHERE p.report_id = ?`, [Number(req.params.id)]);
  const privileged = req.user && (req.user.role === 'admin' || req.user.id === row?.user_id);
  if (!row || (row.status === 'removed' && !privileged)) throw notFound('Photo not found.');
  res.set('Content-Type', row.mime_type);
  res.set('Cache-Control', 'private, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(row.data);
});

// ---------------------------------------------------------------------------
// Create a report (any logged-in student or admin)
router.post('/', requireAuth, photoUpload, async (req, res) => {
  const data = validate('report', req.body);
  const photo = checkPhoto(req.file);
  await assertLookupsExist(data);
  const privateDetails = data.type === 'found' ? data.privateDetails : null;

  const id = await db.transaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO reports (user_id, type, title, category_id, description, private_details,
                            event_date, location_id, location_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, data.type, data.title, data.categoryId, data.description, privateDetails,
        data.eventDate, data.locationId, data.locationDetail]);
    if (photo) {
      await tx.query('INSERT INTO report_photos (report_id, mime_type, size_bytes, data) VALUES (?, ?, ?, ?)',
        [r.insertId, photo.mime, photo.size, photo.data]);
    }
    return r.insertId;
  });
  res.status(201).json({ message: 'Your report has been published.', id });
});

// ---------------------------------------------------------------------------
// Edit own report (only while it is still open)
router.put('/:id', requireAuth, photoUpload, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.query('SELECT id, user_id, type, status FROM reports WHERE id = ?', [id]);
  if (!existing) throw notFound('This report does not exist.');
  if (existing.user_id !== req.user.id) throw forbidden('You can only edit reports that you created.');
  if (existing.status !== 'open') throw conflict('This report can no longer be edited because it is not open.');

  const data = validate('report', req.body);
  if (data.type !== existing.type) {
    throw badRequest('The report type cannot be changed after it is created.', { fields: { type: 'Create a new report instead.' } });
  }
  const photo = checkPhoto(req.file);
  await assertLookupsExist(data);

  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE reports SET title = ?, category_id = ?, description = ?, private_details = ?,
              event_date = ?, location_id = ?, location_detail = ? WHERE id = ? AND user_id = ?`,
      [data.title, data.categoryId, data.description, existing.type === 'found' ? data.privateDetails : null,
        data.eventDate, data.locationId, data.locationDetail, id, req.user.id]);
    if (photo) {
      await tx.query(
        `REPLACE INTO report_photos (report_id, mime_type, size_bytes, data) VALUES (?, ?, ?, ?)`,
        [id, photo.mime, photo.size, photo.data]);
    } else if (req.body.removePhoto === 'true') {
      await tx.query('DELETE FROM report_photos WHERE report_id = ?', [id]);
    }
  });
  res.json({ message: 'Your report has been updated.', id });
});

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

// ---------------------------------------------------------------------------
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

    const ins = await tx.query('INSERT INTO claims (report_id, claimant_id, evidence) VALUES (?, ?, ?)',
      [reportId, req.user.id, evidence]);
    return ins.insertId;
  });
  res.status(201).json({ message: 'Your claim has been submitted privately. The administrator will review it.', id: claimId });
});

async function assertLookupsExist({ categoryId, locationId }) {
  const [[c], [l]] = await Promise.all([
    db.query('SELECT id FROM categories WHERE id = ?', [categoryId]),
    db.query('SELECT id FROM locations WHERE id = ?', [locationId]),
  ]);
  const fields = {};
  if (!c) fields.categoryId = 'Choose a category from the list.';
  if (!l) fields.locationId = 'Choose a campus location from the list.';
  if (Object.keys(fields).length) throw badRequest('Some fields need attention. Please correct them and try again.', { fields });
}

module.exports = router;
