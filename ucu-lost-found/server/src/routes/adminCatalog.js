// /api/admin — campus locations, zones and item categories. Mounted after requireAdmin.
// Nothing is hard-deleted: deactivating hides an entry from new reports and filters; old reports keep it.
const express = require('express');
const db = require('../db');
const { validate } = require('../validation');
const { requirePermission: can } = require('../middleware/auth');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { audit } = require('../services/audit');

const router = express.Router();

const duplicate = (field, label) => conflict(`A ${label} with that name already exists.`, { fields: { [field]: `A ${label} with that name already exists.` } });

/** Builds "SET a = ?, b = ?" from only the keys the client actually sent (so omitted fields are left alone). */
function patchSet(body, data, columns) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columns)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      sets.push(`${column} = ?`);
      params.push(typeof data[key] === 'boolean' ? Number(data[key]) : data[key] ?? null);
    }
  }
  return { sets, params };
}

// ===================================================================================================
// Zones and locations
// ===================================================================================================
router.get('/zones', can('locations.manage'), async (_req, res) => {
  res.json({ items: await db.query(
    `SELECT z.id, z.name, z.sort_order AS sortOrder, COUNT(l.id) AS locations
       FROM campus_zones z LEFT JOIN campus_locations l ON l.zone_id = z.id GROUP BY z.id ORDER BY z.sort_order, z.name`) });
});

router.post('/zones', can('locations.manage'), async (req, res) => {
  const { name } = validate('zone', req.body);
  const [dup] = await db.query('SELECT id FROM campus_zones WHERE name = ?', [name]);
  if (dup) throw duplicate('name', 'zone');
  const [{ next }] = await db.query("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM campus_zones WHERE name <> 'Other'");
  const r = await db.query('INSERT INTO campus_zones (name, sort_order) VALUES (?, ?)', [name, next]);
  await audit(req, 'zone.created', { entityType: 'zone', entityId: r.insertId, details: { name } });
  res.status(201).json({ id: r.insertId, message: `Zone “${name}” added.` });
});

router.get('/locations', can('locations.manage'), async (_req, res) => {
  res.json({ items: (await db.query(
    `SELECT l.id, l.name, l.zone_id AS zoneId, z.name AS zone, l.kind, l.description, l.is_active AS isActive,
            l.sort_order AS sortOrder, (SELECT COUNT(*) FROM reports r WHERE r.location_id = l.id) AS reports
       FROM campus_locations l LEFT JOIN campus_zones z ON z.id = l.zone_id
      ORDER BY z.sort_order, l.sort_order, l.name`)).map((l) => ({ ...l, isActive: Boolean(l.isActive) })) });
});

async function assertZone(zoneId) {
  const [z] = await db.query('SELECT id FROM campus_zones WHERE id = ?', [zoneId]);
  if (!z) throw badRequest('Choose a zone from the list.', { fields: { zoneId: 'Choose a zone from the list.' } });
}

