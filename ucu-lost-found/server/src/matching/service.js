// Keeps item_matches in step with reports: scores a report against open reports of the opposite type,
// stores suggestions, expires stale ones and notifies the lost report's owner once per strong pair.
const db = require('../db');
const { scorePair, DEFAULTS } = require('./scorer');
const { notify } = require('../services/notifications');

let cached = null;
let cachedAt = 0;

/** Matching settings from app_settings, cached for 30 seconds. */
async function loadConfig() {
  if (cached && Date.now() - cachedAt < 30000) return cached;
  const [row] = await db.query("SELECT value FROM app_settings WHERE setting_key = 'matching'");
  const value = row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : {};
  cached = { ...DEFAULTS, ...value, weights: { ...DEFAULTS.weights, ...(value.weights || {}) } };
  cachedAt = Date.now();
  return cached;
}
const clearConfigCache = () => { cached = null; };

const REPORT_COLUMNS = `
  r.id, r.user_id AS userId, r.type, r.status, r.title, r.description, r.event_date AS eventDate,
  r.category_id AS categoryId, c.parent_id AS categoryParentId, (c.name = 'Other') AS categoryIsOther,
  r.location_id AS locationId, l.zone_id AS zoneId, (l.kind = 'other') AS locationIsOther, l.name AS location`;
const REPORT_FROM = 'FROM reports r JOIN categories c ON c.id = r.category_id JOIN campus_locations l ON l.id = r.location_id';

const normalise = (r) => ({ ...r, categoryIsOther: Boolean(r.categoryIsOther), locationIsOther: Boolean(r.locationIsOther) });

/** Stores or updates one pair; returns the match row when it should be visible. */
async function savePair(lost, found, res, cfg) {
  const [existing] = await db.query(
    'SELECT id, status, notified_at FROM item_matches WHERE lost_report_id = ? AND found_report_id = ?', [lost.id, found.id]);
  if (!res.eligible || res.score < cfg.listThreshold) {
    if (existing && existing.status === 'suggested') {
      await db.query("UPDATE item_matches SET status = 'expired', score = ? WHERE id = ?", [res.score || 0, existing.id]);
    }
    return null;
  }
  const breakdown = JSON.stringify({ parts: res.parts, reasons: res.reasons, weights: cfg.weights });
  // A stale (expired) suggestion that qualifies again comes back; dismissed and claimed ones keep their status.
  await db.query(
    `INSERT INTO item_matches (lost_report_id, found_report_id, score, breakdown) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), breakdown = VALUES(breakdown),
       status = IF(status = 'expired', 'suggested', status)`,
    [lost.id, found.id, res.score, breakdown]);
  const [row] = await db.query(
    'SELECT id, status, notified_at FROM item_matches WHERE lost_report_id = ? AND found_report_id = ?', [lost.id, found.id]);

  if (row.status === 'suggested' && !row.notified_at && res.score >= cfg.notifyThreshold) {
    const sent = await notify({
      userId: lost.userId,
      type: 'match_found',
      title: 'Potential match found!',
      body: `A newly reported ${found.title.toLowerCase()} at ${found.location} may match “${lost.title}”, which you reported missing. `
        + 'View the listing and submit an ownership claim if you believe it is yours.',
      link: `/reports/${found.id}`,
      dedupeKey: `match:${lost.id}:${found.id}`,
      email: true,
    });
    // Record that this pair has been notified, whether now or by an earlier attempt that won a race.
    await db.query('UPDATE item_matches SET notified_at = COALESCE(notified_at, NOW()) WHERE id = ?', [row.id]);
    row.notifiedNow = sent;
  }
  return row;
}

/**
 * Re-scores one report against every eligible report of the opposite type.
 * A report that is no longer open has its open suggestions expired instead.
 */
