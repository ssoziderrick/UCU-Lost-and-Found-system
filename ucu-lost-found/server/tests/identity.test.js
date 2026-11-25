/**
 * Phase 2 identity tests (Jest + Supertest) against the real MySQL test database.
 * Covers docs/v2/phase-2-identity-contract.md: registration-number sign-in, lockout, activation,
 * password recovery, admin invitations, roles and permissions, registry import and the audit log.
 * Emails are read from email_outbox (MAIL_TRANSPORT=log in tests).
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const setupDb = require('../scripts/setup-db');

const STUDENT_PW = 'TestOnly-Student-1';
const ADMIN_PW = 'TestOnly-Admin-1';
const NEW_PW = 'Campus-Return-2026';

async function latestEmail(to) {
  const [row] = await db.query('SELECT * FROM email_outbox WHERE to_address = ? ORDER BY id DESC LIMIT 1', [to]);
  if (!row) return null;
  return {
    ...row,
    code: row.body_text?.match(/\b(\d{6})\b/)?.[1],
    token: row.body_text?.match(/token=([A-Za-z0-9_-]+)/)?.[1],
  };
}
const emailCount = async (to) => Number((await db.query('SELECT COUNT(*) AS n FROM email_outbox WHERE to_address = ?', [to]))[0].n);

async function studentAgent(registrationNumber, password = STUDENT_PW) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ registrationNumber, password });
  expect(res.status).toBe(200);
  return agent;
}
async function adminAgent(staffId, password = ADMIN_PW) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/admin/login').send({ staffId, password });
  expect(res.status).toBe(200);
  return agent;
}

/** Inserts an admin with a known password and the given role. */
async function makeAdmin(staffId, roleCode, email) {
  await db.query(
    `INSERT INTO users (full_name, email, staff_id, password_hash, role, admin_role_id, password_changed_at)
     VALUES (?, ?, ?, ?, 'admin', (SELECT id FROM admin_roles WHERE code = ?), NOW())`,
    [`Test ${roleCode}`, email, staffId, bcrypt.hashSync(ADMIN_PW, 4), roleCode]);
}

let superAdmin; let officer; let viewer;

beforeAll(async () => {
  await setupDb({ database: config.db.database, quiet: true });
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'student'", [bcrypt.hashSync(STUDENT_PW, 4)]);
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'admin'", [bcrypt.hashSync(ADMIN_PW, 4)]);
  await makeAdmin('STAFF-0101', 'officer', 'officer@lostfound.ucu.test');
  await makeAdmin('STAFF-0102', 'viewer', 'viewer@lostfound.ucu.test');
  superAdmin = await adminAgent('STAFF-0001');
  officer = await adminAgent('STAFF-0101');
  viewer = await adminAgent('STAFF-0102');
}, 60000);

afterAll(async () => { await db.pool.end(); });

