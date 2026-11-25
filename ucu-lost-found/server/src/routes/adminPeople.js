// /api/admin — student accounts, student registry, administrators, roles and the audit log.
// Mounted inside routes/admin.js after requireAdmin; every route also names its permission.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { validate, schemas } = require('../validation');
const { requirePermission: can, revokeSessions } = require('../middleware/auth');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
const { normaliseId } = require('../utils/identity');
const { parseCsvObjects } = require('../utils/csv');
const tokens = require('../services/tokens');
const { sendMail, templates } = require('../services/mailer');
const { audit } = require('../services/audit');

const router = express.Router();
const PAGE_SIZE = 25;
const page = (req) => Math.max(1, Number.parseInt(req.query.page, 10) || 1);
const like = (q) => `%${String(q).trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
const paged = (items, total, p) => ({ items, page: p, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });

/** Sensitive actions ask the administrator to re-enter their own password. */
async function confirmOwnPassword(req, password) {
  const [me] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!password || !(await bcrypt.compare(String(password), me.password_hash))) {
    throw badRequest('Your password is incorrect.', { fields: { currentPassword: 'Your password is incorrect. Enter the password you sign in with.' } });
  }
}

// ===================================================================================================
// Student accounts
// ===================================================================================================
router.get('/students', can('students.manage'), async (req, res) => {
  const p = page(req);
  const where = ["u.role = 'student'"];
  const params = [];
  if (req.query.q && String(req.query.q).trim()) {
    where.push('(u.full_name LIKE ? OR u.registration_number LIKE ? OR u.email LIKE ?)');
    params.push(like(req.query.q), like(normaliseId(req.query.q)), like(req.query.q));
  }
  if (['active', 'deactivated'].includes(req.query.status)) { where.push('u.status = ?'); params.push(req.query.status); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const items = await db.query(
    `SELECT u.id, u.full_name AS fullName, u.registration_number AS registrationNumber, u.email,
            u.status, u.status_reason AS statusReason, u.last_login_at AS lastLoginAt, u.created_at AS createdAt,
            (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS locked,
            r.status AS registryStatus, r.programme,
            (SELECT COUNT(*) FROM reports rp WHERE rp.user_id = u.id) AS reports,
            (SELECT COUNT(*) FROM claims c WHERE c.claimant_id = u.id) AS claims
       FROM users u LEFT JOIN student_registry r ON r.registration_number = u.registration_number
       ${whereSql} ORDER BY u.full_name, u.id LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (p - 1) * PAGE_SIZE]);
  res.json(paged(items.map((i) => ({ ...i, locked: Boolean(i.locked) })), total, p));
});

async function loadStudent(tx, id) {
  const [u] = await tx.query("SELECT * FROM users WHERE id = ? AND role = 'student' FOR UPDATE", [Number(id)]);
  if (!u) throw notFound('Student account not found.');
  return u;
}

router.post('/students/:id/deactivate', can('students.manage'), async (req, res) => {
  const { reason } = validate('reasonOnly', req.body);
  await db.transaction(async (tx) => {
    const u = await loadStudent(tx, req.params.id);
    if (u.status === 'deactivated') throw conflict('This account is already deactivated.');
    await tx.query("UPDATE users SET status = 'deactivated', status_reason = ? WHERE id = ?", [reason, u.id]);
    await revokeSessions(tx, u.id);
    await tokens.voidAllForUser(tx, u.id);
    await audit(req, 'student.deactivated', { entityType: 'user', entityId: u.id, details: { reason } }, tx);
  });
  res.json({ message: 'Account deactivated. The student has been signed out and can no longer sign in.' });
});

