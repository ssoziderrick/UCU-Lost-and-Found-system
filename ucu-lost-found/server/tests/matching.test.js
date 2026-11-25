/**
 * Phase 4 API tests: match suggestions and notifications against the real test database.
 * Contract: docs/v2/phase-4-matching-contract.md
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const setupDb = require('../scripts/setup-db');

const STUDENT_PW = 'TestOnly-Student-1';
const ADMIN_PW = 'TestOnly-Admin-1';
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function agentFor(path, body) {
  const agent = request.agent(app);
  expect((await agent.post(path).send(body)).status).toBe(200);
  return agent;
}
const userId = async (reg) => (await db.query('SELECT id FROM users WHERE registration_number = ?', [reg]))[0].id;
const notes = async (uid, type) => db.query('SELECT * FROM notifications WHERE user_id = ? AND type = ? ORDER BY id', [uid, type]);
const matchRow = async (lost, found) => (await db.query('SELECT * FROM item_matches WHERE lost_report_id = ? AND found_report_id = ?', [lost, found]))[0];

let okello; let namusoke; let mugisha; let admin; let viewer; let m;
const ids = {};
const report = (agent, fields) => agent.post('/api/reports').field({ eventDate: today(), ...fields });

beforeAll(async () => {
  await setupDb({ database: config.db.database, quiet: true });
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'student'", [bcrypt.hashSync(STUDENT_PW, 4)]);
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'admin'", [bcrypt.hashSync(ADMIN_PW, 4)]);
  await db.query(
    `INSERT INTO users (full_name, email, staff_id, password_hash, role, admin_role_id)
     VALUES ('Test viewer', 'viewer@lostfound.ucu.test', 'STAFF-0102', ?, 'admin', (SELECT id FROM admin_roles WHERE code = 'viewer'))`,
    [bcrypt.hashSync(ADMIN_PW, 4)]);
  okello = await agentFor('/api/auth/login', { registrationNumber: 'S24B23/101', password: STUDENT_PW });
  namusoke = await agentFor('/api/auth/login', { registrationNumber: 'S24B23/102', password: STUDENT_PW });
  mugisha = await agentFor('/api/auth/login', { registrationNumber: 'S24B23/103', password: STUDENT_PW });
  admin = await agentFor('/api/auth/admin/login', { staffId: 'STAFF-0001', password: ADMIN_PW });
  viewer = await agentFor('/api/auth/admin/login', { staffId: 'STAFF-0102', password: ADMIN_PW });
  m = (await request(app).get('/api/reports/meta')).body;
  for (const [k, n] of [['calculators', 'Calculators & Academic Equipment'], ['bottles', 'Water Bottles & Flasks'], ['books', 'Books & Stationery']]) {
    ids[k] = m.categories.find((c) => c.name === n).id;
  }
  for (const [k, n] of [['nBlock', 'N Block'], ['kBlock', 'K Block'], ['nkoyoyo', 'Nkoyoyo Hall'], ['football', 'Football Pitch']]) {
    ids[k] = m.locations.find((l) => l.name === n).id;
  }
}, 60000);

afterAll(async () => { await db.pool.end(); });

// ---------------------------------------------------------------------------------------------
describe('Suggestions', () => {
  test('TC-M1 db:setup scores the sample data: the v1 keys scenario is suggested and notified', async () => {
    const res = await okello.get('/api/me/matches');
    const keys = res.body.items.find((x) => x.lostId === 2 && x.foundId === 1);
    expect(keys).toMatchObject({ strength: 'strong', status: 'suggested' });
    expect(keys.reasons).toEqual(expect.arrayContaining(['Same category', 'Same place']));
    expect(keys.found.refCode).toBe('FD-000001');
    const [note] = await notes(await userId('S24B23/101'), 'match_found');
    expect(note).toMatchObject({ title: 'Potential match found!', link: '/reports/1', dedupe_key: 'match:2:1' });
    expect(note.emailed_at).not.toBeNull();
  });

  test('TC-M2 suggestions show only the found item’s public fields', async () => {
    const res = await okello.get('/api/me/matches');
    expect(JSON.stringify(res.body)).not.toMatch(/D\.O\. RM 14|identifying|custodyNote/);
  });

  test('TC-M3 a new found report notifies the owner of a matching lost report, never the finder', async () => {
    const lost = await report(okello, { type: 'lost', title: 'Calculator', categoryId: ids.calculators, locationId: ids.nBlock,
      description: 'Casio scientific calculator, grey, lost after the maths exam.' });
    const found = await report(namusoke, { type: 'found', title: 'Calculator', categoryId: ids.calculators, locationId: ids.nBlock,
      description: 'Grey calculator found on a desk in N Block.', identifyingDetails: 'Name R. OKOT inside the cover' });
    ids.lostCalc = lost.body.id; ids.foundCalc = found.body.id;
    const row = await matchRow(ids.lostCalc, ids.foundCalc);
    expect(Number(row.score)).toBeGreaterThanOrEqual(0.7);
    const okelloNotes = await notes(await userId('S24B23/101'), 'match_found');
    expect(okelloNotes.map((n) => n.dedupe_key)).toContain(`match:${ids.lostCalc}:${ids.foundCalc}`);
    expect(okelloNotes.find((n) => n.dedupe_key === `match:${ids.lostCalc}:${ids.foundCalc}`).body).toMatch(/A newly reported calculator at N Block may match “Calculator”/);
    expect(await notes(await userId('S24B23/102'), 'match_found')).toHaveLength(0);
    expect(JSON.stringify((await okello.get('/api/me/matches')).body)).not.toMatch(/OKOT/);
  });

  test('TC-M4 re-scoring never sends the same notification twice', async () => {
    const body = { type: 'lost', title: 'Calculator', categoryId: ids.calculators, locationId: ids.nBlock, eventDate: today(),
      description: 'Casio scientific calculator, grey, lost after the maths exam. Has a black cover.' };
    expect((await okello.put(`/api/reports/${ids.lostCalc}`).send(body)).status).toBe(200);
    await db.query('UPDATE item_matches SET notified_at = NULL WHERE lost_report_id = ? AND found_report_id = ?', [ids.lostCalc, ids.foundCalc]);
    expect((await okello.put(`/api/reports/${ids.lostCalc}`).send(body)).status).toBe(200); // pretend a crash lost notified_at
    const all = await db.query('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = ?', [`match:${ids.lostCalc}:${ids.foundCalc}`]);
    expect(all[0].n).toBe(1);
  });

  test('TC-M5 lost-vs-lost, found-vs-found and same-person pairs are never matched', async () => {
    const a = await report(mugisha, { type: 'lost', title: 'Water bottle', categoryId: ids.bottles, locationId: ids.kBlock, description: 'Blue steel water bottle.' });
    const b = await report(namusoke, { type: 'lost', title: 'Water bottle', categoryId: ids.bottles, locationId: ids.kBlock, description: 'Blue steel water bottle.' });
    const c = await report(mugisha, { type: 'found', title: 'Water bottle', categoryId: ids.bottles, locationId: ids.kBlock, description: 'Blue steel water bottle.' });
    const pairs = await db.query('SELECT lost_report_id AS l, found_report_id AS f FROM item_matches WHERE lost_report_id IN (?) OR found_report_id IN (?)',
      [[a.body.id, b.body.id, c.body.id], [a.body.id, b.body.id, c.body.id]]);
    expect(pairs).toContainEqual({ l: b.body.id, f: c.body.id });    // different people, lost vs found: yes
    expect(pairs).not.toContainEqual({ l: a.body.id, f: c.body.id }); // same person
    expect(pairs.every((p) => p.l !== p.f)).toBe(true);
    const types = await db.query('SELECT l.type AS lt, f.type AS ft FROM item_matches m JOIN reports l ON l.id = m.lost_report_id JOIN reports f ON f.id = m.found_report_id');
    expect(types.every((t) => t.lt === 'lost' && t.ft === 'found')).toBe(true);
  });

  test('TC-M6 a weaker match is listed as “possible” without a notification', async () => {
    const lost = await report(mugisha, { type: 'lost', title: 'Water bottle', categoryId: ids.bottles, locationId: ids.nkoyoyo, eventDate: daysAgo(11), description: 'Green metal bottle, bamboo lid.' });
    const found = await report(okello, { type: 'found', title: 'Flask', categoryId: ids.bottles, locationId: ids.football, description: 'Thermos flask left on a bench.' });
    const row = await matchRow(lost.body.id, found.body.id);
    expect(Number(row.score)).toBeGreaterThanOrEqual(0.5);
    expect(Number(row.score)).toBeLessThan(0.7);
    expect(row.notified_at).toBeNull();
    const mine = (await mugisha.get(`/api/me/matches?reportId=${lost.body.id}`)).body.items;
    expect(mine.find((x) => x.foundId === found.body.id).strength).toBe('possible');
  });

  test('TC-M7 a look-alike in a related category is not suggested at all', async () => {
    const found = await report(namusoke, { type: 'found', title: 'Calculus textbook', categoryId: ids.books, locationId: ids.nBlock, description: 'Thick calculus textbook.' });
    expect(await matchRow(ids.lostCalc, found.body.id)).toBeUndefined();
  });

  test('TC-M8 “not mine” hides a suggestion for good, even after re-scoring', async () => {
    const [mt] = (await okello.get(`/api/me/matches?reportId=${ids.lostCalc}`)).body.items.filter((x) => x.foundId === ids.foundCalc);
    expect((await namusoke.post(`/api/me/matches/${mt.id}/dismiss`)).status).toBe(404); // not her report
    expect((await okello.post(`/api/me/matches/${mt.id}/dismiss`)).status).toBe(200);
    expect((await okello.get(`/api/me/matches?reportId=${ids.lostCalc}`)).body.items.map((x) => x.foundId)).not.toContain(ids.foundCalc);
    await namusoke.put(`/api/reports/${ids.foundCalc}`).send({ type: 'found', title: 'Calculator', categoryId: ids.calculators, locationId: ids.nBlock,
      eventDate: today(), description: 'Grey calculator found on a desk in N Block, near the window.' });
    expect((await matchRow(ids.lostCalc, ids.foundCalc)).status).toBe('dismissed');
    await db.query("UPDATE item_matches SET status = 'suggested', dismissed_at = NULL WHERE lost_report_id = ? AND found_report_id = ?", [ids.lostCalc, ids.foundCalc]);
  });

  test('TC-M9 removing a found report expires its suggestions; restoring brings them back without re-notifying', async () => {
    expect((await admin.post(`/api/admin/reports/${ids.foundCalc}/remove`).send({ reason: 'Checking the matching rules' })).status).toBe(200);
    expect((await matchRow(ids.lostCalc, ids.foundCalc)).status).toBe('expired');
    expect((await okello.get('/api/me/matches')).body.items.map((x) => x.foundId)).not.toContain(ids.foundCalc);
    expect((await admin.post(`/api/admin/reports/${ids.foundCalc}/restore`)).status).toBe(200);
    expect((await matchRow(ids.lostCalc, ids.foundCalc)).status).toBe('suggested');
    expect((await db.query('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = ?', [`match:${ids.lostCalc}:${ids.foundCalc}`]))[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Claims, returns and notifications', () => {
  test('TC-M10 claiming a suggested item marks it claimed and confirms receipt to the claimant', async () => {
    const claim = await okello.post(`/api/reports/${ids.foundCalc}/claims`).send({ evidence: 'My name, R. OKOT, is written in silver inside the cover.' });
    expect(claim.status).toBe(201);
    ids.claim = claim.body.id;
    expect((await matchRow(ids.lostCalc, ids.foundCalc)).status).toBe('claimed');
    const [note] = await notes(await userId('S24B23/101'), 'claim_submitted');
    expect(note.link).toBe(`/my/claims/${ids.claim}`);
    const competing = await mugisha.post(`/api/reports/${ids.foundCalc}/claims`).send({ evidence: 'I think it is mine, I lost a calculator that day.' });
    ids.competing = competing.body.id;
  });

  test('TC-M11 approval and return notify the right people, and the competing claimant hears it was closed', async () => {
    expect((await admin.post(`/api/admin/claims/${ids.claim}/approve`).send({ reason: 'Name inside the cover matches.', collectionInstructions: 'Collect from the lost-property desk, 9am–4pm.' })).status).toBe(200);
    const [approved] = await notes(await userId('S24B23/101'), 'claim_approved');
    expect(approved.body).toMatch(/Collect from the lost-property desk/);
    expect(approved.emailed_at).not.toBeNull();
    expect((await matchRow(ids.lostCalc, ids.foundCalc)).status).toBe('claimed'); // claimed stays claimed

    expect((await admin.post(`/api/admin/claims/${ids.claim}/confirm-return`)).status).toBe(200);
    expect(await notes(await userId('S24B23/101'), 'item_returned')).toHaveLength(1);
    const [finder] = await notes(await userId('S24B23/102'), 'item_returned');
    expect(finder.title).toMatch(/back with its owner/);
    const [closed] = await notes(await userId('S24B23/103'), 'claim_rejected');
    expect(closed.body).toMatch(/returned to its verified owner/);
    expect(closed.dedupe_key).toBe(`claim:${ids.competing}:rejected`);
  });

  test('TC-M12 notification centre: unread count, mark some or all read, only your own', async () => {
    const before = (await okello.get('/api/me/notifications/unread-count')).body.count;
    expect(before).toBeGreaterThan(2);
    const list = (await okello.get('/api/me/notifications')).body;
    expect(list.items[0].id).toBeGreaterThan(list.items[1].id); // newest first
    const mineId = list.items[0].id;
    const theirs = (await namusoke.get('/api/me/notifications')).body.items[0].id;
    const r = await okello.post('/api/me/notifications/read').send({ ids: [mineId, theirs] });
    expect(r.body.unread).toBe(before - 1);
    expect((await db.query('SELECT read_at FROM notifications WHERE id = ?', [theirs]))[0].read_at).toBeNull();
    expect((await okello.post('/api/me/notifications/read').send({ all: true })).body.unread).toBe(0);
    expect((await okello.get('/api/me/notifications?unread=1')).body.items).toHaveLength(0);
    expect((await request(app).get('/api/me/notifications')).status).toBe(401);
  });

  test('TC-M13 turning email off stops emails but keeps in-app notifications', async () => {
    expect((await mugisha.patch('/api/me/preferences').send({ notifyByEmail: false })).body.notifyByEmail).toBe(false);
    const lost = await report(mugisha, { type: 'lost', title: 'Umbrella', categoryId: m.categories.find((c) => c.name === 'Umbrellas').id, locationId: ids.kBlock, description: 'Black folding umbrella.' });
    await report(namusoke, { type: 'found', title: 'Black umbrella', categoryId: m.categories.find((c) => c.name === 'Umbrellas').id, locationId: ids.kBlock, description: 'Folding umbrella by the door.' });
    const [note] = (await notes(await userId('S24B23/103'), 'match_found')).filter((n) => n.dedupe_key.startsWith(`match:${lost.body.id}:`));
    expect(note).toBeDefined();
    expect(note.emailed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('Admin view and settings', () => {
  test('TC-M14 admins see the match queue with the breakdown; students cannot', async () => {
    expect((await okello.get('/api/admin/matches')).status).toBe(403);
    const res = await viewer.get('/api/admin/matches?status=suggested');
    expect(res.status).toBe(200);
    expect(res.body.items[0].breakdown.parts).toHaveProperty('name');
    expect(res.body.items[0]).toHaveProperty('lostOwner');
    expect(res.body.items.every((x, i, a) => i === 0 || a[i - 1].score >= x.score)).toBe(true);
  });

  test('TC-M15 only super admins change the weights; they must add up to 1; a change re-scores and is audited', async () => {
    const settings = { weights: { name: 0.35, category: 0.25, location: 0.2, date: 0.15, description: 0.05 }, notifyThreshold: 0.75, listThreshold: 0.5, windowDays: 30 };
    expect((await viewer.put('/api/admin/settings/matching').send(settings)).status).toBe(403);
    const bad = await admin.put('/api/admin/settings/matching').send({ ...settings, weights: { ...settings.weights, name: 0.5 } });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.weights).toMatch(/add up to 1/);
    expect((await admin.put('/api/admin/settings/matching').send({ ...settings, listThreshold: 0.8 })).status).toBe(400);
    const ok = await admin.put('/api/admin/settings/matching').send(settings);
    expect(ok.status).toBe(200);
    expect((await viewer.get('/api/admin/settings/matching')).body.settings.notifyThreshold).toBe(0.75);
    const [log] = await db.query("SELECT * FROM audit_logs WHERE action = 'settings.matching_changed' ORDER BY id DESC LIMIT 1");
    expect(log.details.after.notifyThreshold).toBe(0.75);
  });
});
