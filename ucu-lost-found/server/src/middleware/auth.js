// Session authentication with opaque random tokens stored (hashed) in MySQL.
// Logging out deletes the session row, so the cookie immediately stops working.
// Deactivated accounts are treated as signed out on their next request.
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden } = require('../utils/errors');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true, // not readable from JavaScript (mitigates XSS token theft)
    sameSite: 'lax', // not sent on cross-site POSTs (mitigates CSRF)
    secure: config.isProduction,
    maxAge: maxAgeMs, // undefined = browser-session cookie
    path: '/',
  };
}

/**
 * Starts a session. Admins get adminSessionHours; students get sessionHours, or rememberDays
 * with remember=true (the cookie then survives closing the browser).
 */
async function createSession(res, user, { remember = false } = {}) {
  const isAdmin = user.role === 'admin';
  const keep = !isAdmin && remember;
  const ms = isAdmin ? config.adminSessionHours * 3600e3 : keep ? config.rememberDays * 86400e3 : config.sessionHours * 3600e3;
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions (user_id, token_hash, expires_at, remember) VALUES (?, ?, ?, ?)',
    [user.id, hashToken(token), new Date(Date.now() + ms), keep ? 1 : 0]);
  res.cookie(config.cookieName, token, cookieOptions(keep ? ms : undefined));
}

async function destroySession(req, res) {
  const token = req.cookies?.[config.cookieName];
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
}

/** Signs a user out everywhere (password reset, deactivation, role change). */
const revokeSessions = (tx, userId) => tx.query('DELETE FROM sessions WHERE user_id = ?', [userId]);

/** Loads an active user with their admin role and permission set, or null. */
async function getActiveUser(userId) {
  const [u] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.registration_number, u.staff_id,
            ar.code AS admin_role_code, ar.name AS admin_role_name
       FROM users u LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
      WHERE u.id = ? AND u.status = 'active'`, [userId]);
  if (!u) return null;
  const permissions = u.role !== 'admin' ? [] : (await db.query(
    `SELECT p.code FROM users u JOIN role_permissions rp ON rp.role_id = u.admin_role_id
       JOIN permissions p ON p.id = rp.permission_id WHERE u.id = ?`, [u.id])).map((r) => r.code);
  return { ...u, permissions: new Set(permissions) };
}

/** Attaches req.user (with adminRole and permissions) if a valid session cookie is present. Never rejects. */
async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[config.cookieName];
  if (token && token.length <= 128) {
    const [s] = await db.query('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > NOW()', [hashToken(token)]);
    if (s) req.user = await getActiveUser(s.user_id);
  }
  next();
}

/** Shape returned to the client by /auth/me and sign-in. */
const publicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  role: u.role,
  email: u.email || null,
  registrationNumber: u.registration_number || undefined,
  staffId: u.staff_id || undefined,
  adminRole: u.admin_role_code ? { code: u.admin_role_code, name: u.admin_role_name } : undefined,
  permissions: u.permissions ? [...u.permissions].sort() : [],
});

function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Only lost-property administrators can do that.'));
  next();
}

/** Requires an admin whose role grants every listed permission. Use after requireAdmin. */
const requirePermission = (...codes) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin' || !codes.every((c) => req.user.permissions.has(c))) {
    return next(forbidden('Your administrator role doesn\'t allow this.'));
  }
  next();
};

module.exports = {
  createSession, destroySession, revokeSessions, loadUser, getActiveUser, publicUser,
  requireAuth, requireAdmin, requirePermission, hashToken,
};
