// /api/admin — claim review, decisions, confirmed returns, report moderation.
// Every route requires an administrator, and each one a specific permission of their role (server-enforced).
const express = require('express');
const db = require('../db');
const { validate } = require('../validation');
const { requireAdmin, requirePermission: can } = require('../middleware/auth');
const { notFound, conflict, badRequest } = require('../utils/errors');
const matching = require('../matching/service');
const { notify, claimMessages } = require('../services/notifications');

/** Claim facts needed for notifications after the transaction commits. */
const claimInfo = (tx, id) => tx.query(
  `SELECT cl.id, cl.claimant_id AS claimantId, cl.report_id AS reportId, r.title, r.user_id AS finderId
     FROM claims cl JOIN reports r ON r.id = cl.report_id WHERE cl.id = ?`, [id]).then((rows) => rows[0]);
/** Pending claimants on a report, so they can be told when their claim is closed automatically. */
const pendingClaims = (tx, reportId) => tx.query(
  `SELECT cl.id, cl.claimant_id AS claimantId, r.title FROM claims cl JOIN reports r ON r.id = cl.report_id
    WHERE cl.report_id = ? AND cl.status = 'pending'`, [reportId]);
const tellRejected = (claims, reason) => Promise.all(claims.map((c) => notify({
  userId: c.claimantId, link: `/my/claims/${c.id}`, dedupeKey: `claim:${c.id}:rejected`, ...claimMessages.rejected(c.title, reason),
})));

const router = express.Router();
router.use(requireAdmin);

// Accounts, registry, administrators and audit log (Phase 2).
router.use(require('./adminPeople'));
// Campus locations, zones and categories (Phase 3).
router.use(require('./adminCatalog'));
// Potential matches and matching settings (Phase 4).
router.use(require('./adminMatching'));

const logAction = (tx, adminId, action, reportId, claimId, note) =>
  tx.query('INSERT INTO admin_actions (admin_id, action, report_id, claim_id, note) VALUES (?, ?, ?, ?, ?)',
    [adminId, action, reportId, claimId, note]);

