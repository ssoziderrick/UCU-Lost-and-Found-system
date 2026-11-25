// /api/auth — sign-in with registration number (students) or staff ID (admins), account activation
// against the student registry, and password recovery. Contract: docs/v2/phase-2-identity-contract.md
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { validate } = require('../validation');
const { createSession, destroySession, revokeSessions, getActiveUser, publicUser } = require('../middleware/auth');
const { HttpError, badRequest, unauthorized, conflict } = require('../utils/errors');
const { normaliseId, namesMatch } = require('../utils/identity');
const { passwordProblem } = require('../utils/passwordPolicy');
const tokens = require('../services/tokens');
const { sendMail, templates } = require('../services/mailer');
const { audit } = require('../services/audit');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);
const skipInTests = () => config.isTest;

const BAD_LOGIN = { student: 'Registration number or password is incorrect.', admin: 'Staff ID or password is incorrect.' };
const LOCKED = 'Too many failed attempts. Wait 15 minutes, or reset your password.';
const BAD_CODE = 'That code is incorrect or has expired. Check the latest email, or request a new code.';
const BAD_TICKET = 'This verification has expired or was already used. Please start again.';

// --- Rate limits (in memory; per instance) ---------------------------------------------------
// Many students share one campus IP, so the per-IP limit is generous; the per-account limit is strict.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 30, skipSuccessfulRequests: true, skip: skipInTests,
  message: { error: 'Too many failed sign-in attempts from this network. Wait 15 minutes and try again.' },
});
// Same message for existing and unknown identifiers, so the limit itself reveals nothing.
const loginIdLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: config.auth.maxFailedLogins, skipSuccessfulRequests: true,
  keyGenerator: (req) => `id:${normaliseId(req.body?.registrationNumber || req.body?.staffId) || '-'}`,
  message: { error: LOCKED },
});
const requestLimiter = rateLimit({
  windowMs: 60 * 60e3, limit: 10, skip: skipInTests,
  message: { error: 'Too many requests from this network. Wait an hour and try again.' },
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 30, skip: skipInTests,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});

/** Makes "request a code" answers take about the same time whether or not an email was sent. */
const minDuration = async (startedAt, ms = 350) => {
  const wait = ms - (Date.now() - startedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
};

// --- Sign in -----------------------------------------------------------------------------------
async function signIn(req, res, { role, where, id, password, remember }) {
  const [u] = await db.query(
    `SELECT id, full_name, password_hash, status, (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
       FROM users WHERE ${where} = ? AND role = ?`, [id, role]);
  if (!u) {
    await bcrypt.compare(password, DUMMY_HASH); // same work as a real check
    await audit(req, 'login.failed', { details: { identifier: id, reason: 'unknown' }, actor: null });
    throw unauthorized(BAD_LOGIN[role]);
  }
  if (u.locked) throw new HttpError(429, LOCKED);

  if (!(await bcrypt.compare(password, u.password_hash))) {
    // MySQL applies SET assignments left to right, so locked_until must read failed_logins before it changes.
    await db.query(
      `UPDATE users SET locked_until = IF(failed_logins + 1 >= ?, NOW() + INTERVAL ? MINUTE, locked_until),
              failed_logins = failed_logins + 1 WHERE id = ?`,
      [config.auth.maxFailedLogins, config.auth.lockMinutes, u.id]);
    await audit(req, 'login.failed', { entityType: 'user', entityId: u.id, details: { reason: 'password' }, actor: null });
    throw unauthorized(BAD_LOGIN[role]);
  }
  // Only someone who knows the password learns that the account is deactivated.
  if (u.status !== 'active') {
    throw unauthorized('This account has been deactivated. Please contact the lost-property office.');
  }

  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [u.id]);
  const user = await getActiveUser(u.id);
  await createSession(res, user, { remember });
  await audit(req, 'login.success', { entityType: 'user', entityId: u.id, actor: user });
  res.json({ message: `Welcome back, ${u.full_name.split(' ')[0]}.`, user: publicUser(user) });
}

router.post('/login', loginIpLimiter, loginIdLimiter, async (req, res) => {
  const { registrationNumber, password, remember } = validate('studentLogin', req.body);
  await signIn(req, res, { role: 'student', where: 'registration_number', id: registrationNumber, password, remember });
});

router.post('/admin/login', loginIpLimiter, loginIdLimiter, async (req, res) => {
  const { staffId, password } = validate('adminLogin', req.body);
  await signIn(req, res, { role: 'admin', where: 'staff_id', id: staffId, password, remember: false });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ message: 'You have been signed out.' });
});

