// /api/me — the logged-in student's own reports and claims
// /api/claims/:id — a single claim, visible ONLY to its claimant or an administrator
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notFound } = require('../utils/errors');

const me = express.Router();
const claims = express.Router();

me.use(requireAuth);

me.get('/reports', async (req, res) => {
  const rows = await db.query(
    `SELECT r.id, r.type, r.title, r.status, r.event_date AS eventDate, r.created_at AS createdAt,
            r.private_details AS privateDetails, r.returned_at AS returnedAt,
            c.name AS category, l.name AS location
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       JOIN locations  l ON l.id = r.location_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC, r.id DESC`, [req.user.id]);
  res.json({ items: rows });
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
