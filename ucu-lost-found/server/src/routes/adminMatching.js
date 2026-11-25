// /api/admin — potential matches across all reports, and the matching settings. Mounted after requireAdmin.
const express = require('express');
const db = require('../db');
const { validate } = require('../validation');
const { requirePermission: can } = require('../middleware/auth');
const matching = require('../matching/service');
const { audit } = require('../services/audit');

const router = express.Router();
const PAGE = 25;

router.get('/matches', can('claims.review'), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const status = ['suggested', 'dismissed', 'claimed', 'expired'].includes(req.query.status) ? req.query.status : 'suggested';
  const minScore = Math.min(1, Math.max(0, Number(req.query.minScore) || 0));
  const where = 'WHERE m.status = ? AND m.score >= ?';
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM item_matches m ${where}`, [status, minScore]);
  const rows = await db.query(
    `SELECT m.id, m.score, m.breakdown, m.status, m.notified_at AS notifiedAt, m.created_at AS createdAt, m.updated_at AS updatedAt,
            l.id AS lostId, l.title AS lostTitle, l.event_date AS lostDate, ll.name AS lostLocation, lu.full_name AS lostOwner,
            f.id AS foundId, f.title AS foundTitle, f.event_date AS foundDate, fl.name AS foundLocation,
            (SELECT COUNT(*) FROM claims c WHERE c.report_id = f.id AND c.status = 'pending') AS pendingClaims
       FROM item_matches m
       JOIN reports l ON l.id = m.lost_report_id JOIN campus_locations ll ON ll.id = l.location_id JOIN users lu ON lu.id = l.user_id
       JOIN reports f ON f.id = m.found_report_id JOIN campus_locations fl ON fl.id = f.location_id
       ${where} ORDER BY m.score DESC, m.updated_at DESC LIMIT ? OFFSET ?`, [status, minScore, PAGE, (page - 1) * PAGE]);
  res.json({
    items: rows.map((r) => ({ ...r, score: Number(r.score), breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : r.breakdown })),
    page, pageSize: PAGE, total, totalPages: Math.max(1, Math.ceil(total / PAGE)),
  });
});

router.get('/settings/matching', can('claims.review'), async (_req, res) => {
  res.json({ settings: await matching.loadConfig() });
});

router.put('/settings/matching', can('settings.manage'), async (req, res) => {
  const data = validate('matchingSettings', req.body);
  const before = await matching.loadConfig();
  await db.query("UPDATE app_settings SET value = ?, updated_by = ? WHERE setting_key = 'matching'", [JSON.stringify(data), req.user.id]);
  matching.clearConfigCache();
  await audit(req, 'settings.matching_changed', { entityType: 'settings', entityId: 'matching', details: { before, after: data } });
  const result = await matching.sweep();
  res.json({ message: `Matching settings saved and ${result.lostReports} open lost reports re-scored.`, settings: data, result });
});

module.exports = router;
