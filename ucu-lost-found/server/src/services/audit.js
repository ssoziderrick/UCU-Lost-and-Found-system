// Records security-relevant events in audit_logs. Accepts the request (for actor and IP) and an
// optional transaction handle so the entry commits or rolls back with the change it describes.
const db = require('../db');

/**
 * audit(req, 'student.deactivate', { entityType: 'user', entityId: 12, details: { reason } }, tx)
 * `actor` overrides req.user, e.g. for sign-in events before a session exists.
 */
async function audit(req, action, { entityType = null, entityId = null, details = null, actor } = {}, tx = db) {
  const who = actor !== undefined ? actor : req?.user;
  const actorType = who ? (who.role === 'admin' ? 'admin' : 'student') : 'anonymous';
  await tx.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [who?.id ?? null, actorType, action, entityType, entityId == null ? null : String(entityId),
      details ? JSON.stringify(details) : null, req?.ip ?? null]);
}

module.exports = { audit };
