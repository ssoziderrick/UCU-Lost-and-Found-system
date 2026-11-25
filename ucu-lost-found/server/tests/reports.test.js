/**
 * Phase 3 tests: campus locations, grouped categories, confidential details, custody,
 * multiple public/private images and the admin setup screens.
 * Contract: docs/v2/phase-3-reports-contract.md
 */
const zlib = require('zlib');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const setupDb = require('../scripts/setup-db');

const STUDENT_PW = 'TestOnly-Student-1';
const ADMIN_PW = 'TestOnly-Admin-1';

// ---- Test images ---------------------------------------------------------------------------
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
/** 1x1 PNG with text, time and EXIF chunks after IHDR. */
const pngWithMetadata = () => Buffer.concat([
  PNG_1PX.subarray(0, 33),
  pngChunk('tEXt', Buffer.from('Comment\0GPS 0.3476N 32.7389E SecretText', 'latin1')),
  pngChunk('eXIf', Buffer.from('MM\0*SecretExifMaker', 'latin1')),
  pngChunk('tIME', Buffer.from([7, 234, 11, 25, 10, 0, 0])),
  PNG_1PX.subarray(33),
]);
const pngOfSize = (w, h) => { const b = Buffer.from(PNG_1PX); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };

const WEBP_1PX = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
/** Extended WebP (VP8X) with an EXIF chunk. */
function webpWithExif() {
  const riffChunk = (id, data) => {
    const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(data.length, 4);
    return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x08; // EXIF present; width-1 and height-1 = 0 -> 1x1
  const vp8l = WEBP_1PX.subarray(12);             // the existing VP8L chunk, header included
  const body = Buffer.concat([riffChunk('VP8X', vp8x), vp8l, riffChunk('EXIF', Buffer.from('SecretWebpGPS', 'latin1'))]);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

// ---- Helpers ----------------------------------------------------------------------------------
async function agentFor(path, body) {
  const agent = request.agent(app);
  const res = await agent.post(path).send(body);
  expect(res.status).toBe(200);
  return agent;
}
const meta = async () => (await request(app).get('/api/reports/meta')).body;
const idOf = (list, name) => list.find((x) => x.name === name)?.id;

let okello; let namusoke; let superAdmin; let officer; let viewer; let m;

const base = () => ({
  type: 'found', title: 'Casio fx-991 calculator', description: 'Grey scientific calculator left on a desk after the exam.',
  eventDate: new Date().toISOString().slice(0, 10),
  categoryId: idOf(m.categories, 'Calculators & Academic Equipment'), locationId: idOf(m.locations, 'N Block'),
});

beforeAll(async () => {
  await setupDb({ database: config.db.database, quiet: true });
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'student'", [bcrypt.hashSync(STUDENT_PW, 4)]);
  await db.query("UPDATE users SET password_hash = ? WHERE role = 'admin'", [bcrypt.hashSync(ADMIN_PW, 4)]);
  for (const [staffId, role] of [['STAFF-0101', 'officer'], ['STAFF-0102', 'viewer']]) {
    await db.query(
      `INSERT INTO users (full_name, email, staff_id, password_hash, role, admin_role_id)
       VALUES (?, ?, ?, ?, 'admin', (SELECT id FROM admin_roles WHERE code = ?))`,
      [`Test ${role}`, `${role}@lostfound.ucu.test`, staffId, bcrypt.hashSync(ADMIN_PW, 4), role]);
  }
  okello = await agentFor('/api/auth/login', { registrationNumber: 'S24B23/101', password: STUDENT_PW });
  namusoke = await agentFor('/api/auth/login', { registrationNumber: 'S24B23/102', password: STUDENT_PW });
  superAdmin = await agentFor('/api/auth/admin/login', { staffId: 'STAFF-0001', password: ADMIN_PW });
  officer = await agentFor('/api/auth/admin/login', { staffId: 'STAFF-0101', password: ADMIN_PW });
  viewer = await agentFor('/api/auth/admin/login', { staffId: 'STAFF-0102', password: ADMIN_PW });
  m = await meta();
}, 60000);

afterAll(async () => { await db.pool.end(); });

/** Creates a found report with the given photos ([buffer, visibility, filename?]). */
function createWithPhotos(agent, photos, fields = {}) {
  let req = agent.post('/api/reports').field({ ...base(), ...fields });
  photos.forEach(([buf, vis, name = 'p.png']) => {
    req = req.field('photoVisibility', vis).attach('photos', buf, { filename: name, contentType: 'image/png' });
  });
  return req;
}

// ---------------------------------------------------------------------------------------------
describe('Campus locations and categories', () => {
  test('TC-P1 all 16 supplied locations are offered, grouped into zones', () => {
    const supplied = ['Paul Mukasa Library', 'Nkoyoyo Hall', 'Basketball Court', 'Football Pitch', 'Wandegea Gate', 'Main Gate',
      'Tech Park Gate', 'N Block', 'K Block', 'Computer Laboratories', 'Networking Laboratories', 'Robotics Laboratory',
      'Canteens', 'Dustin Bukenya Library', 'University Archives', 'Smart Labs'];
    const names = m.locations.map((l) => l.name);
    supplied.forEach((n) => expect(names).toContain(n));
    expect(m.locations.every((l) => l.zone)).toBe(true);
    expect(m.locations.find((l) => l.name === 'K Block').zoneId).toBe(m.locations.find((l) => l.name === 'Computer Laboratories').zoneId);
  });

  test('TC-P2 groups are not selectable; reports must use a specific category', async () => {
    expect(m.categoryGroups.map((g) => g.name)).toEqual(expect.arrayContaining(['Electronics', 'Academic', 'Personal items', 'Documents and IDs']));
    expect(m.categories.find((c) => c.name === 'Calculators & Academic Equipment').group).toBe('Academic');
    const res = await okello.post('/api/reports').field({ ...base(), categoryId: idOf(m.categoryGroups, 'Academic') });
    expect(res.status).toBe(400);
    expect(res.body.fields.categoryId).toMatch(/specific category/);
  });

  test('TC-P3 browsing by a group includes its categories; by zone includes its locations', async () => {
    const byGroup = await request(app).get('/api/reports').query({ categoryId: idOf(m.categoryGroups, 'Electronics') });
    expect(byGroup.body.items.length).toBeGreaterThan(0);
    expect(byGroup.body.items.every((i) => i.categoryGroup === 'Electronics')).toBe(true);
    const zoneId = m.locations.find((l) => l.name === 'Hamu Mukasa Library').zoneId;
    const byZone = await request(app).get('/api/reports').query({ zoneId });
    expect(byZone.body.items.every((i) => i.zoneId === zoneId)).toBe(true);
  });

  test('TC-P4 search matches reference codes and location names', async () => {
    const byRef = await request(app).get('/api/reports').query({ q: 'FD-000003' });
    expect(byRef.body.items.map((i) => i.id)).toContain(3);
    expect(byRef.body.items[0].refCode).toBe('FD-000003');
    const byNumber = await request(app).get('/api/reports').query({ q: '3' });
    expect(byNumber.body.items.map((i) => i.id)).toContain(3);
    const byPlace = await request(app).get('/api/reports').query({ q: 'Hamu Mukasa' });
    expect(byPlace.body.items.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Confidential details and custody', () => {
  test('TC-P5 identifying details live apart from the report and are shown only to owner and admins', async () => {
    const res = await okello.post('/api/reports').field({
      ...base(), identifyingDetails: 'Name "R. OKOT" scratched under the battery cover.',
      custody: 'lost_property_office', custodyNote: 'Handed to the desk at 2pm, shelf B.',
    });
    expect(res.status).toBe(201);
    expect(res.body.refCode).toMatch(/^FD-\d{6}$/);
    const id = res.body.id;
    const [stored] = await db.query('SELECT identifying_details FROM report_confidential WHERE report_id = ?', [id]);
    expect(stored.identifying_details).toMatch(/R\. OKOT/);

    const pub = await request(app).get(`/api/reports/${id}`);
    expect(pub.body.report.custody).toBe('lost_property_office');
    expect(JSON.stringify(pub.body)).not.toMatch(/OKOT|shelf B/);
    const list = await request(app).get('/api/reports').query({ q: 'Casio' });
    expect(JSON.stringify(list.body)).not.toMatch(/OKOT|shelf B/);
    const other = await namusoke.get(`/api/reports/${id}`);
    expect(JSON.stringify(other.body)).not.toMatch(/OKOT|shelf B/);
    const own = await okello.get(`/api/reports/${id}`);
    expect(own.body.report).toMatchObject({ identifyingDetails: expect.stringMatching(/OKOT/), custodyNote: expect.stringMatching(/shelf B/) });
    expect((await officer.get(`/api/reports/${id}`)).body.report.identifyingDetails).toMatch(/OKOT/);
  });

  test('TC-P6 lost reports never store identifying details or custody', async () => {
    const res = await okello.post('/api/reports').field({
      ...base(), type: 'lost', identifyingDetails: 'Should be ignored', custody: 'with_finder', custodyNote: 'ignored',
    });
    expect(res.status).toBe(201);
    const [r] = await db.query('SELECT custody, custody_note FROM reports WHERE id = ?', [res.body.id]);
    expect(r).toEqual({ custody: null, custody_note: null });
    expect(await db.query('SELECT * FROM report_confidential WHERE report_id = ?', [res.body.id])).toHaveLength(0);
  });

  test('TC-P7 clearing identifying details on edit removes the confidential row', async () => {
    const res = await okello.post('/api/reports').field({ ...base(), identifyingDetails: 'Initials AB inside the lid.' });
    const put = await okello.put(`/api/reports/${res.body.id}`).send({ ...base(), identifyingDetails: '' });
    expect(put.status).toBe(200);
    expect(await db.query('SELECT * FROM report_confidential WHERE report_id = ?', [res.body.id])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Images', () => {
  let reportId; let detail;

  test('TC-P8 up to 4 photos, each public or private; the first public one is the cover', async () => {
    const res = await createWithPhotos(okello, [[PNG_1PX, 'private', 'mark.png'], [PNG_1PX, 'public'], [PNG_1PX, 'public']]);
    expect(res.status).toBe(201);
    reportId = res.body.id;
    detail = (await okello.get(`/api/reports/${reportId}`)).body.report;
    expect(detail.images).toHaveLength(3);
    expect(detail.images.filter((i) => i.visibility === 'private')).toHaveLength(1);
    expect(detail.images[0]).toMatchObject({ isCover: true, visibility: 'public' });
    const pub = (await request(app).get(`/api/reports/${reportId}`)).body.report;
    expect(pub.images).toHaveLength(2);
    expect(pub.coverImage.url).toBe(detail.images[0].url);
  });

  test('TC-P9 private images are served only to the owner and admins, never cached', async () => {
    const privateUrl = detail.images.find((i) => i.visibility === 'private').url;
    expect((await request(app).get(privateUrl)).status).toBe(404);
    expect((await namusoke.get(privateUrl)).status).toBe(404);
    const own = await okello.get(privateUrl);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toMatch(/no-store/);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect((await viewer.get(privateUrl)).status).toBe(200);
    expect(privateUrl).toMatch(/^\/api\/images\/[0-9a-f]{64}$/);
    expect((await request(app).get('/api/images/../../etc/passwd')).status).toBe(404);
    expect((await request(app).get(`/api/images/${'0'.repeat(64)}`)).status).toBe(404);
  });

  test('TC-P10 never more than 4 photos', async () => {
    const five = await createWithPhotos(okello, Array(5).fill([PNG_1PX, 'public']));
    expect(five.status).toBe(400);
    const more = await okello.post(`/api/reports/${reportId}/images`)
      .field('photoVisibility', 'public').attach('photos', PNG_1PX, 'a.png')
      .field('photoVisibility', 'public').attach('photos', PNG_1PX, 'b.png');
    expect(more.status).toBe(400);
    expect(more.body.fields.photos).toMatch(/at most 4/);
    const one = await okello.post(`/api/reports/${reportId}/images`).field('photoVisibility', 'public').attach('photos', PNG_1PX, 'c.png');
    expect(one.status).toBe(201);
    expect(one.body.images).toHaveLength(4);
  });

  test('TC-P11 cover rules: a private photo cannot be the cover, and the cover moves on when needed', async () => {
    const imgs = (await okello.get(`/api/reports/${reportId}`)).body.report.images;
    const cover = imgs.find((i) => i.isCover);
    const priv = imgs.find((i) => i.visibility === 'private');
    expect((await okello.patch(`/api/reports/${reportId}/images/${priv.id}`).send({ isCover: true })).status).toBe(400);
    const hidden = await okello.patch(`/api/reports/${reportId}/images/${cover.id}`).send({ visibility: 'private' });
    expect(hidden.status).toBe(200);
    const newCover = hidden.body.images.find((i) => i.isCover);
    expect(newCover.id).not.toBe(cover.id);
    expect(newCover.visibility).toBe('public');
    const removed = await okello.delete(`/api/reports/${reportId}/images/${newCover.id}`);
    expect(removed.body.images.find((i) => i.isCover)?.visibility).toBe('public');
    const [blob] = await db.query('SELECT COUNT(*) AS n FROM image_blobs b JOIN report_images i USING (storage_key) WHERE i.id = ?', [newCover.id]);
    expect(blob.n).toBe(0);
  });

  test('TC-P12 only the owner can change photos, and only while the report is open', async () => {
    const img = (await okello.get(`/api/reports/${reportId}`)).body.report.images[0];
    expect((await namusoke.delete(`/api/reports/${reportId}/images/${img.id}`)).status).toBe(403);
    expect((await namusoke.post(`/api/reports/${reportId}/images`).attach('photos', PNG_1PX, 'x.png')).status).toBe(403);
    await db.query("UPDATE reports SET status = 'awaiting_collection' WHERE id = ?", [reportId]);
    expect((await okello.patch(`/api/reports/${reportId}/images/${img.id}`).send({ visibility: 'private' })).status).toBe(409);
    await db.query("UPDATE reports SET status = 'open' WHERE id = ?", [reportId]);
  });

  test('TC-P13 photos of a removed report are hidden from the public but not from the owner', async () => {
    const res = await createWithPhotos(okello, [[PNG_1PX, 'public']]);
    const url = (await okello.get(`/api/reports/${res.body.id}`)).body.report.images[0].url;
    expect((await superAdmin.post(`/api/admin/reports/${res.body.id}/remove`).send({ reason: 'Duplicate of another report' })).status).toBe(200);
    expect((await request(app).get(url)).status).toBe(404);
    expect((await okello.get(url)).status).toBe(200);
  });

  test('TC-P14 PNG text, time and EXIF chunks are removed; the image itself is kept', async () => {
    const png = pngWithMetadata();
    expect(png.includes('SecretText')).toBe(true);
    const res = await createWithPhotos(okello, [[png, 'public']]);
    expect(res.status).toBe(201);
    const url = (await okello.get(`/api/reports/${res.body.id}`)).body.report.images[0].url;
    const served = (await okello.get(url).buffer(true).parse((r, cb) => { const d = []; r.on('data', (c) => d.push(c)); r.on('end', () => cb(null, Buffer.concat(d))); })).body;
    expect(served.includes('SecretText')).toBe(false);
    expect(served.includes('SecretExifMaker')).toBe(false);
    expect(served.includes('IDAT')).toBe(true);
    expect(served.includes('IEND')).toBe(true);
  });

  test('TC-P15 WebP EXIF is removed and the VP8X flag cleared', async () => {
    const { stripWebpMetadata, detectImageType } = require('../src/utils/images');
    const webp = webpWithExif();
    const clean = stripWebpMetadata(webp);
    expect(clean.includes('SecretWebpGPS')).toBe(false);
    expect(detectImageType(clean)).toBe('image/webp');
    expect(clean.readUInt32LE(4)).toBe(clean.length - 8);
    expect(clean[20] & 0x08).toBe(0);
    const res = await okello.post('/api/reports').field(base()).attach('photos', webp, { filename: 'w.webp', contentType: 'image/webp' });
    expect(res.status).toBe(201);
  });

  test('TC-P16 oversized or fake images are refused with the file named', async () => {
    const big = await createWithPhotos(okello, [[pngOfSize(7000, 10), 'public', 'huge.png']]);
    expect(big.status).toBe(400);
    expect(big.body.error).toMatch(/huge\.png.*7000/);
    const fake = await createWithPhotos(okello, [[Buffer.from('GIF89a not allowed here at all'), 'public', 'anim.gif']]);
    expect(fake.status).toBe(400);
    expect(fake.body.error).toMatch(/anim\.gif/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Admin setup: locations and categories', () => {
  let locId;

  test('TC-P17 officers add locations; viewers cannot; names are unique', async () => {
    const zoneId = m.zones.find((z) => z.name === 'Lecture blocks and labs').id;
    expect((await viewer.post('/api/admin/locations').send({ name: 'Science Block', zoneId, kind: 'lecture' })).status).toBe(403);
    const created = await officer.post('/api/admin/locations').send({ name: 'Science Block', zoneId, kind: 'lecture' });
    expect(created.status).toBe(201);
    locId = created.body.id;
    const dup = await officer.post('/api/admin/locations').send({ name: 'Science Block', zoneId, kind: 'lecture' });
    expect(dup.status).toBe(409);
    expect(dup.body.fields.name).toMatch(/already exists/);
    expect((await meta()).locations.map((l) => l.name)).toContain('Science Block');
  });

  test('TC-P18 deactivating a location hides it from new reports but keeps existing ones', async () => {
    const used = await okello.post('/api/reports').field({ ...base(), locationId: locId });
    expect(used.status).toBe(201);
    const off = await officer.patch(`/api/admin/locations/${locId}`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await meta()).locations.map((l) => l.name)).not.toContain('Science Block');
    expect((await okello.post('/api/reports').field({ ...base(), locationId: locId })).body.fields.locationId).toBeDefined();
    expect((await request(app).get(`/api/reports/${used.body.id}`)).body.report.location).toBe('Science Block');
    const [{ description }] = await db.query('SELECT description FROM campus_locations WHERE id = ?', [locId]);
    expect(description).toBeNull(); // untouched by a patch that didn't send it
    const log = await officer.get('/api/admin/audit?action=location.');
    expect(log.body.items.map((i) => i.action)).toEqual(expect.arrayContaining(['location.created', 'location.deactivated']));
  });

  test('TC-P19 category rules: one level of groups; a category with reports cannot become a group', async () => {
    const academic = idOf(m.categoryGroups, 'Academic');
    const created = await officer.post('/api/admin/categories').send({ name: 'Lab Coats', parentId: academic });
    expect(created.status).toBe(201);
    expect((await meta()).categories.find((c) => c.name === 'Lab Coats').group).toBe('Academic');
    const keys = idOf(m.categories, 'Keys');
    expect((await officer.post('/api/admin/categories').send({ name: 'Car keys', parentId: keys })).status).toBe(400);
    expect((await officer.patch(`/api/admin/categories/${academic}`).send({ parentId: idOf(m.categoryGroups, 'Electronics') })).status).toBe(400);
    expect((await viewer.get('/api/admin/categories')).status).toBe(403);
  });
});