// Dashboard counts
router.get('/stats', can('stats.view'), async (_req, res) => {
  const [row] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM claims WHERE status = 'pending')                    AS pendingClaims,
      (SELECT COUNT(*) FROM claims WHERE status = 'approved')                   AS awaitingCollection,
      (SELECT COUNT(*) FROM reports WHERE type='found' AND status = 'open')     AS openFound,
      (SELECT COUNT(*) FROM reports WHERE type='lost'  AND status = 'open')     AS openLost,
      (SELECT COUNT(*) FROM reports WHERE status = 'returned')                  AS returned`);
  res.json(row);
});

// Claims queue (filter by status)
router.get('/claims', can('claims.review'), async (req, res) => {
  const { status, reportId } = req.query;
  const params = [];
  const conds = [];
  if (['pending', 'approved', 'rejected', 'collected'].includes(status)) { conds.push('cl.status = ?'); params.push(status); }
  if (Number(reportId) > 0) { conds.push('cl.report_id = ?'); params.push(Number(reportId)); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await db.query(
    `SELECT cl.id, cl.status, cl.created_at AS createdAt, cl.reviewed_at AS reviewedAt,
            r.id AS reportId, r.title AS reportTitle, r.status AS reportStatus,
            u.full_name AS claimantName,
            (SELECT COUNT(*) FROM claims c2 WHERE c2.report_id = r.id) AS claimsOnItem
       FROM claims cl
       JOIN reports r ON r.id = cl.report_id
       JOIN users u   ON u.id = cl.claimant_id
       ${where}
      ORDER BY FIELD(cl.status,'pending','approved','collected','rejected'), cl.created_at ASC`, params);
  res.json({ items: rows });
});

// Full claim detail: evidence side-by-side with the finder's private identifying details
router.get('/claims/:id', can('claims.review'), async (req, res) => {
  const [claim] = await db.query(
    `SELECT cl.id, cl.status, cl.evidence, cl.created_at AS createdAt, cl.admin_reason AS adminReason,
            cl.collection_instructions AS collectionInstructions, cl.reviewed_at AS reviewedAt,
            cl.collected_at AS collectedAt, rv.full_name AS reviewedBy,
            u.id AS claimantId, u.full_name AS claimantName, u.email AS claimantEmail,
            u.registration_number AS claimantRegistrationNumber, u.phone AS claimantPhone,
            r.id AS reportId, r.title AS reportTitle, r.description AS reportDescription,
            rc.identifying_details AS reportPrivateDetails, r.status AS reportStatus, r.event_date AS reportDate,
            l.name AS reportLocation, f.full_name AS finderName, f.email AS finderEmail
       FROM claims cl
       JOIN users u   ON u.id = cl.claimant_id
       JOIN reports r ON r.id = cl.report_id
       JOIN users f   ON f.id = r.user_id
       JOIN campus_locations l ON l.id = r.location_id
       LEFT JOIN report_confidential rc ON rc.report_id = r.id
       LEFT JOIN users rv ON rv.id = cl.reviewed_by
      WHERE cl.id = ?`, [Number(req.params.id)]);
  if (!claim) throw notFound('Claim not found.');
  const competing = await db.query(
    `SELECT cl.id, cl.status, u.full_name AS claimantName, cl.created_at AS createdAt
       FROM claims cl JOIN users u ON u.id = cl.claimant_id
      WHERE cl.report_id = ? AND cl.id <> ? ORDER BY cl.created_at`, [claim.reportId, claim.id]);
  res.json({ claim, competing });
});

// Approve: claim accepted for collection. Only ONE approved claim per item.
router.post('/claims/:id/approve', can('claims.decide'), async (req, res) => {
  const { reason, collectionInstructions } = validate('approve', req.body);
  const id = Number(req.params.id);
  await db.transaction(async (tx) => {
    const [cl] = await tx.query('SELECT id, report_id, status FROM claims WHERE id = ? FOR UPDATE', [id]);
    if (!cl) throw notFound('Claim not found.');
    const [r] = await tx.query('SELECT id, status FROM reports WHERE id = ? FOR UPDATE', [cl.report_id]);
    if (cl.status !== 'pending') throw conflict(`This claim has already been ${cl.status}.`);
    if (r.status === 'returned') throw conflict('This item has already been returned.');
    if (r.status !== 'open') throw conflict('Another claim for this item is already approved. Reject or cancel it first.');

    await tx.query(
      `UPDATE claims SET status='approved', admin_reason=?, collection_instructions=?, reviewed_by=?, reviewed_at=NOW()
        WHERE id = ?`, [reason, collectionInstructions, req.user.id, id]);
    await tx.query("UPDATE reports SET status='awaiting_collection' WHERE id = ?", [cl.report_id]);
    await logAction(tx, req.user.id, 'approve_claim', cl.report_id, id, reason);
  });
  const info = await claimInfo(db, id);
  await matching.refreshSafely(info.reportId);
  await notify({ userId: info.claimantId, link: `/my/claims/${id}`, dedupeKey: `claim:${id}:approved`, ...claimMessages.approved(info.title, collectionInstructions) });
  res.json({ message: 'Claim approved. The claimant can now see the collection instructions.' });
});

// Reject a pending claim with a reason
router.post('/claims/:id/reject', can('claims.decide'), async (req, res) => {
  const { reason } = validate('reasonOnly', req.body);
  const id = Number(req.params.id);
  await db.transaction(async (tx) => {
    const [cl] = await tx.query('SELECT id, report_id, status FROM claims WHERE id = ? FOR UPDATE', [id]);
    if (!cl) throw notFound('Claim not found.');
    if (cl.status !== 'pending') throw conflict(`Only pending claims can be rejected. This claim is ${cl.status}.`);
    await tx.query(
      "UPDATE claims SET status='rejected', admin_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id = ?",
      [reason, req.user.id, id]);
    await logAction(tx, req.user.id, 'reject_claim', cl.report_id, id, reason);
  });
  await tellRejected([await claimInfo(db, id)], reason);
  res.json({ message: 'Claim rejected. The claimant can see your reason.' });
});

// Cancel an approval (e.g. claimant never came to collect) — item goes back to open
router.post('/claims/:id/revoke', can('claims.decide'), async (req, res) => {
  const { reason } = validate('reasonOnly', req.body);
  const id = Number(req.params.id);
  await db.transaction(async (tx) => {
    const [cl] = await tx.query('SELECT id, report_id, status FROM claims WHERE id = ? FOR UPDATE', [id]);
    if (!cl) throw notFound('Claim not found.');
    if (cl.status !== 'approved') throw conflict('Only an approved (not yet collected) claim can be cancelled.');
    await tx.query(
      "UPDATE claims SET status='rejected', admin_reason=?, collection_instructions=NULL, reviewed_by=?, reviewed_at=NOW() WHERE id = ?",
      [`Approval cancelled: ${reason}`, req.user.id, id]);
    await tx.query("UPDATE reports SET status='open' WHERE id = ? AND status='awaiting_collection'", [cl.report_id]);
    await logAction(tx, req.user.id, 'revoke_approval', cl.report_id, id, reason);
  });
  const revoked = await claimInfo(db, id);
  await matching.refreshSafely(revoked.reportId);
  await tellRejected([revoked], `The approval was cancelled: ${reason}`);
  res.json({ message: 'Approval cancelled. The item is open for claims again.' });
});

// Confirm collection: ONLY after an approved claim. Marks the item returned and closes other claims.
router.post('/claims/:id/confirm-return', can('returns.confirm'), async (req, res) => {
  const id = Number(req.params.id);
  const others = await db.transaction(async (tx) => {
    const [cl] = await tx.query('SELECT id, report_id, status FROM claims WHERE id = ? FOR UPDATE', [id]);
    if (!cl) throw notFound('Claim not found.');
    if (cl.status !== 'approved') throw conflict('A return can only be confirmed for an approved claim.');
    await tx.query("UPDATE claims SET status='collected', collected_at=NOW() WHERE id = ?", [id]);
    await tx.query("UPDATE reports SET status='returned', returned_at=NOW() WHERE id = ?", [cl.report_id]);
    const closing = await pendingClaims(tx, cl.report_id);
    await tx.query(
      `UPDATE claims SET status='rejected', admin_reason='Item has been returned to its verified owner.',
              reviewed_by=?, reviewed_at=NOW()
        WHERE report_id = ? AND status = 'pending'`, [req.user.id, cl.report_id]);
    await logAction(tx, req.user.id, 'confirm_return', cl.report_id, id, 'Collection confirmed');
    return closing;
  });
  const done = await claimInfo(db, id);
  await matching.refreshSafely(done.reportId);
  await notify({ userId: done.claimantId, link: `/my/claims/${id}`, dedupeKey: `claim:${id}:returned`, ...claimMessages.returnedToClaimant(done.title) });
  await notify({ userId: done.finderId, link: `/reports/${done.reportId}`, dedupeKey: `report:${done.reportId}:returned`, ...claimMessages.returnedToFinder(done.title) });
  await tellRejected(others, 'The item has been returned to its verified owner.');
  res.json({ message: 'Return confirmed. The listing now shows the item as returned.' });
});

// All reports (including private details and reporter) for moderation
router.get('/reports', can('reports.moderate'), async (req, res) => {
  const { status, type } = req.query;
  const where = [];
  const params = [];
  if (['open', 'awaiting_collection', 'returned', 'closed', 'removed'].includes(status)) { where.push('r.status = ?'); params.push(status); }
  if (type === 'lost' || type === 'found') { where.push('r.type = ?'); params.push(type); }
  const rows = await db.query(
    `SELECT r.id, r.type, r.title, r.status, r.event_date AS eventDate, rc.identifying_details AS privateDetails,
            r.status_note AS statusNote, r.created_at AS createdAt, c.name AS category, l.name AS location,
            u.full_name AS reporterName, u.email AS reporterEmail,
            (SELECT COUNT(*) FROM claims cl WHERE cl.report_id = r.id AND cl.status='pending') AS pendingClaims
       FROM reports r JOIN users u ON u.id = r.user_id
       JOIN categories c ON c.id = r.category_id JOIN campus_locations l ON l.id = r.location_id
       LEFT JOIN report_confidential rc ON rc.report_id = r.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.created_at DESC, r.id DESC`, params);
  res.json({ items: rows });
});

// Remove an inappropriate report from public listings (or restore it)
router.post('/reports/:id/remove', can('reports.moderate'), async (req, res) => {
  const { reason } = validate('reasonOnly', req.body);
  const id = Number(req.params.id);
  const closed = await db.transaction(async (tx) => {
    const [r] = await tx.query('SELECT status FROM reports WHERE id = ? FOR UPDATE', [id]);
    if (!r) throw notFound('Report not found.');
    if (r.status === 'returned') throw badRequest('Returned items stay listed as a record of the return.');
    if (r.status === 'awaiting_collection') throw conflict('Cancel the approved claim before removing this report.');
    const closing = await pendingClaims(tx, id);
    await tx.query("UPDATE reports SET status='removed', status_note=? WHERE id = ?", [reason, id]);
    await tx.query("UPDATE claims SET status='rejected', admin_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE report_id=? AND status='pending'",
      [`Report removed: ${reason}`, req.user.id, id]);
    await logAction(tx, req.user.id, 'remove_report', id, null, reason);
    return closing;
  });
  await matching.refreshSafely(id);
  await tellRejected(closed, `The report was removed: ${reason}`);
  res.json({ message: 'Report removed from public listings.' });
});

router.post('/reports/:id/restore', can('reports.moderate'), async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.query("UPDATE reports SET status='open', status_note=NULL WHERE id = ? AND status='removed'", [id]);
  if (!result.affectedRows) throw conflict('Only removed reports can be restored.');
  await logAction(db, req.user.id, 'restore_report', id, null, null);
  await matching.refreshSafely(id);
  res.json({ message: 'Report restored to public listings.' });
});

// Decision history for a report
router.get('/reports/:id/history', can('reports.moderate'), async (req, res) => {
  const rows = await db.query(
    `SELECT a.id, a.action, a.claim_id AS claimId, a.note, a.created_at AS createdAt, u.full_name AS adminName
       FROM admin_actions a JOIN users u ON u.id = a.admin_id WHERE a.report_id = ? ORDER BY a.id`,
    [Number(req.params.id)]);
  res.json({ items: rows });
});

module.exports = router;