router.post('/students/:id/reactivate', can('students.manage'), async (req, res) => {
  await db.transaction(async (tx) => {
    const u = await loadStudent(tx, req.params.id);
    if (u.status === 'active') throw conflict('This account is already active.');
    if (!u.registration_number) throw badRequest('This account has no registration number. The student should activate a new account instead.');
    await tx.query("UPDATE users SET status = 'active', status_reason = NULL, failed_logins = 0, locked_until = NULL WHERE id = ?", [u.id]);
    await audit(req, 'student.reactivated', { entityType: 'user', entityId: u.id }, tx);
  });
  res.json({ message: 'Account reactivated. The student can sign in again.' });
});

// For students without email: an officer checks their ID card in person and hands over this link.
router.post('/students/:id/reset-link', can('students.manage'), async (req, res) => {
  const link = await db.transaction(async (tx) => {
    const u = await loadStudent(tx, req.params.id);
    if (u.status !== 'active') throw badRequest('Reactivate this account before issuing a reset link.');
    const { link: l } = await tokens.issue({
      purpose: 'password_reset', userId: u.id, withCode: false, minutes: config.auth.officeLinkHours * 60, issuedBy: req.user.id, ip: req.ip,
    }, tx);
    await audit(req, 'student.reset_link_issued', { entityType: 'user', entityId: u.id }, tx);
    return l;
  });
  res.json({ link, expiresInHours: config.auth.officeLinkHours, message: 'Give this link only to the student, after checking their student ID. It works once.' });
});

// ===================================================================================================
// Student registry
// ===================================================================================================
router.get('/registry', can('students.manage'), async (req, res) => {
  const p = page(req);
  const where = [];
  const params = [];
  if (req.query.q && String(req.query.q).trim()) {
    where.push('(r.full_name LIKE ? OR r.registration_number LIKE ? OR r.university_email LIKE ?)');
    params.push(like(req.query.q), like(normaliseId(req.query.q)), like(req.query.q));
  }
  if (['enrolled', 'withdrawn', 'graduated'].includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status); }
  if (req.query.activated === 'yes') where.push('u.id IS NOT NULL');
  if (req.query.activated === 'no') where.push('u.id IS NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM student_registry r LEFT JOIN users u ON u.registration_number = r.registration_number';
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const items = await db.query(
    `SELECT r.registration_number AS registrationNumber, r.full_name AS fullName, r.university_email AS universityEmail,
            r.programme, r.status, r.updated_at AS updatedAt, u.id AS userId, u.status AS accountStatus
       ${from} ${whereSql} ORDER BY r.full_name, r.registration_number LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (p - 1) * PAGE_SIZE]);
  res.json(paged(items, total, p));
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype);
    cb(ok ? null : badRequest('Upload a .csv file. In Excel use File > Save As > CSV UTF-8.'), ok);
  },
}).single('file');

const uploadCsv = (req, res, next) => csvUpload(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return next(badRequest('The file is larger than 2 MB. Split it into smaller files.'));
  next(err);
});

const REGISTRY_COLUMNS = ['registration_number', 'full_name', 'university_email', 'programme', 'status'];
const MAX_ROWS = 20000;

router.post('/registry/import', can('registry.manage'), uploadCsv, async (req, res) => {
  const dryRun = req.query.dryRun === 'true';
  await confirmOwnPassword(req, req.body?.currentPassword);
  if (!req.file) throw badRequest('Choose a CSV file to import.', { fields: { file: 'Choose a CSV file to import.' } });

  let rows;
  try {
    rows = parseCsvObjects(req.file.buffer.toString('utf8'), { required: REGISTRY_COLUMNS });
  } catch (e) {
    throw badRequest(`The file couldn't be read: ${e.message}`, { fields: { file: e.message } });
  }
  if (rows.length > MAX_ROWS) throw badRequest(`The file has ${rows.length} rows. The limit is ${MAX_ROWS}; split it into smaller files.`);

  const rejected = [];
  const valid = new Map();
  for (const { line, values, extraCells } of rows) {
    const parsed = schemas.registryRow.safeParse(values);
    const errors = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
    if (extraCells) errors.push('This row has more cells than the header. Check for an unquoted comma.');
    if (!errors.length && valid.has(parsed.data.registration_number)) {
      errors.push(`Duplicate of line ${valid.get(parsed.data.registration_number).line}.`);
    }
    if (errors.length) rejected.push({ line, registrationNumber: values.registration_number || null, errors });
    else valid.set(parsed.data.registration_number, { line, ...parsed.data });
  }

  // Compare with what is already stored to report added / updated / unchanged.
  const existing = new Map();
  const keys = [...valid.keys()];
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const found = await db.query(
      'SELECT registration_number, full_name, university_email, programme, status FROM student_registry WHERE registration_number IN (?)', [chunk]);
    found.forEach((r) => existing.set(r.registration_number, r));
  }
  let added = 0; let updated = 0; let unchanged = 0;
  for (const r of valid.values()) {
    const e = existing.get(r.registration_number);
    if (!e) added += 1;
    else if (e.full_name === r.full_name && e.university_email === r.university_email && e.programme === r.programme && e.status === r.status) unchanged += 1;
    else updated += 1;
  }

  let importId = null;
  if (!dryRun && valid.size) {
    importId = await db.transaction(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO registry_imports (admin_id, file_name, rows_total, rows_added, rows_updated, rows_rejected)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, req.file.originalname.slice(0, 255), rows.length, added, updated, rejected.length]);
      const list = [...valid.values()];
      for (let i = 0; i < list.length; i += 500) {
        const batch = list.slice(i, i + 500);
        await tx.query(
          `INSERT INTO student_registry (registration_number, full_name, university_email, programme, status, import_id)
           VALUES ? ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), university_email = VALUES(university_email),
             programme = VALUES(programme), status = VALUES(status), import_id = VALUES(import_id)`,
          [batch.map((r) => [r.registration_number, r.full_name, r.university_email, r.programme, r.status, ins.insertId])]);
      }
      await audit(req, 'registry.imported', {
        entityType: 'registry_import', entityId: ins.insertId,
        details: { file: req.file.originalname, total: rows.length, added, updated, unchanged, rejected: rejected.length },
      }, tx);
      return ins.insertId;
    });
  }

  res.status(dryRun ? 200 : 201).json({
    dryRun, importId, totalRows: rows.length, added, updated, unchanged,
    rejectedCount: rejected.length, rejected: rejected.slice(0, 200),
    message: dryRun
      ? `Preview only: ${added} new, ${updated} changed, ${unchanged} unchanged, ${rejected.length} with problems. Nothing has been saved.`
      : `Imported: ${added} new, ${updated} changed, ${unchanged} unchanged. ${rejected.length} row(s) skipped because of problems.`,
  });
});