async function refreshForReport(reportId) {
  const cfg = await loadConfig();
  const [raw] = await db.query(`SELECT ${REPORT_COLUMNS} ${REPORT_FROM} WHERE r.id = ?`, [reportId]);
  if (!raw) return { scored: 0, kept: 0 };
  const report = normalise(raw);

  if (report.status !== 'open') {
    const r = await db.query(
      `UPDATE item_matches SET status = 'expired'
        WHERE (lost_report_id = ? OR found_report_id = ?) AND status = 'suggested'`, [report.id, report.id]);
    return { scored: 0, kept: 0, expired: r.affectedRows };
  }

  const isLost = report.type === 'lost';
  // Date window: found no earlier than 1 day before the loss and at most windowDays after it.
  const window = isLost
    ? 'r.event_date BETWEEN ? - INTERVAL 1 DAY AND ? + INTERVAL ? DAY'
    : 'r.event_date BETWEEN ? - INTERVAL ? DAY AND ? + INTERVAL 1 DAY';
  const windowParams = isLost ? [report.eventDate, report.eventDate, cfg.windowDays] : [report.eventDate, cfg.windowDays, report.eventDate];
  const candidates = (await db.query(
    `SELECT ${REPORT_COLUMNS} ${REPORT_FROM}
      WHERE r.type = ? AND r.status = 'open' AND r.user_id <> ? AND ${window}
      ORDER BY r.event_date DESC LIMIT 1000`,
    [isLost ? 'found' : 'lost', report.userId, ...windowParams])).map(normalise);

  // Pairs that existed before but are no longer candidates (e.g. the date moved) must be re-checked too.
  const others = await db.query(
    `SELECT ${isLost ? 'found_report_id' : 'lost_report_id'} AS id FROM item_matches
      WHERE ${isLost ? 'lost_report_id' : 'found_report_id'} = ? AND status = 'suggested'`, [report.id]);
  const candidateIds = new Set(candidates.map((c) => c.id));
  for (const { id } of others) {
    if (!candidateIds.has(id)) {
      await db.query(
        `UPDATE item_matches SET status = 'expired' WHERE ${isLost ? 'lost_report_id = ? AND found_report_id = ?' : 'found_report_id = ? AND lost_report_id = ?'}`,
        [report.id, id]);
    }
  }

  let kept = 0;
  for (const other of candidates) {
    const lost = isLost ? report : other;
    const found = isLost ? other : report;
    if (await savePair(lost, found, scorePair(lost, found, cfg), cfg)) kept += 1;
  }
  return { scored: candidates.length, kept };
}

/** Never lets a matching problem fail the request that triggered it. */
async function refreshSafely(reportId) {
  try {
    return await refreshForReport(reportId);
  } catch (err) {
    console.error(`Matching for report ${reportId} failed:`, err.message);
    return null;
  }
}

/** When the owner of a matched lost report claims the found item, the suggestion becomes "claimed". */
async function markClaimed(foundReportId, claimantId) {
  await db.query(
    `UPDATE item_matches m JOIN reports l ON l.id = m.lost_report_id
        SET m.status = 'claimed'
      WHERE m.found_report_id = ? AND l.user_id = ? AND m.status IN ('suggested', 'dismissed')`, [foundReportId, claimantId]);
}

/** Re-scores every open lost report (catches anything a failed request missed). */
async function sweep() {
  const rows = await db.query("SELECT id FROM reports WHERE type = 'lost' AND status = 'open'");
  let kept = 0;
  for (const { id } of rows) kept += (await refreshForReport(id)).kept;
  // Suggestions whose reports closed while matching was skipped.
  const expired = await db.query(
    `UPDATE item_matches m JOIN reports l ON l.id = m.lost_report_id JOIN reports f ON f.id = m.found_report_id
        SET m.status = 'expired' WHERE m.status = 'suggested' AND (l.status <> 'open' OR f.status <> 'open')`);
  return { lostReports: rows.length, suggestions: kept, expired: expired.affectedRows };
}

module.exports = { refreshForReport, refreshSafely, markClaimed, sweep, loadConfig, clearConfigCache };