// Returns the current user, or null when logged out (200 either way, so the client can check quietly).
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// The v1 open sign-up endpoint is gone: accounts are activated from the student registry.
router.post('/register', (_req, res) => {
  res.status(410).json({ error: 'Open sign-up has been replaced. Activate your account with your registration number instead.' });
});

// --- Activation ----------------------------------------------------------------------------------
router.post('/activate/start', requestLimiter, async (req, res) => {
  const startedAt = Date.now();
  const { registrationNumber, fullName } = validate('activateStart', req.body);
  const [reg] = await db.query('SELECT * FROM student_registry WHERE registration_number = ?', [registrationNumber]);
  const [existing] = await db.query('SELECT id FROM users WHERE registration_number = ?', [registrationNumber]);

  let outcome = 'sent';
  if (!reg) outcome = 'not_in_registry';
  else if (reg.status !== 'enrolled') outcome = `registry_${reg.status}`;
  else if (!namesMatch(fullName, reg.full_name)) outcome = 'name_mismatch';
  else if (existing) outcome = 'already_activated';
  else if (!reg.university_email) outcome = 'no_email_on_file';
  else if (await tokens.issuedLastHour('activation', { registrationNumber }) >= config.auth.maxCodesPerHour) outcome = 'rate_limited';

  if (outcome === 'sent') {
    const { code, link } = await tokens.issue({
      purpose: 'activation', registrationNumber, minutes: config.auth.codeMinutes, ip: req.ip,
    });
    await sendMail({
      to: reg.university_email, purpose: 'activation',
      ...templates.activation({ name: reg.full_name.split(' ')[0], code, link, minutes: config.auth.codeMinutes }),
    });
  }
  // The audit log (admins only) records why nothing was sent, so the office can help students who ask.
  await audit(req, 'account.activation_requested', { entityType: 'registry', entityId: registrationNumber, details: { outcome }, actor: null });
  await minDuration(startedAt);
  res.status(202).json({
    message: 'If those details match an enrolled student who hasn’t activated an account yet, we’ve sent a 6-digit code to their university email. It expires in 15 minutes.',
  });
});

router.post('/activate/verify', verifyLimiter, async (req, res) => {
  const body = validate('verifyCode', req.body);
  const result = body.token
    ? await tokens.verifyLink({ purposes: ['activation'], token: body.token })
    : await tokens.verifyCode({ purposes: ['activation'], registrationNumber: body.registrationNumber, code: body.code });
  if (!result) throw badRequest(BAD_CODE, { fields: { code: BAD_CODE } });
  const [reg] = await db.query('SELECT full_name FROM student_registry WHERE registration_number = ?', [result.row.registration_number]);
  res.json({ ticket: result.ticket, fullName: reg?.full_name, registrationNumber: result.row.registration_number });
});

router.post('/activate/complete', async (req, res) => {
  const { ticket, password } = validate('setPassword', req.body);
  const userId = await db.transaction(async (tx) => {
    const row = await tokens.consumeTicket(tx, { ticket, purposes: ['activation'] });
    if (!row) throw badRequest(BAD_TICKET);
    const regNo = row.registration_number;
    const problem = passwordProblem(password, { identifiers: [regNo] });
    if (problem) throw badRequest(problem, { fields: { password: problem } }); // rolls back: ticket stays usable

    const [reg] = await tx.query('SELECT * FROM student_registry WHERE registration_number = ? FOR UPDATE', [regNo]);
    if (!reg || reg.status !== 'enrolled') throw badRequest('This registration number can no longer be activated. Please contact the lost-property office.');
    const [existing] = await tx.query('SELECT id FROM users WHERE registration_number = ?', [regNo]);
    if (existing) throw conflict('An account already exists for this registration number. Sign in, or reset your password.');

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await tx.query(
      `INSERT INTO users (full_name, email, registration_number, password_hash, role, password_changed_at, last_login_at)
       VALUES (?, ?, ?, ?, 'student', NOW(), NOW())`, [reg.full_name, reg.university_email, regNo, hash]);
    await audit(req, 'account.activated', {
      entityType: 'user', entityId: result.insertId,
      details: { registrationNumber: regNo, via: row.code_hash ? 'email' : 'office_link' },
      actor: { id: result.insertId, role: 'student' },
    }, tx);
    return result.insertId;
  });
  const user = await getActiveUser(userId);
  await createSession(res, user);
  res.status(201).json({ message: `Your account is ready. Welcome, ${user.full_name.split(' ')[0]}.`, user: publicUser(user) });
});

// --- Password recovery ---------------------------------------------------------------------------
async function findAccount({ registrationNumber, staffId }) {
  const [u] = registrationNumber
    ? await db.query(
      `SELECT u.id, u.full_name, u.status, COALESCE(u.email, r.university_email) AS email
         FROM users u LEFT JOIN student_registry r ON r.registration_number = u.registration_number
        WHERE u.registration_number = ? AND u.role = 'student'`, [registrationNumber])
    : await db.query("SELECT id, full_name, status, email FROM users WHERE staff_id = ? AND role = 'admin'", [staffId]);
  return u || null;
}