router.post('/registry/:registrationNumber/activation-link', can('students.manage'), async (req, res) => {
  const regNo = normaliseId(decodeURIComponent(req.params.registrationNumber));
  const link = await db.transaction(async (tx) => {
    const [r] = await tx.query('SELECT status FROM student_registry WHERE registration_number = ? FOR UPDATE', [regNo]);
    if (!r) throw notFound('That registration number is not in the registry.');
    if (r.status !== 'enrolled') throw badRequest(`This student is recorded as ${r.status}, so they can't activate an account.`);
    const [u] = await tx.query('SELECT id FROM users WHERE registration_number = ?', [regNo]);
    if (u) throw conflict('This student already has an account. Issue a password reset link instead.');
    const { link: l } = await tokens.issue({
      purpose: 'activation', registrationNumber: regNo, withCode: false, minutes: config.auth.officeLinkHours * 60, issuedBy: req.user.id, ip: req.ip,
    }, tx);
    await audit(req, 'registry.activation_link_issued', { entityType: 'registry', entityId: regNo }, tx);
    return l;
  });
  res.json({ link, expiresInHours: config.auth.officeLinkHours, message: 'Give this link only to the student, after checking their student ID. It works once.' });
});

// ===================================================================================================
// Administrators and roles
// ===================================================================================================
router.get('/roles', can('admins.manage'), async (_req, res) => {
  const rows = await db.query(
    `SELECT r.code, r.name, r.description, p.code AS permission
       FROM admin_roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id LEFT JOIN permissions p ON p.id = rp.permission_id
      ORDER BY r.id, p.id`);
  const roles = new Map();
  rows.forEach((r) => {
    if (!roles.has(r.code)) roles.set(r.code, { code: r.code, name: r.name, description: r.description, permissions: [] });
    if (r.permission) roles.get(r.code).permissions.push(r.permission);
  });
  res.json({ items: [...roles.values()] });
});

