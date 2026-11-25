// /api/me — the logged-in student's own reports and claims
// /api/claims/:id — a single claim, visible ONLY to its claimant or an administrator
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notFound, badRequest } = require('../utils/errors');
const { validate } = require('../validation');
const { refCode } = require('./reports');
const { imageUrl } = require('../services/imageStore');

const me = express.Router();
const claims = express.Router();

me.use(requireAuth);

me.get('/reports', async (req, res) => {
  const rows = await db.query(
    `SELECT r.id, r.type, r.title, r.status, r.event_date AS eventDate, r.created_at AS createdAt,
            rc.identifying_details AS identifyingDetails, r.returned_at AS returnedAt, r.custody,
            c.name AS category, l.name AS location,
            (SELECT ri.storage_key FROM report_images ri WHERE ri.report_id = r.id AND ri.is_cover = 1) AS coverKey,
            (SELECT COUNT(*) FROM report_images ri WHERE ri.report_id = r.id) AS imageCount,
            (SELECT COUNT(*) FROM claims cl WHERE cl.report_id = r.id AND cl.status = 'pending') AS pendingClaims
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       JOIN campus_locations l ON l.id = r.location_id
       LEFT JOIN report_confidential rc ON rc.report_id = r.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC, r.id DESC`, [req.user.id]);
  res.json({ items: rows.map(({ coverKey, ...r }) => ({ ...r, refCode: refCode(r.id), coverImage: coverKey ? { url: imageUrl(coverKey) } : null })) });
});

me.get('/claims', async (req, res) => {
  const rows = await db.query(
    `SELECT cl.id, cl.status, cl.created_at AS createdAt, cl.reviewed_at AS reviewedAt,
            cl.admin_reason AS adminReason, cl.collection_instructions AS collectionInstructions,
            r.id AS reportId, r.title AS reportTitle, r.status AS reportStatus
       FROM claims cl JOIN reports r ON r.id = cl.report_id
      WHERE cl.claimant_id = ?
      ORDER BY cl.created_at DESC, cl.id DESC`, [req.user.id]);
  res.json({ items: rows });
});

// ---------------------------------------------------------------------------------------------
// Notifications (students and administrators)
const NOTE_PAGE = 20;
me.get('/notifications', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const unreadOnly = req.query.unread === '1';
  const where = `WHERE user_id = ?${unreadOnly ? ' AND read_at IS NULL' : ''}`;
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, [req.user.id]);
  const items = await db.query(
    `SELECT id, type, title, body, link, read_at AS readAt, created_at AS createdAt FROM notifications ${where}
      ORDER BY id DESC LIMIT ? OFFSET ?`, [req.user.id, NOTE_PAGE, (page - 1) * NOTE_PAGE]);
  const [{ unread }] = await db.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  const [{ notify_email: notifyEmail }] = await db.query('SELECT notify_email FROM users WHERE id = ?', [req.user.id]);
  res.json({ items, page, pageSize: NOTE_PAGE, total, totalPages: Math.max(1, Math.ceil(total / NOTE_PAGE)), unread, notifyByEmail: Boolean(notifyEmail) });
});

me.get('/notifications/unread-count', async (req, res) => {
  const [{ count }] = await db.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ count });
});

me.post('/notifications/read', async (req, res) => {
  if (req.body?.all === true) {
    await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  } else {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => n > 0).slice(0, 200) : [];
    if (!ids.length) throw badRequest('Send { all: true } or a list of notification ids.');
    // user_id in the WHERE clause: you can only mark your own notifications.
    await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND id IN (?) AND read_at IS NULL', [req.user.id, ids]);
  }
  const [{ count }] = await db.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ unread: count });
});

me.patch('/preferences', async (req, res) => {
  const { notifyByEmail } = validate('preferences', req.body);
  await db.query('UPDATE users SET notify_email = ? WHERE id = ?', [notifyByEmail ? 1 : 0, req.user.id]);
  res.json({ message: notifyByEmail ? 'We’ll also email you about matches and claim decisions.' : 'Email notifications are off. You’ll still see them here.', notifyByEmail });
});

// ---------------------------------------------------------------------------------------------
// Potential matches for my lost reports. Only the found item's PUBLIC fields are returned.
me.get('/matches', async (req, res) => {
  const params = [req.user.id];
  let extra = '';
  if (Number(req.query.reportId) > 0) { extra = ' AND l.id = ?'; params.push(Number(req.query.reportId)); }
  const rows = await db.query(
    `SELECT m.id, m.score, m.breakdown, m.status, m.created_at AS createdAt,
            l.id AS lostId, l.title AS lostTitle,
            f.id AS foundId, f.title AS foundTitle, f.event_date AS foundDate, f.status AS foundStatus,
            fl.name AS foundLocation, fc.name AS foundCategory,
            (SELECT ri.storage_key FROM report_images ri WHERE ri.report_id = f.id AND ri.is_cover = 1) AS coverKey,
            (SELECT cl.id FROM claims cl WHERE cl.report_id = f.id AND cl.claimant_id = ?) AS myClaimId
       FROM item_matches m
       JOIN reports l ON l.id = m.lost_report_id
       JOIN reports f ON f.id = m.found_report_id
       JOIN campus_locations fl ON fl.id = f.location_id
       JOIN categories fc ON fc.id = f.category_id
      WHERE l.user_id = ? AND m.status IN ('suggested', 'claimed') AND l.status = 'open' AND f.status = 'open'${extra}
      ORDER BY m.score DESC, m.id DESC LIMIT 50`, [req.user.id, ...params]);
  res.json({ items: rows.map(({ breakdown, coverKey, ...m }) => {
    const b = typeof breakdown === 'string' ? JSON.parse(breakdown) : breakdown;
    return {
      ...m, score: Number(m.score), reasons: b.reasons, strength: Number(m.score) >= 0.7 ? 'strong' : 'possible',
      found: { id: m.foundId, refCode: refCode(m.foundId), title: m.foundTitle, eventDate: m.foundDate, location: m.foundLocation,
        category: m.foundCategory, coverImage: coverKey ? { url: imageUrl(coverKey) } : null },
    };
  }) });
});

me.post('/matches/:id/dismiss', async (req, res) => {
  const r = await db.query(
    `UPDATE item_matches m JOIN reports l ON l.id = m.lost_report_id
        SET m.status = 'dismissed', m.dismissed_at = NOW()
      WHERE m.id = ? AND l.user_id = ? AND m.status = 'suggested'`, [Number(req.params.id), req.user.id]);
  if (!r.affectedRows) throw notFound('That suggestion was not found.');
  res.json({ message: 'Hidden. We won’t suggest this item for that report again.' });
});

claims.get('/:id', requireAuth, async (req, res) => {
  const [row] = await db.query(
    `SELECT cl.id, cl.claimant_id AS claimantId, cl.evidence, cl.status, cl.created_at AS createdAt,
            cl.admin_reason AS adminReason, cl.collection_instructions AS collectionInstructions,
            cl.reviewed_at AS reviewedAt, cl.collected_at AS collectedAt,
            r.id AS reportId, r.title AS reportTitle, r.status AS reportStatus
       FROM claims cl JOIN reports r ON r.id = cl.report_id
      WHERE cl.id = ?`, [Number(req.params.id)]);
  // Return 404 (not 403) to other students so they cannot even confirm the claim exists.
  if (!row || (row.claimantId !== req.user.id && req.user.role !== 'admin')) {
    throw notFound('Claim not found.');
  }
  res.json({ claim: row });
});

module.exports = { me, claims };
