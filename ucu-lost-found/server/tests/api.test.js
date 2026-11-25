/**
 * Automated API tests (Jest + Supertest) against a real MySQL test database.
 * The test database (ucu_lost_found_test) is rebuilt from the migrations + seed.sql before the suite.
 * Run:  npm test
 */
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const setupDb = require('../scripts/setup-db');

const bcrypt = require('bcryptjs');

// Test-only passwords, applied to the throwaway TEST database below.
// The real assessment logins are NOT in the repository (submitted privately on Moodle).
const STUDENT_PW = 'TestOnly-Student-1';
const ADMIN_PW = 'TestOnly-Admin-1';

/** Students sign in with their registration number, administrators with their staff ID. */
async function loginAs(registrationNumber, password = STUDENT_PW) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ registrationNumber, password });
  expect(res.status).toBe(200);
  return agent;
}

async function loginAdmin(staffId = 'STAFF-0001', password = ADMIN_PW) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/admin/login').send({ staffId, password });
  expect(res.status).toBe(200);
  return agent;
}

const validFound = {
  type: 'found', title: 'Blue umbrella', categoryId: 10, description: 'Blue folding umbrella left by the door.',
  identifyingDetails: 'Handle has a crack and a name tag reading "JK".', eventDate: '2026-11-01', locationId: 2,
};

let okello; let namusoke; let mugisha; let atim; let kato; let admin;

beforeAll(async () => {
  await setupDb({ database: config.db.database, quiet: true });
  await db.query('UPDATE users SET password_hash = ? WHERE role = ?', [bcrypt.hashSync(STUDENT_PW, 4), 'student']);
  await db.query('UPDATE users SET password_hash = ? WHERE role = ?', [bcrypt.hashSync(ADMIN_PW, 4), 'admin']);
  [okello, namusoke, mugisha, atim, kato] = await Promise.all([
    loginAs('S24B23/101'), loginAs('S24B23/102'), loginAs('S24B23/103'), loginAs('S24B23/104'), loginAs('S24B23/105'),
  ]);
  admin = await loginAdmin();
}, 60000);

afterAll(async () => { await db.pool.end(); });