router.get('/admins', can('admins.manage'), async (_req, res) => {
  const items = await db.query(
    `SELECT u.id, u.full_name AS fullName, u.staff_id AS staffId, u.email, u.status, u.last_login_at AS lastLoginAt,
            u.created_at AS createdAt, (u.password_changed_at IS NULL) AS invitePending,
            r.code AS roleCode, r.name AS roleName
       FROM users u JOIN admin_roles r ON r.id = u.admin_role_id
      WHERE u.role = 'admin' ORDER BY u.status, u.full_name`);
  res.json({ items: items.map((i) => ({ ...i, invitePending: Boolean(i.invitePending) })) });
});

router.post('/admins', can('admins.manage'), async (req, res) => {
  const data = validate('adminCreate', req.body);
  await confirmOwnPassword(req, data.currentPassword);
  const [clash] = await db.query('SELECT staff_id, email FROM users WHERE staff_id = ? OR email = ?', [data.staffId, data.email]);
  if (clash) {
    const field = clash.staff_id === data.staffId ? 'staffId' : 'email';
    const msg = field === 'staffId' ? 'That staff ID is already in use.' : 'That email address is already used by another account.';
    throw conflict(msg, { fields: { [field]: msg } });
  }
  const created = await db.transaction(async (tx) => {
    const [role] = await tx.query('SELECT id, name FROM admin_roles WHERE code = ?', [data.roleCode]);
    // No usable password until the invitation is accepted.
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const ins = await tx.query(
      `INSERT INTO users (full_name, email, staff_id, password_hash, role, admin_role_id, created_by)
       VALUES (?, ?, ?, ?, 'admin', ?, ?)`, [data.fullName, data.email, data.staffId, unusable, role.id, req.user.id]);
    const { link } = await tokens.issue({
      purpose: 'admin_invite', userId: ins.insertId, withCode: false, minutes: config.auth.inviteHours * 60, issuedBy: req.user.id, ip: req.ip,
    }, tx);
    await audit(req, 'admin.created', { entityType: 'user', entityId: ins.insertId, details: { staffId: data.staffId, role: data.roleCode } }, tx);
    return { id: ins.insertId, link, roleName: role.name };
  });
  await sendMail({
    to: data.email, purpose: 'admin_invite',
    ...templates.adminInvite({
      name: data.fullName.split(' ')[0], staffId: data.staffId, roleName: created.roleName,
      link: created.link, hours: config.auth.inviteHours, invitedBy: req.user.full_name,
    }),
  });
  res.status(201).json({ id: created.id, message: `Invitation sent to ${data.email}. The link expires in ${config.auth.inviteHours} hours.` });
});

async function loadAdmin(tx, id) {
  const [u] = await tx.query(
    `SELECT u.id, u.status, u.full_name, r.code AS roleCode FROM users u JOIN admin_roles r ON r.id = u.admin_role_id
      WHERE u.id = ? AND u.role = 'admin' FOR UPDATE`, [Number(id)]);
  if (!u) throw notFound('Administrator not found.');
  return u;
}

