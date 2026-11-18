// Session authentication with opaque random tokens stored (hashed) in MySQL.
// Logging out deletes the session row, so the cookie immediately stops working.
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden } = require('../utils/errors');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return {
    httpOnly: true, // not readable from JavaScript (mitigates XSS token theft)
    sameSite: 'lax', // not sent on cross-site POSTs (mitigates CSRF)
    secure: config.isProduction,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  };
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
  await db.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hashToken(token), expires]);
  res.cookie(config.cookieName, token, cookieOptions());
}

async function destroySession(req, res) {
  const token = req.cookies?.[config.cookieName];
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
}

/** Attaches req.user if a valid session cookie is present. Never rejects. */
async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[config.cookieName];
  if (token) {
    const rows = await db.query(
      `SELECT u.id, u.full_name, u.email, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > NOW()`,
      [hashToken(token)]);
    if (rows.length) req.user = rows[0];
  }
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Only the lost-and-found administrator can do that.'));
  next();
}

module.exports = { createSession, destroySession, loadUser, requireAuth, requireAdmin, hashToken };