router.post('/password/forgot', requestLimiter, async (req, res) => {
  const startedAt = Date.now();
  const ids = validate('forgot', req.body);
  const u = await findAccount(ids);

  let outcome = 'sent';
  if (!u) outcome = 'unknown';
  else if (u.status !== 'active') outcome = 'deactivated';
  else if (!u.email) outcome = 'no_email_on_file';
  else if (await tokens.issuedLastHour('password_reset', { userId: u.id }) >= config.auth.maxCodesPerHour) outcome = 'rate_limited';

  if (outcome === 'sent') {
    const { code, link } = await tokens.issue({ purpose: 'password_reset', userId: u.id, minutes: config.auth.codeMinutes, ip: req.ip });
    await sendMail({
      to: u.email, purpose: 'password_reset',
      ...templates.passwordReset({ name: u.full_name.split(' ')[0], code, link, minutes: config.auth.codeMinutes }),
    });
  }
  await audit(req, 'password.reset_requested', {
    entityType: u ? 'user' : null, entityId: u?.id ?? null,
    details: { outcome, identifier: ids.registrationNumber || ids.staffId }, actor: null,
  });
  await minDuration(startedAt);
  res.status(202).json({
    message: 'If that account exists and has an email on file, we’ve sent a 6-digit code to it. It expires in 15 minutes. No email? Visit the lost-property office with your ID.',
  });
});

router.post('/password/verify', verifyLimiter, async (req, res) => {
  const body = validate('verifyCode', req.body);
  let result = null;
  if (body.token) {
    result = await tokens.verifyLink({ purposes: ['password_reset', 'admin_invite'], token: body.token });
  } else {
    const u = await findAccount(body);
    if (u) result = await tokens.verifyCode({ purposes: ['password_reset'], userId: u.id, code: body.code });
  }
  if (!result) throw badRequest(BAD_CODE, { fields: { code: BAD_CODE } });
  const [u] = await db.query('SELECT full_name, registration_number, staff_id FROM users WHERE id = ?', [result.row.user_id]);
  res.json({
    ticket: result.ticket, purpose: result.row.purpose, fullName: u.full_name,
    registrationNumber: u.registration_number || undefined, staffId: u.staff_id || undefined,
  });
});

router.post('/password/reset', async (req, res) => {
  const { ticket, password } = validate('setPassword', req.body);
  const done = await db.transaction(async (tx) => {
    const row = await tokens.consumeTicket(tx, { ticket, purposes: ['password_reset', 'admin_invite'] });
    if (!row) throw badRequest(BAD_TICKET);
    const [u] = await tx.query(
      `SELECT u.id, u.full_name, u.role, u.status, u.registration_number, u.staff_id, u.password_hash,
              COALESCE(u.email, r.university_email) AS email
         FROM users u LEFT JOIN student_registry r ON r.registration_number = u.registration_number
        WHERE u.id = ? FOR UPDATE`, [row.user_id]);
    if (!u || u.status !== 'active') throw badRequest('This account is deactivated. Please contact the lost-property office.');
    const problem = passwordProblem(password, { identifiers: [u.registration_number, u.staff_id] })
      || ((await bcrypt.compare(password, u.password_hash)) ? 'Choose a password you haven’t used for this account.' : null);
    if (problem) throw badRequest(problem, { fields: { password: problem } }); // rolls back: ticket stays usable

    await tx.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), failed_logins = 0, locked_until = NULL WHERE id = ?`,
      [await bcrypt.hash(password, BCRYPT_ROUNDS), u.id]);
    await tokens.voidAllForUser(tx, u.id);
    await revokeSessions(tx, u.id);
    await audit(req, row.purpose === 'admin_invite' ? 'admin.invite_accepted' : 'password.reset', {
      entityType: 'user', entityId: u.id, details: { via: row.code_hash ? 'email_code_or_link' : 'issued_link' }, actor: u,
    }, tx);
    return { u, purpose: row.purpose };
  });
  if (done.purpose === 'password_reset' && done.u.email) {
    await sendMail({ to: done.u.email, purpose: 'password_changed', ...templates.passwordChanged({ name: done.u.full_name.split(' ')[0] }) });
  }
  res.json({
    message: done.purpose === 'admin_invite'
      ? 'Your password is set. Sign in with your staff ID.'
      : 'Your password has been changed and you’ve been signed out everywhere. Sign in with your new password.',
  });
});

module.exports = router;