/** Keeps at least one active super admin, so nobody can lock the organisation out. */
async function assertNotLastSuperAdmin(tx, target) {
  if (target.roleCode !== 'super_admin' || target.status !== 'active') return;
  const [{ n }] = await tx.query(
    `SELECT COUNT(*) AS n FROM users u JOIN admin_roles r ON r.id = u.admin_role_id
      WHERE r.code = 'super_admin' AND u.status = 'active' AND u.id <> ? FOR UPDATE`, [target.id]);
  if (Number(n) === 0) throw conflict('This is the only active super admin. Make someone else a super admin first.');
}

router.patch('/admins/:id', can('admins.manage'), async (req, res) => {
  const { roleCode } = validate('roleChange', req.body);
  await db.transaction(async (tx) => {
    const target = await loadAdmin(tx, req.params.id);
    if (target.id === req.user.id) throw forbidden('You can’t change your own role. Ask another super admin.');
    if (target.roleCode === roleCode) return;
    if (roleCode !== 'super_admin') await assertNotLastSuperAdmin(tx, target);
    await tx.query('UPDATE users SET admin_role_id = (SELECT id FROM admin_roles WHERE code = ?) WHERE id = ?', [roleCode, target.id]);
    await revokeSessions(tx, target.id); // new permissions apply from their next sign-in
    await audit(req, 'admin.role_changed', { entityType: 'user', entityId: target.id, details: { from: target.roleCode, to: roleCode } }, tx);
  });
  res.json({ message: 'Role updated. They have been signed out so the new permissions apply.' });
});

router.post('/admins/:id/deactivate', can('admins.manage'), async (req, res) => {
  const { reason } = validate('reasonOnly', req.body);
  await db.transaction(async (tx) => {
    const target = await loadAdmin(tx, req.params.id);
    if (target.id === req.user.id) throw forbidden('You can’t deactivate your own account.');
    if (target.status === 'deactivated') throw conflict('This administrator is already deactivated.');
    await assertNotLastSuperAdmin(tx, target);
    await tx.query("UPDATE users SET status = 'deactivated', status_reason = ? WHERE id = ?", [reason, target.id]);
    await revokeSessions(tx, target.id);
    await tokens.voidAllForUser(tx, target.id);
    await audit(req, 'admin.deactivated', { entityType: 'user', entityId: target.id, details: { reason } }, tx);
  });
  res.json({ message: 'Administrator deactivated and signed out.' });
});

router.post('/admins/:id/reactivate', can('admins.manage'), async (req, res) => {
  await db.transaction(async (tx) => {
    const target = await loadAdmin(tx, req.params.id);
    if (target.status === 'active') throw conflict('This administrator is already active.');
    await tx.query("UPDATE users SET status = 'active', status_reason = NULL, failed_logins = 0, locked_until = NULL WHERE id = ?", [target.id]);
    await audit(req, 'admin.reactivated', { entityType: 'user', entityId: target.id }, tx);
  });
  res.json({ message: 'Administrator reactivated.' });
});

// ===================================================================================================
// Audit log
// ===================================================================================================
router.get('/audit', can('audit.view'), async (req, res) => {
  const p = page(req);
  const where = [];
  const params = [];
  if (req.query.action && /^[a-z_.]+$/.test(req.query.action)) { where.push('a.action LIKE ?'); params.push(`${req.query.action}%`); }
  if (req.query.entityType && /^[a-z_]+$/.test(req.query.entityType)) { where.push('a.entity_type = ?'); params.push(req.query.entityType); }
  if (req.query.entityId) { where.push('a.entity_id = ?'); params.push(String(req.query.entityId).slice(0, 40)); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  const items = await db.query(
    `SELECT a.id, a.action, a.actor_type AS actorType, u.full_name AS actorName, a.entity_type AS entityType,
            a.entity_id AS entityId, a.details, a.ip, a.created_at AS createdAt
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (p - 1) * PAGE_SIZE]);
  res.json(paged(items.map((i) => ({ ...i, details: typeof i.details === 'string' ? JSON.parse(i.details) : i.details })), total, p));
});

module.exports = router;