router.post('/locations', can('locations.manage'), async (req, res) => {
  const data = validate('location', req.body);
  await assertZone(data.zoneId);
  const [dup] = await db.query('SELECT id FROM campus_locations WHERE name = ?', [data.name]);
  if (dup) throw duplicate('name', 'location');
  const r = await db.query(
    'INSERT INTO campus_locations (name, zone_id, kind, description, sort_order) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.zoneId, data.kind, data.description, data.sortOrder]);
  await audit(req, 'location.created', { entityType: 'location', entityId: r.insertId, details: { name: data.name } });
  res.status(201).json({ id: r.insertId, message: `“${data.name}” added. Students can choose it straight away.` });
});

router.patch('/locations/:id', can('locations.manage'), async (req, res) => {
  const data = validate('locationPatch', req.body);
  const id = Number(req.params.id);
  const [before] = await db.query('SELECT id, name, is_active FROM campus_locations WHERE id = ?', [id]);
  if (!before) throw notFound('Location not found.');
  if (data.zoneId) await assertZone(data.zoneId);
  if (data.name && data.name !== before.name) {
    const [dup] = await db.query('SELECT id FROM campus_locations WHERE name = ? AND id <> ?', [data.name, id]);
    if (dup) throw duplicate('name', 'location');
  }
  const { sets, params } = patchSet(req.body, data, {
    name: 'name', zoneId: 'zone_id', kind: 'kind', description: 'description', sortOrder: 'sort_order', isActive: 'is_active',
  });
  if (!sets.length) throw badRequest('Nothing to change.');
  await db.query(`UPDATE campus_locations SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const action = data.isActive === false ? 'location.deactivated' : data.isActive === true && !before.is_active ? 'location.reactivated' : 'location.updated';
  await audit(req, action, { entityType: 'location', entityId: id, details: { before: before.name, changes: Object.keys(req.body) } });
  res.json({ message: data.isActive === false
    ? `“${before.name}” is hidden from new reports. Existing reports keep it.`
    : 'Location updated.' });
});

// ===================================================================================================
// Categories (one level of grouping; reports use categories without children)
// ===================================================================================================
router.get('/categories', can('categories.manage'), async (_req, res) => {
  res.json({ items: (await db.query(
    `SELECT c.id, c.name, c.parent_id AS parentId, g.name AS parentName, c.is_active AS isActive, c.sort_order AS sortOrder,
            (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS children,
            (SELECT COUNT(*) FROM reports r WHERE r.category_id = c.id) AS reports
       FROM categories c LEFT JOIN categories g ON g.id = c.parent_id
      ORDER BY COALESCE(g.sort_order, c.sort_order), COALESCE(g.name, c.name), c.parent_id IS NOT NULL, c.sort_order, c.name`))
    .map((c) => ({ ...c, isActive: Boolean(c.isActive) })) });
});

/** A parent must exist, be top-level and have no reports of its own (it becomes a group). */
async function assertParent(parentId, selfId = null) {
  if (!parentId) return;
  if (selfId && parentId === selfId) throw badRequest('A category can’t be its own group.', { fields: { parentId: 'Choose a different group.' } });
  const [p] = await db.query(
    'SELECT id, parent_id, (SELECT COUNT(*) FROM reports r WHERE r.category_id = c.id) AS reports FROM categories c WHERE id = ?', [parentId]);
  if (!p) throw badRequest('Choose a group from the list.', { fields: { parentId: 'Choose a group from the list.' } });
  if (p.parent_id) throw badRequest('Groups can only be one level deep.', { fields: { parentId: 'Choose a top-level group.' } });
  if (Number(p.reports) > 0) {
    throw badRequest('That category already has reports, so it can’t become a group.', { fields: { parentId: 'Choose a category without reports.' } });
  }
}

router.post('/categories', can('categories.manage'), async (req, res) => {
  const data = validate('category', req.body);
  await assertParent(data.parentId);
  const [dup] = await db.query('SELECT id FROM categories WHERE name = ?', [data.name]);
  if (dup) throw duplicate('name', 'category');
  const r = await db.query('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [data.name, data.parentId || null]);
  await audit(req, 'category.created', { entityType: 'category', entityId: r.insertId, details: { name: data.name, parentId: data.parentId || null } });
  res.status(201).json({ id: r.insertId, message: `Category “${data.name}” added.` });
});

router.patch('/categories/:id', can('categories.manage'), async (req, res) => {
  const data = validate('categoryPatch', req.body);
  const id = Number(req.params.id);
  const [before] = await db.query(
    'SELECT id, name, is_active, (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS children FROM categories c WHERE id = ?', [id]);
  if (!before) throw notFound('Category not found.');
  if (data.parentId && Number(before.children) > 0) {
    throw badRequest('This is a group with categories in it, so it can’t be put inside another group.', { fields: { parentId: 'Groups stay top-level.' } });
  }
  if (data.parentId) await assertParent(data.parentId, id);
  if (data.name && data.name !== before.name) {
    const [dup] = await db.query('SELECT id FROM categories WHERE name = ? AND id <> ?', [data.name, id]);
    if (dup) throw duplicate('name', 'category');
  }
  const { sets, params } = patchSet(req.body, data, { name: 'name', parentId: 'parent_id', isActive: 'is_active', sortOrder: 'sort_order' });
  if (!sets.length) throw badRequest('Nothing to change.');
  await db.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const action = data.isActive === false ? 'category.deactivated' : data.isActive === true && !before.is_active ? 'category.reactivated' : 'category.updated';
  await audit(req, action, { entityType: 'category', entityId: id, details: { before: before.name, changes: Object.keys(req.body) } });
  res.json({ message: data.isActive === false ? `“${before.name}” is hidden from new reports. Existing reports keep it.` : 'Category updated.' });
});

module.exports = router;
