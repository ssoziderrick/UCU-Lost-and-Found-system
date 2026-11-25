// One-time codes and links for activation, password reset and admin invitations.
//
// Flow: issue() emails a 6-digit code and a link -> verifyCode()/verifyLink() checks one of them and
// returns a short-lived ticket -> consumeTicket() redeems the ticket exactly once when the password is set.
// Only hashes are stored: SHA-256 for the long random link token and ticket, HMAC-SHA256 (keyed with
// APP_SECRET and bound to the purpose and subject) for the short code, so a database leak alone does
// not let anyone try codes offline.
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const subjectOf = ({ registrationNumber, userId }) => (userId ? `user:${userId}` : `reg:${registrationNumber}`);
const codeHash = (purpose, subject, code) =>
  crypto.createHmac('sha256', config.appSecret).update(`${purpose}|${subject}|${code}`).digest('hex');

const LINK_PATHS = { activation: '/activate', password_reset: '/reset-password', admin_invite: '/set-password' };
const linkFor = (purpose, token) => `${config.appUrl}${LINK_PATHS[purpose]}?token=${encodeURIComponent(token)}`;

const subjectWhere = ({ registrationNumber, userId }) => (userId
  ? { sql: 'user_id = ?', params: [userId] }
  : { sql: 'registration_number = ? AND user_id IS NULL', params: [registrationNumber] });

/** How many tokens were issued for this subject and purpose in the last hour (for rate limiting). */
async function issuedLastHour(purpose, subject) {
  const w = subjectWhere(subject);
  const [row] = await db.query(
    `SELECT COUNT(*) AS n FROM verification_tokens
      WHERE purpose = ? AND ${w.sql} AND created_at > NOW() - INTERVAL 1 HOUR`, [purpose, ...w.params]);
  return Number(row.n);
}

/**
 * Creates a token and voids any earlier unused one for the same purpose and subject.
 * withCode=false is for links handed over in person or emailed invitations.
 */
async function issue({ purpose, registrationNumber = null, userId = null, withCode = true, minutes, issuedBy = null, ip = null }, tx = db) {
  const w = subjectWhere({ registrationNumber, userId });
  await tx.query(`UPDATE verification_tokens SET used_at = NOW() WHERE purpose = ? AND ${w.sql} AND used_at IS NULL`,
    [purpose, ...w.params]);
  const linkToken = randomToken();
  const code = withCode ? String(crypto.randomInt(0, 1000000)).padStart(6, '0') : null;
  await tx.query(
    `INSERT INTO verification_tokens
       (purpose, registration_number, user_id, link_hash, code_hash, issued_by, requested_ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
    [purpose, registrationNumber, userId, sha256(linkToken),
      code ? codeHash(purpose, subjectOf({ registrationNumber, userId }), code) : null,
      issuedBy, ip, minutes]);
  return { code, link: linkFor(purpose, linkToken) };
}

async function grantTicket(rowId) {
  const ticket = randomToken();
  await db.query(
    `UPDATE verification_tokens SET ticket_hash = ?, verified_at = NOW(),
            ticket_expires_at = NOW() + INTERVAL ? MINUTE WHERE id = ?`,
    [sha256(ticket), config.auth.ticketMinutes, rowId]);
  return ticket;
}

/** Checks a typed code. Returns { ticket, row } or null. Wrong codes count; the 5th wrong try voids the token. */
async function verifyCode({ purposes, registrationNumber = null, userId = null, code }) {
  const w = subjectWhere({ registrationNumber, userId });
  const [row] = await db.query(
    `SELECT * FROM verification_tokens
      WHERE purpose IN (?) AND ${w.sql} AND used_at IS NULL AND expires_at > NOW() AND code_hash IS NOT NULL
      ORDER BY id DESC LIMIT 1`, [purposes, ...w.params]);
  if (!row) return null;
  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(codeHash(row.purpose, subjectOf({ registrationNumber, userId }), String(code ?? '').trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    // used_at first: MySQL applies SET assignments left to right.
    await db.query(
      `UPDATE verification_tokens SET used_at = IF(attempts + 1 >= ?, NOW(), used_at),
              attempts = attempts + 1 WHERE id = ?`,
      [config.auth.maxCodeAttempts, row.id]);
    return null;
  }
  return { ticket: await grantTicket(row.id), row };
}

/** Checks a link token. Returns { ticket, row } or null. */
async function verifyLink({ purposes, token }) {
  if (!token || String(token).length > 100) return null;
  const [row] = await db.query(
    `SELECT * FROM verification_tokens
      WHERE link_hash = ? AND purpose IN (?) AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(String(token)), purposes]);
  if (!row) return null;
  return { ticket: await grantTicket(row.id), row };
}

/** Redeems a ticket inside the caller's transaction. Returns the token row, or null if invalid, expired or used. */
async function consumeTicket(tx, { ticket, purposes }) {
  if (!ticket || String(ticket).length > 100) return null;
  const [row] = await tx.query(
    `SELECT * FROM verification_tokens
      WHERE ticket_hash = ? AND purpose IN (?) AND used_at IS NULL AND ticket_expires_at > NOW()
      FOR UPDATE`, [sha256(String(ticket)), purposes]);
  if (!row) return null;
  await tx.query('UPDATE verification_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  return row;
}

/** Voids every open token of a user (after a password change or deactivation). */
const voidAllForUser = (tx, userId) =>
  tx.query('UPDATE verification_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);

module.exports = { issue, issuedLastHour, verifyCode, verifyLink, consumeTicket, voidAllForUser };