// ---------------------------------------------------------------------------
describe('Accounts and authentication', () => {
  test('TC-A1 open sign-up is gone; accounts come from the registry', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ fullName: 'Test Student', email: 'new@students.ucu.test', password: 'Passw0rd!' });
    expect(res.status).toBe(410);
  });

  test('TC-A2 login is by registration number, normalised (case and spaces ignored)', async () => {
    const res = await request(app).post('/api/auth/login').send({ registrationNumber: ' s24b23 /105 ', password: STUDENT_PW });
    expect(res.status).toBe(200);
    expect(res.body.user.registrationNumber).toBe('S24B23/105');
    expect(res.body.user.role).toBe('student');
  });

  test('TC-A3 email is no longer accepted as the student identifier', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'kato@students.ucu.test', password: STUDENT_PW });
    expect(res.status).toBe(400);
    expect(res.body.fields.registrationNumber).toMatch(/required/);
  });

  test('TC-A4 unsuccessful login gives a generic message', async () => {
    const wrongPw = await request(app).post('/api/auth/login').send({ registrationNumber: 'S24B23/101', password: 'wrong' });
    const noUser = await request(app).post('/api/auth/login').send({ registrationNumber: 'S99X99/999', password: 'wrong' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error).toBe(noUser.body.error);
    await db.query('UPDATE users SET failed_logins = 0 WHERE registration_number = ?', ['S24B23/101']);
  });

  test('TC-A5 logout ends authenticated access even if the old cookie is replayed', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ registrationNumber: 'S24B23/105', password: STUDENT_PW });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await agent.get('/api/auth/me')).body.user.registrationNumber).toBe('S24B23/105');
    await agent.post('/api/auth/logout');
    const replay = await request(app).get('/api/me/reports').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });

  test('TC-A6 protected routes need login', async () => {
    expect((await request(app).post('/api/reports').send(validFound)).status).toBe(401);
    expect((await request(app).get('/api/me/claims')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('Reports, privacy and search', () => {
  test('TC-R1 create report validates input (future date, short description, bad category)', async () => {
    const res = await okello.post('/api/reports')
      .send({ ...validFound, description: 'short', eventDate: '2999-01-01', categoryId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.fields.description).toBeDefined();
    expect(res.body.fields.eventDate).toMatch(/future/);
    expect(res.body.fields.categoryId).toBeDefined();
  });

  test('TC-R2 private details never appear in public list or public detail', async () => {
    const created = await namusoke.post('/api/reports').send(validFound);
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/reports').query({ q: 'umbrella' });
    expect(JSON.stringify(list.body)).not.toMatch(/JK/);
    expect(list.body.items[0]).not.toHaveProperty('identifyingDetails');
    expect(list.body.items[0]).not.toHaveProperty('user_id');
    const asOther = await okello.get(`/api/reports/${created.body.id}`);
    expect(asOther.body.report.identifyingDetails).toBeUndefined();
    const asOwner = await namusoke.get(`/api/reports/${created.body.id}`);
    expect(asOwner.body.report.identifyingDetails).toMatch(/JK/);
    const asAdmin = await admin.get(`/api/reports/${created.body.id}`);
    expect(asAdmin.body.report.identifyingDetails).toMatch(/JK/);
  });

  test('TC-R3 a student cannot edit another student\'s report', async () => {
    const res = await okello.put('/api/reports/1').send({ ...validFound, title: 'Hijacked' });
    expect(res.status).toBe(403);
    const [row] = await db.query('SELECT title FROM reports WHERE id = 1');
    expect(row.title).toBe('Set of keys with a blue keyring');
  });

  test('TC-R4 owner can edit own open report', async () => {
    const res = await namusoke.put('/api/reports/1').send({
      type: 'found', title: 'Set of keys with a blue keyring', categoryId: 1, locationId: 1,
      description: 'Three keys on a blue plastic keyring, found under a chair in N5B.',
      identifyingDetails: 'Inscription "D.O. RM 14" on the back.', eventDate: '2026-11-17',
    });
    expect(res.status).toBe(200);
  });

  test('TC-R5 search filters by keyword, type, category, location and date', async () => {
    const res = await request(app).get('/api/reports')
      .query({ q: 'keyring', type: 'found', categoryId: 1, locationId: 1, dateFrom: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const it of res.body.items) {
      expect(it.type).toBe('found'); expect(it.categoryId).toBe(1); expect(it.locationId).toBe(1);
    }
    const returned = await request(app).get('/api/reports').query({ status: 'returned' });
    expect(returned.body.items.every((i) => ['returned', 'closed'].includes(i.status))).toBe(true);
  });

  test('TC-R6 non-image uploads are rejected', async () => {
    const res = await okello.post('/api/reports')
      .field({ ...validFound, identifyingDetails: '' })
      .attach('photos', Buffer.from('not really an image file'), { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.fields.photos).toBeDefined();
  });

  test('TC-R7 valid PNG photo is stored and served', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const res = await okello.post('/api/reports').field({ ...validFound, type: 'lost', identifyingDetails: '' })
      .attach('photos', png, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/reports/${res.body.id}`);
    const photo = await request(app).get(detail.body.report.images[0].url);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
  });
});

// ---------------------------------------------------------------------------
describe('Claims and permissions', () => {
  test('TC-C1 a student cannot claim an item they reported as found', async () => {
    const res = await namusoke.post('/api/reports/1/claims').send({ evidence: 'This is mine, I found it myself honestly.' });
    expect(res.status).toBe(403);
  });

  test('TC-C2 claim evidence is validated', async () => {
    const res = await okello.post('/api/reports/1/claims').send({ evidence: 'mine' });
    expect(res.status).toBe(400);
    expect(res.body.fields.evidence).toMatch(/at least 20/);
  });

  test('TC-C3 lost-item reports cannot be claimed', async () => {
    const res = await namusoke.post('/api/reports/2/claims').send({ evidence: 'Some long enough explanation here.' });
    expect(res.status).toBe(400);
  });

  test('TC-C4 another student cannot view someone else\'s claim', async () => {
    const res = await mugisha.get('/api/claims/1'); // claim 1 belongs to Atim
    expect(res.status).toBe(404);
    const own = await atim.get('/api/claims/1');
    expect(own.status).toBe(200);
    expect(own.body.claim.evidence).toMatch(/sunset/);
  });

  test('TC-C5 the finder cannot see claim evidence on their found item', async () => {
    const res = await mugisha.get('/api/reports/3'); // Mugisha reported the phone
    expect(JSON.stringify(res.body)).not.toMatch(/Lake Victoria/);
  });

  test('TC-C6 students cannot use admin endpoints', async () => {
    expect((await okello.get('/api/admin/claims')).status).toBe(403);
    expect((await okello.post('/api/admin/claims/1/approve')
      .send({ reason: 'I approve myself', collectionInstructions: 'Anywhere really' })).status).toBe(403);
  });

  test('TC-C7 duplicate claim by the same student is refused', async () => {
    const res = await atim.post('/api/reports/3/claims').send({ evidence: 'Trying again with another explanation.' });
    expect(res.status).toBe(409);
  });

  test('TC-C8 cannot claim an item already returned', async () => {
    const res = await okello.post('/api/reports/4/claims').send({ evidence: 'I believe this charger is mine, it has tape.' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been returned/);
  });
});

// ---------------------------------------------------------------------------
describe('Admin review, competing claims and confirmed return', () => {
  test('TC-W1 approval requires a reason and collection instructions', async () => {
    const res = await admin.post('/api/admin/claims/1/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.fields.reason).toBeDefined();
    expect(res.body.fields.collectionInstructions).toBeDefined();
  });

  test('TC-W2 competing claims: only one can be approved', async () => {
    const ok = await admin.post('/api/admin/claims/1/approve')
      .send({ reason: 'Wallpaper and sticker match private details.', collectionInstructions: 'Dean of Students office, 9am–4pm' });
    expect(ok.status).toBe(200);
    const second = await admin.post('/api/admin/claims/2/approve')
      .send({ reason: 'Also plausible', collectionInstructions: 'Dean of Students office' });
    expect(second.status).toBe(409);
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM claims WHERE report_id = 3 AND status IN ('approved','collected')");
    expect(n).toBe(1);
  });

  test('TC-W3 the database itself blocks a second approved claim', async () => {
    await expect(db.query("UPDATE claims SET status='approved' WHERE id = 2")).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  test('TC-W4 new claims are refused while an approved claim awaits collection', async () => {
    const res = await okello.post('/api/reports/3/claims').send({ evidence: 'My phone has a sunset wallpaper as well.' });
    expect(res.status).toBe(409);
  });

  test('TC-W5 claimant sees status and admin response', async () => {
    const res = await atim.get('/api/me/claims');
    const c = res.body.items.find((i) => i.id === 1);
    expect(c.status).toBe('approved');
    expect(c.collectionInstructions).toMatch(/Dean of Students/);
  });

  test('TC-W6 return can only be confirmed for an approved claim', async () => {
    const res = await admin.post('/api/admin/claims/2/confirm-return');
    expect(res.status).toBe(409);
  });

  test('TC-W7 confirming collection marks item returned and closes competing claims', async () => {
    const res = await admin.post('/api/admin/claims/1/confirm-return');
    expect(res.status).toBe(200);
    const pub = await request(app).get('/api/reports/3');
    expect(pub.body.report.status).toBe('returned');
    const [other] = await db.query('SELECT status FROM claims WHERE id = 2');
    expect(other.status).toBe('rejected');
    const after = await okello.post('/api/reports/3/claims').send({ evidence: 'Trying to claim after return happened.' });
    expect(after.status).toBe(409);
  });

  test('TC-W8 full workflow: report found -> search -> claim -> reject/approve -> return', async () => {
    const found = await namusoke.post('/api/reports').send({ ...validFound, title: 'Red pencil case', description: 'Red zip pencil case with pens inside.' });
    const id = found.body.id;
    const search = await request(app).get('/api/reports').query({ q: 'pencil case', type: 'found' });
    expect(search.body.items.some((i) => i.id === id)).toBe(true);
    const c1 = await kato.post(`/api/reports/${id}/claims`).send({ evidence: 'Red pencil case with pens, I lost it.' });
    const c2 = await okello.post(`/api/reports/${id}/claims`).send({ evidence: 'There is a name tag reading JK on the handle area.' });
    expect(c1.status).toBe(201); expect(c2.status).toBe(201);
    expect((await admin.post(`/api/admin/claims/${c1.body.id}/reject`).send({ reason: 'No identifying detail given.' })).status).toBe(200);
    expect((await admin.post(`/api/admin/claims/${c2.body.id}/approve`)
      .send({ reason: 'Name tag matches.', collectionInstructions: 'Dean of Students office, bring ID' })).status).toBe(200);
    expect((await admin.post(`/api/admin/claims/${c2.body.id}/confirm-return`)).status).toBe(200);
    const final = await request(app).get(`/api/reports/${id}`);
    expect(final.body.report.status).toBe('returned');
    const history = await admin.get(`/api/admin/reports/${id}/history`);
    expect(history.body.items.map((h) => h.action)).toEqual(['reject_claim', 'approve_claim', 'confirm_return']);
  });

  test('TC-W9 owner cannot edit a report once it is returned', async () => {
    const res = await mugisha.put('/api/reports/3').send({ ...validFound, title: 'Changed' });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe('Photo privacy', () => {
  test('TC-R8 EXIF metadata (e.g. GPS, device) is stripped from uploaded JPEGs', async () => {
    const fs = require('fs');
    const { stripJpegMetadata } = require('../src/utils/images');
    const withExif = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'exif.jpg'));
    expect(withExif.includes('SecretPhoneMaker')).toBe(true);
    const clean = stripJpegMetadata(withExif);
    expect(clean.includes('SecretPhoneMaker')).toBe(false);
    expect(clean.slice(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const res = await okello.post('/api/reports').field({ ...validFound, type: 'lost', identifyingDetails: '' })
      .attach('photos', withExif, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/reports/${res.body.id}`);
    const photo = await request(app).get(detail.body.report.images[0].url);
    expect(photo.body.includes('SecretPhoneMaker')).toBe(false);
  });
});