// ---------------------------------------------------------------------------------------------
describe('Sign-in and lockout', () => {
  test('TC-I1 admins sign in with staff ID; the student and admin sign-ins are separate', async () => {
    const asAdminOnStudent = await request(app).post('/api/auth/login').send({ registrationNumber: 'STAFF-0001', password: ADMIN_PW });
    expect(asAdminOnStudent.status).toBe(401);
    const asStudentOnAdmin = await request(app).post('/api/auth/admin/login').send({ staffId: 'S24B23/102', password: STUDENT_PW });
    expect(asStudentOnAdmin.status).toBe(401);
    const me = await superAdmin.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ role: 'admin', staffId: 'STAFF-0001', adminRole: { code: 'super_admin' } });
    expect(me.body.user.permissions).toContain('admins.manage');
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
  });

  test('TC-I2 five wrong passwords lock the account; the right password is then refused too', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/103', password: `wrong-${i}` });
      expect(r.status).toBe(401);
    }
    const right = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/103', password: STUDENT_PW });
    expect(right.status).toBe(429);
    const [u] = await db.query("SELECT failed_logins, locked_until FROM users WHERE registration_number = 'S24B23/103'");
    expect(u.failed_logins).toBe(5);
    expect(u.locked_until).not.toBeNull();
  });

  test('TC-I3 an unknown registration number hits the same limit with the same message', async () => {
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await request(app).post('/api/auth/login').send({ registrationNumber: 'S77X77/777', password: `x-${i}` });
    }
    expect(last.status).toBe(429);
    const locked = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/103', password: STUDENT_PW });
    expect(last.body.error).toBe(locked.body.error);
  });

  test('TC-I4 a remembered student session lasts 30 days; a normal one is a browser-session cookie', async () => {
    const normal = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/104', password: STUDENT_PW });
    expect(normal.headers['set-cookie'][0]).not.toMatch(/Max-Age|Expires/i);
    const kept = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/104', password: STUDENT_PW, remember: true });
    expect(kept.headers['set-cookie'][0]).toMatch(/Max-Age=2592000/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Activation from the student registry', () => {
  const start = (body) => request(app).post('/api/auth/activate/start').send(body);

  test('TC-I5 every activation request gets the same answer; only an eligible one sends email', async () => {
    const cases = [
      { registrationNumber: 'S24B23/106', fullName: 'Mercy Nambi' },            // eligible
      { registrationNumber: 'S99B99/999', fullName: 'Nobody Here' },            // not in registry
      { registrationNumber: 'S24B23/107', fullName: 'Wrong Name' },             // name mismatch
      { registrationNumber: 'S22B23/044', fullName: 'Samuel Opio' },            // graduated
      { registrationNumber: 'S24B23/101', fullName: 'Daniel Okello' },          // already activated
      { registrationNumber: 'S24B23/108', fullName: 'Patience Akello' },        // no email on file
    ];
    const before = Number((await db.query('SELECT COUNT(*) AS n FROM email_outbox'))[0].n);
    const answers = [];
    for (const c of cases) answers.push(await start(c));
    answers.forEach((a) => { expect(a.status).toBe(202); expect(a.body).toEqual(answers[0].body); });
    const after = Number((await db.query('SELECT COUNT(*) AS n FROM email_outbox'))[0].n);
    expect(after - before).toBe(1);
    expect((await latestEmail('nambi@students.ucu.test')).code).toMatch(/^\d{6}$/);
    const outcomes = (await db.query(
      "SELECT JSON_UNQUOTE(JSON_EXTRACT(details, '$.outcome')) AS o FROM audit_logs WHERE action = 'account.activation_requested' ORDER BY id")).map((r) => r.o);
    expect(outcomes).toEqual(['sent', 'not_in_registry', 'name_mismatch', 'registry_graduated', 'already_activated', 'no_email_on_file']);
  });

  test('TC-I6 name matching ignores case, spacing and word order', async () => {
    await start({ registrationNumber: 's24b23/107', fullName: '  ssemwogerere   IVAN ' });
    expect((await latestEmail('ssemwogerere@students.ucu.test'))?.code).toMatch(/^\d{6}$/);
  });

  test('TC-I7 code -> ticket -> password creates the account and signs the student in', async () => {
    await start({ registrationNumber: 'S24B23/106', fullName: 'Mercy Nambi' });
    const { code } = await latestEmail('nambi@students.ucu.test');
    const wrong = await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/106', code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    const ok = await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/106', code });
    expect(ok.status).toBe(200);
    expect(ok.body.fullName).toBe('Mercy Nambi');

    // A weak password is refused and the ticket stays usable.
    const weak = await request(app).post('/api/auth/activate/complete').send({ ticket: ok.body.ticket, password: 'password123', confirmPassword: 'password123' });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.password).toMatch(/too common/);
    const withReg = await request(app).post('/api/auth/activate/complete').send({ ticket: ok.body.ticket, password: 'Mine-S24B23106x', confirmPassword: 'Mine-S24B23106x' });
    expect(withReg.body.fields.password).toMatch(/registration number/);

    const agent = request.agent(app);
    const done = await agent.post('/api/auth/activate/complete').send({ ticket: ok.body.ticket, password: NEW_PW, confirmPassword: NEW_PW });
    expect(done.status).toBe(201);
    expect((await agent.get('/api/auth/me')).body.user.registrationNumber).toBe('S24B23/106');
    const [u] = await db.query("SELECT email, password_hash FROM users WHERE registration_number = 'S24B23/106'");
    expect(u.email).toBe('nambi@students.ucu.test');
    expect(u.password_hash).toMatch(/^\$2[aby]\$12\$/);

    const again = await request(app).post('/api/auth/activate/complete').send({ ticket: ok.body.ticket, password: NEW_PW, confirmPassword: NEW_PW });
    expect(again.status).toBe(400); // tickets are single use
  });

  test('TC-I8 the emailed link works instead of the code', async () => {
    const { token } = await latestEmail('ssemwogerere@students.ucu.test');
    const ok = await request(app).post('/api/auth/activate/verify').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.registrationNumber).toBe('S24B23/107');
  });

  test('TC-I9 five wrong codes void the code, even if the right one is tried next', async () => {
    await db.query("DELETE FROM users WHERE registration_number = 'S24B23/107'");
    await start({ registrationNumber: 'S24B23/107', fullName: 'Ivan Ssemwogerere' });
    const { code } = await latestEmail('ssemwogerere@students.ucu.test');
    const wrongCode = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/107', code: wrongCode });
    }
    const late = await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/107', code });
    expect(late.status).toBe(400);
  });

  test('TC-I9b four wrong codes still leave the right code usable (the limit is exactly 5)', async () => {
    await db.query("DELETE FROM verification_tokens WHERE registration_number = 'S24B23/107'");
    await start({ registrationNumber: 'S24B23/107', fullName: 'Ivan Ssemwogerere' });
    const { code } = await latestEmail('ssemwogerere@students.ucu.test');
    const wrongCode = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/107', code: wrongCode });
    }
    const ok = await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/107', code });
    expect(ok.status).toBe(200);
  });

  test('TC-I10 expired codes are refused', async () => {
    await db.query("DELETE FROM verification_tokens WHERE registration_number = 'S24B23/107'");
    await start({ registrationNumber: 'S24B23/107', fullName: 'Ivan Ssemwogerere' });
    const { code } = await latestEmail('ssemwogerere@students.ucu.test');
    await db.query("UPDATE verification_tokens SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE registration_number = 'S24B23/107'");
    const res = await request(app).post('/api/auth/activate/verify').send({ registrationNumber: 'S24B23/107', code });
    expect(res.status).toBe(400);
  });

  test('TC-I11 at most 3 codes per registration number per hour', async () => {
    await db.query("DELETE FROM verification_tokens WHERE registration_number = 'S24B23/107'");
    const before = await emailCount('ssemwogerere@students.ucu.test');
    for (let i = 0; i < 4; i += 1) await start({ registrationNumber: 'S24B23/107', fullName: 'Ivan Ssemwogerere' });
    expect(await emailCount('ssemwogerere@students.ucu.test') - before).toBe(3);
  });

  test('TC-I12 a student with no email is activated with an office-issued link', async () => {
    expect((await viewer.post('/api/admin/registry/S24B23%2F108/activation-link')).status).toBe(403);
    const issued = await officer.post('/api/admin/registry/S24B23%2F108/activation-link');
    expect(issued.status).toBe(200);
    const token = new URL(issued.body.link).searchParams.get('token');
    const v = await request(app).post('/api/auth/activate/verify').send({ token });
    expect(v.status).toBe(200);
    const done = await request(app).post('/api/auth/activate/complete').send({ ticket: v.body.ticket, password: NEW_PW, confirmPassword: NEW_PW });
    expect(done.status).toBe(201);
    const [log] = await db.query("SELECT details FROM audit_logs WHERE action = 'account.activated' ORDER BY id DESC LIMIT 1");
    expect(log.details.via).toBe('office_link');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Password recovery', () => {
  test('TC-I13 forgot-password answers the same for unknown and real accounts', async () => {
    const unknown = await request(app).post('/api/auth/password/forgot').send({ registrationNumber: 'S99B99/999' });
    const real = await request(app).post('/api/auth/password/forgot').send({ registrationNumber: 'S24B23/102' });
    expect(unknown.status).toBe(202);
    expect(real.status).toBe(202);
    expect(unknown.body).toEqual(real.body);
    expect((await latestEmail('namusoke@students.ucu.test')).subject).toMatch(/Reset/);
  });

  test('TC-I14 reset changes the password, ends every session, clears the lockout and emails a notice', async () => {
    const before = await studentAgent('S24B23/102');
    await db.query("UPDATE users SET failed_logins = 3 WHERE registration_number = 'S24B23/102'");
    const { code } = await latestEmail('namusoke@students.ucu.test');
    const v = await request(app).post('/api/auth/password/verify').send({ registrationNumber: 'S24B23/102', code });
    expect(v.status).toBe(200);
    const same = await request(app).post('/api/auth/password/reset').send({ ticket: v.body.ticket, password: STUDENT_PW, confirmPassword: STUDENT_PW });
    expect(same.body.fields.password).toMatch(/haven’t used/);
    const mismatch = await request(app).post('/api/auth/password/reset').send({ ticket: v.body.ticket, password: NEW_PW, confirmPassword: 'different' });
    expect(mismatch.body.fields.confirmPassword).toMatch(/don’t match/);
    const ok = await request(app).post('/api/auth/password/reset').send({ ticket: v.body.ticket, password: NEW_PW, confirmPassword: NEW_PW });
    expect(ok.status).toBe(200);

    expect((await before.get('/api/me/reports')).status).toBe(401); // old session revoked
    expect((await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/102', password: STUDENT_PW })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/102', password: NEW_PW })).status).toBe(200);
    expect((await latestEmail('namusoke@students.ucu.test')).subject).toMatch(/password was changed/);
    const reuse = await request(app).post('/api/auth/password/reset').send({ ticket: v.body.ticket, password: 'Another-Pass-77', confirmPassword: 'Another-Pass-77' });
    expect(reuse.status).toBe(400);
  });

  test('TC-I15 a reset code issued for one account does not work for another', async () => {
    await request(app).post('/api/auth/password/forgot').send({ registrationNumber: 'S24B23/104' });
    const { code } = await latestEmail('atim@students.ucu.test');
    const other = await request(app).post('/api/auth/password/verify').send({ registrationNumber: 'S24B23/105', code });
    expect(other.status).toBe(400);
  });

  test('TC-I16 an officer can issue a one-time reset link for a student to use in person', async () => {
    const [kato] = await db.query("SELECT id FROM users WHERE registration_number = 'S24B23/105'");
    const issued = await officer.post(`/api/admin/students/${kato.id}/reset-link`);
    expect(issued.status).toBe(200);
    const token = new URL(issued.body.link).searchParams.get('token');
    const v = await request(app).post('/api/auth/password/verify').send({ token });
    expect(v.body.purpose).toBe('password_reset');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Administrators, roles and permissions', () => {
  test('TC-I17 roles are enforced on the server', async () => {
    const student = await studentAgent('S24B23/101');
    expect((await student.get('/api/admin/students')).status).toBe(403);
    expect((await viewer.get('/api/admin/stats')).status).toBe(200);
    expect((await viewer.get('/api/admin/claims')).status).toBe(200);
    expect((await viewer.post('/api/admin/claims/1/reject').send({ reason: 'Not allowed for viewers' })).status).toBe(403);
    expect((await viewer.get('/api/admin/students')).status).toBe(403);
    expect((await officer.get('/api/admin/students')).status).toBe(200);
    expect((await officer.get('/api/admin/admins')).status).toBe(403);
    expect((await officer.post('/api/admin/registry/import').field('currentPassword', ADMIN_PW)).status).toBe(403);
  });

  test('TC-I18 inviting an administrator needs your own password, and the invite sets theirs', async () => {
    const body = { fullName: 'Joseph Mukasa', staffId: 'staff-0200', email: 'mukasa@lostfound.ucu.test', roleCode: 'officer' };
    const noPw = await superAdmin.post('/api/admin/admins').send({ ...body, currentPassword: 'wrong' });
    expect(noPw.status).toBe(400);
    expect(noPw.body.fields.currentPassword).toBeDefined();
    const created = await superAdmin.post('/api/admin/admins').send({ ...body, currentPassword: ADMIN_PW });
    expect(created.status).toBe(201);
    const dup = await superAdmin.post('/api/admin/admins').send({ ...body, email: 'other@lostfound.ucu.test', currentPassword: ADMIN_PW });
    expect(dup.status).toBe(409);
    expect(dup.body.fields.staffId).toMatch(/already in use/);

    const invite = await latestEmail('mukasa@lostfound.ucu.test');
    expect(invite.body_text).toContain('STAFF-0200');
    const v = await request(app).post('/api/auth/password/verify').send({ token: invite.token });
    expect(v.body.purpose).toBe('admin_invite');
    expect((await request(app).post('/api/auth/password/reset').send({ ticket: v.body.ticket, password: NEW_PW, confirmPassword: NEW_PW })).status).toBe(200);
    const mukasa = await adminAgent('STAFF-0200', NEW_PW);
    const me = (await mukasa.get('/api/auth/me')).body.user;
    expect(me.adminRole.code).toBe('officer');
    expect(me.permissions).not.toContain('admins.manage');
  });

  test('TC-I19 changing a role signs the person out; nobody can change their own role', async () => {
    const [m] = await db.query("SELECT id FROM users WHERE staff_id = 'STAFF-0200'");
    const mukasa = await adminAgent('STAFF-0200', NEW_PW);
    expect((await superAdmin.patch(`/api/admin/admins/${m.id}`).send({ roleCode: 'viewer' })).status).toBe(200);
    expect((await mukasa.get('/api/admin/stats')).status).toBe(401);
    const [me] = await db.query("SELECT id FROM users WHERE staff_id = 'STAFF-0001'");
    expect((await superAdmin.patch(`/api/admin/admins/${me.id}`).send({ roleCode: 'officer' })).status).toBe(403);
  });

  test('TC-I20 admins cannot deactivate themselves; a super admin can demote another super admin', async () => {
    await makeAdmin('STAFF-0300', 'super_admin', 'second-super@lostfound.ucu.test');
    const second = await adminAgent('STAFF-0300');
    const [row] = await db.query("SELECT id FROM users WHERE staff_id = 'STAFF-0300'");
    expect((await second.post(`/api/admin/admins/${row.id}/deactivate`).send({ reason: 'Trying to deactivate myself' })).status).toBe(403);
    expect((await superAdmin.patch(`/api/admin/admins/${row.id}`).send({ roleCode: 'officer' })).status).toBe(200);
    expect((await second.get('/api/admin/admins')).status).toBe(401); // signed out by the role change
    expect((await superAdmin.post(`/api/admin/admins/${row.id}/deactivate`).send({ reason: 'No longer on the team' })).status).toBe(200);
    expect((await request(app).post('/api/auth/admin/login').send({ staffId: 'STAFF-0300', password: ADMIN_PW })).body.error).toMatch(/deactivated/);
  });

  test('TC-I21 deactivating a student signs them out and blocks sign-in with a clear message', async () => {
    const atim = await studentAgent('S24B23/104');
    const [u] = await db.query("SELECT id FROM users WHERE registration_number = 'S24B23/104'");
    expect((await officer.post(`/api/admin/students/${u.id}/deactivate`).send({ reason: 'Misuse of the claims process' })).status).toBe(200);
    expect((await atim.get('/api/me/reports')).status).toBe(401);
    const wrongPw = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/104', password: 'wrong-password' });
    expect(wrongPw.body.error).toMatch(/incorrect/); // no hint without the right password
    const rightPw = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/104', password: STUDENT_PW });
    expect(rightPw.status).toBe(401);
    expect(rightPw.body.error).toMatch(/deactivated/);
    expect((await officer.post(`/api/admin/students/${u.id}/reactivate`)).status).toBe(200);
    await db.query('UPDATE users SET failed_logins = 0 WHERE id = ?', [u.id]);
    expect((await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/104', password: STUDENT_PW })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Student registry import', () => {
  const csv = [
    'registration_number,full_name,university_email,programme,status',
    'S25B23/001,Aisha Nakato,nakato@students.ucu.test,BSc Computer Science,enrolled',
    '"s25b23/002","Okot, Peter",okot@students.ucu.test,"BSc ""Hons"" IT",',
    'S24B23/101,Daniel Okello,okello@students.ucu.test,BSc Computer Science,withdrawn',
    'BAD ID!!,Someone,someone@x.test,,enrolled',
    'S25B23/003,A,not-an-email,,expelled',
    'S25B23/001,Aisha Nakato Again,,,enrolled',
  ].join('\r\n');
  const upload = (agent, { dryRun = false, password = ADMIN_PW, content = csv, name = 'registry.csv' } = {}) =>
    agent.post(`/api/admin/registry/import${dryRun ? '?dryRun=true' : ''}`)
      .field('currentPassword', password)
      .attach('file', Buffer.from(content), name);

  test('TC-I22 a dry run reports what would change and saves nothing', async () => {
    const res = await upload(superAdmin, { dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, totalRows: 6, added: 2, updated: 1, unchanged: 0, rejectedCount: 3 });
    expect((await db.query("SELECT COUNT(*) AS n FROM student_registry WHERE registration_number LIKE 'S25B23/%'"))[0].n).toBe(0);
  });

  test('TC-I23 the import saves valid rows and lists rejected ones by line', async () => {
    const res = await upload(superAdmin);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ added: 2, updated: 1, rejectedCount: 3 });
    expect(res.body.rejected.map((r) => r.line)).toEqual([5, 6, 7]);
    expect(res.body.rejected[2].errors[0]).toMatch(/Duplicate of line 2/);
    const [peter] = await db.query("SELECT * FROM student_registry WHERE registration_number = 'S25B23/002'");
    expect(peter).toMatchObject({ full_name: 'Okot, Peter', programme: 'BSc "Hons" IT', status: 'enrolled' });
    const [okello] = await db.query("SELECT status FROM student_registry WHERE registration_number = 'S24B23/101'");
    expect(okello.status).toBe('withdrawn');
    const [log] = await db.query("SELECT * FROM audit_logs WHERE action = 'registry.imported' ORDER BY id DESC LIMIT 1");
    expect(log.entity_id).toBe(String(res.body.importId));
  });

  test('TC-I24 import needs your password, a CSV file and the right header', async () => {
    expect((await upload(superAdmin, { password: 'wrong' })).status).toBe(400);
    expect((await upload(superAdmin, { name: 'registry.xlsx' })).status).toBe(400);
    const badHeader = await upload(superAdmin, { content: 'reg,name\nS1,X' });
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error).toMatch(/missing: registration_number/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Audit log', () => {
  test('TC-I25 security events are recorded and readable only with audit.view', async () => {
    expect((await viewer.get('/api/admin/audit')).status).toBe(403);
    const res = await officer.get('/api/admin/audit?action=student.');
    expect(res.status).toBe(200);
    const actions = res.body.items.map((i) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['student.deactivated', 'student.reactivated', 'student.reset_link_issued']));
    const deact = res.body.items.find((i) => i.action === 'student.deactivated');
    expect(deact.details.reason).toBe('Misuse of the claims process');
    expect(deact.actorName).toBe('Test officer');
    const all = (await superAdmin.get('/api/admin/audit')).body;
    expect(all.total).toBeGreaterThan(10);
    expect(JSON.stringify(all)).not.toMatch(/\b\d{6}\b.*code|password_hash|TestOnly/);
  });
});
