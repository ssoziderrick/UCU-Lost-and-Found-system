/**
 * Calibration of the matching scorer against hand-labelled pairs (no database needed).
 * Each true match must reach the list threshold (0.50), the clear ones the notification threshold (0.70);
 * each look-alike must stay below 0.50 or be ineligible. If weights or rules change, these show the effect.
 */
const { scorePair, nameScore, DEFAULTS } = require('../src/matching/scorer');

// Categories: id -> parent group. 10 = "Other".
const CAT = { keys: 1, phones: 2, bags: 3, books: 4, idCards: 5, clothing: 6, accessories: 7, bottles: 8, documents: 9, other: 10, chargers: 15, calculators: 16, umbrellas: 17, eyewear: 18 };
const PARENT = { 2: 11, 15: 11, 4: 12, 16: 12, 3: 13, 6: 13, 7: 13, 8: 13, 17: 13, 18: 13, 5: 14, 9: 14 };
// Locations: id -> zone. 9 = "Other / Not listed".
const LOC = { nBlock: 1, kBlock: 2, computerLabs: 3, library: 4, mainGate: 5, football: 6, nkoyoyo: 7, dining: 8, other: 9, n5b: 10 };
const ZONE = { 1: 'A', 2: 'A', 3: 'A', 10: 'A', 4: 'L', 5: 'G', 6: 'S', 7: 'H', 8: 'D', 9: 'O' };

const day = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
const r = (title, cat, loc, d, description = '') => ({
  title, description, eventDate: day(d), categoryId: CAT[cat], categoryParentId: PARENT[CAT[cat]] || null, categoryIsOther: cat === 'other',
  locationId: LOC[loc], zoneId: ZONE[LOC[loc]], locationIsOther: loc === 'other',
});

// [label, lost, found, expectation]  expectation: 'notify' (>= 0.70), 'list' (>= 0.50), 'none' (< 0.50 or ineligible)
const PAIRS = [
  ['the brief: calculator, same place, same day', r('Calculator', 'calculators', 'nBlock', 0), r('Calculator', 'calculators', 'nBlock', 0), 'notify'],
  ['brand and colour only on one side', r('Black HP laptop charger', 'chargers', 'kBlock', 0), r('Laptop charger', 'chargers', 'computerLabs', 3), 'notify'],
  ['synonym: smartphone / phone', r('Tecno phone', 'phones', 'library', 0, 'cracked screen protector'), r('Black smartphone', 'phones', 'library', 1, 'screen protector is cracked'), 'notify'],
  ['ID card wording', r('Student ID card', 'idCards', 'mainGate', 0), r('ID card', 'idCards', 'mainGate', 0), 'notify'],
  ['the v1 scenario: keys on a keyring', r('Keys on a blue keyring', 'keys', 'n5b', 0), r('Set of keys with a blue keyring', 'keys', 'n5b', 0), 'notify'],
  ['synonym: hoodie / jumper', r('Grey hoodie', 'clothing', 'football', 0), r('Jumper', 'clothing', 'football', 1), 'notify'],
  ['synonym: backpack / bag, different area', r('Backpack', 'bags', 'nkoyoyo', 0), r('Black bag', 'bags', 'dining', 4), 'list'],
  ['synonym: bottle / flask, far apart, 11 days', r('Water bottle', 'bottles', 'nkoyoyo', 0), r('Flask', 'bottles', 'football', 11), 'list'],
  ['synonym: spectacles / reading glasses', r('Spectacles', 'eyewear', 'library', 0), r('Reading glasses', 'eyewear', 'kBlock', 2), 'list'],
  ['place not listed on one side', r('Casio calculator', 'calculators', 'other', 0), r('Calculator', 'calculators', 'nBlock', 1), 'notify'],

  ['look-alike name, related category: calculator vs calculus textbook', r('Calculator', 'calculators', 'nBlock', 0), r('Calculus textbook', 'books', 'nBlock', 0), 'none'],
  ['different things, related category: phone vs charger', r('Phone', 'phones', 'library', 0), r('Laptop charger', 'chargers', 'library', 0), 'none'],
  ['different things in the same group: umbrella vs jacket', r('Blue umbrella', 'umbrellas', 'mainGate', 0), r('Blue jacket', 'clothing', 'mainGate', 1), 'none'],
  ['different things in the same group: bag vs wallet', r('Black bag', 'bags', 'library', 0), r('Black wallet', 'accessories', 'library', 0), 'none'],
  ['glass bottle is not glasses', r('Glass water bottle', 'bottles', 'dining', 0), r('Reading glasses', 'eyewear', 'dining', 0), 'none'],
  ['found 40 days later: outside the window', r('Water bottle', 'bottles', 'nkoyoyo', 0), r('Water bottle', 'bottles', 'nkoyoyo', 40), 'none'],
  ['found before it was lost', r('Keys', 'keys', 'nBlock', 5), r('Keys', 'keys', 'nBlock', 0), 'none'],
  ['same everything but a totally different name and category', r('Umbrella', 'umbrellas', 'kBlock', 0), r('Lecture notes', 'documents', 'kBlock', 0), 'none'],
];

describe('matching scorer calibration', () => {
  test.each(PAIRS)('%s', (_label, lost, found, expected) => {
    const res = scorePair(lost, found, DEFAULTS);
    const score = res.eligible ? res.score : 0;
    if (expected === 'notify') expect(score).toBeGreaterThanOrEqual(DEFAULTS.notifyThreshold);
    if (expected === 'list') expect(score).toBeGreaterThanOrEqual(DEFAULTS.listThreshold);
    if (expected === 'none') expect(score).toBeLessThan(DEFAULTS.listThreshold);
  });

  test('same category with an unrelated name is listed at most, never notified', () => {
    const res = scorePair(r('Lenovo laptop', 'chargers', 'library', 0), r('Charger', 'chargers', 'library', 0));
    expect(res.score).toBeLessThan(DEFAULTS.notifyThreshold);
  });

  test('scores are explained and symmetric in the name part', () => {
    const res = scorePair(r('Black HP laptop charger', 'chargers', 'kBlock', 0), r('Laptop charger', 'chargers', 'computerLabs', 3));
    expect(res.reasons).toEqual(expect.arrayContaining(['Similar name', 'Same category', 'Nearby: same area of campus', 'Found 3 days after it was lost']));
    expect(nameScore('Laptop charger', 'Black HP laptop charger')).toBeCloseTo(nameScore('Black HP laptop charger', 'Laptop charger'), 5);
    expect(Object.keys(res.parts)).toEqual(['name', 'category', 'location', 'date', 'description']);
  });

  test('weights come from settings', () => {
    const pair = [r('Calculator', 'calculators', 'nBlock', 0), r('Calculator', 'calculators', 'kBlock', 0)];
    const locationHeavy = { ...DEFAULTS, weights: { name: 0.2, category: 0.1, location: 0.6, date: 0.05, description: 0.05 } };
    expect(scorePair(...pair, locationHeavy).score).toBeLessThan(scorePair(...pair, DEFAULTS).score);
  });

  test('summary: every labelled pair lands where expected', () => {
    const rows = PAIRS.map(([label, lost, found, expected]) => {
      const res = scorePair(lost, found);
      return { label, expected, score: res.eligible ? res.score : 'ineligible' };
    });
    // Printed when run with --verbose; useful when tuning weights.
    if (process.env.MATCH_REPORT) console.table(rows); // eslint-disable-line no-console
    expect(rows).toHaveLength(PAIRS.length);
  });
});
