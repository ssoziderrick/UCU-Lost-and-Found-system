// Pure, deterministic scoring of one lost report against one found report. No database access,
// so it can be unit-tested and explained. Contract: docs/v2/phase-4-matching-contract.md

const DEFAULTS = {
  weights: { name: 0.35, category: 0.25, location: 0.20, date: 0.15, description: 0.05 },
  notifyThreshold: 0.70,
  listThreshold: 0.50,
  windowDays: 30,
};

const STOP = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'our', 'with', 'and', 'or', 'of', 'in', 'on', 'at',
  'for', 'to', 'from', 'by', 'near', 'it', 'its', 'is', 'was', 'were', 'be', 'been', 'this', 'that', 'i', 'me', 'we', 'some',
  'one', 'set', 'pair', 'left', 'lost', 'found', 'after', 'before', 'during', 'about', 'very', 'small', 'big', 'large', 'new', 'old']);
const COLOURS = new Set(['black', 'white', 'grey', 'gray', 'silver', 'gold', 'golden', 'red', 'blue', 'green', 'yellow', 'orange',
  'purple', 'pink', 'brown', 'maroon', 'navy', 'beige', 'cream', 'dark', 'light', 'transparent', 'clear']);

// Words people use for the same thing -> one canonical token.
const SYNONYMS = {
  mobile: 'phone', smartphone: 'phone', cellphone: 'phone', handset: 'phone', iphone: 'phone', android: 'phone',
  adapter: 'charger', adaptor: 'charger', powerbank: 'charger',
  flask: 'bottle', tumbler: 'bottle', thermos: 'bottle',
  backpack: 'bag', rucksack: 'bag', handbag: 'bag', satchel: 'bag', knapsack: 'bag',
  // Whole words only for eyewear, so "glass bottle" doesn't become glasses.
  glasses: 'glasses', spectacles: 'glasses', specs: 'glasses', sunglasses: 'glasses', eyeglasses: 'glasses',
  earphone: 'earphones', earbud: 'earphones', headphone: 'earphones', airpod: 'earphones', headset: 'earphones',
  purse: 'wallet', calc: 'calculator', textbook: 'book', novel: 'book', exercise: 'book',
  hoodie: 'sweater', jumper: 'sweater', cardigan: 'sweater', pullover: 'sweater',
  keyring: 'key', keychain: 'key', identity: 'id', idcard: 'id',
};

/** Very small English singulariser, good enough for item names. */
function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lower-case words without accents or punctuation, singularised and mapped through SYNONYMS. */
function tokens(text, { dropColours = false } = {}) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !(dropColours && COLOURS.has(w)) && !/^\d+$/.test(w))
    .map((w) => SYNONYMS[w] || SYNONYMS[singular(w)] || singular(w));
}

function trigrams(s) {
  const padded = `  ${s} `;
  const out = new Map();
  for (let i = 0; i < padded.length - 2; i += 1) {
    const g = padded.slice(i, i + 3);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

function dice(a, b) {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  let common = 0; let total = 0;
  for (const [g, n] of A) { common += Math.min(n, B.get(g) || 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * common) / total : 0;
}

/** 0.6 × token containment (over the shorter title) + 0.4 × trigram similarity of the normalised titles. */
function nameScore(a, b) {
  const ta = [...new Set(tokens(a, { dropColours: true }))];
  const tb = [...new Set(tokens(b, { dropColours: true }))];
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  const containment = shared / Math.min(ta.length, tb.length);
  return 0.6 * containment + 0.4 * dice([...ta].sort().join(' '), [...tb].sort().join(' '));
}

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const dayNumber = (d) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 86400000);

/**
 * lost / found: { title, description, eventDate, categoryId, categoryParentId, categoryIsOther,
 *                 locationId, zoneId, locationIsOther }
 * Returns { eligible, score, parts, reasons } — eligible=false means "never compare these two".
 */
function scorePair(lost, found, config = DEFAULTS) {
  const w = config.weights;
  const daysAfter = dayNumber(found.eventDate) - dayNumber(lost.eventDate); // found minus lost
  if (daysAfter < -1 || daysAfter > config.windowDays) return { eligible: false, score: 0, parts: null, reasons: [] };

  const name = nameScore(lost.title, found.title);
  let category = 0;
  if (lost.categoryId === found.categoryId) category = 1;
  else if (lost.categoryParentId && lost.categoryParentId === found.categoryParentId) category = 0.5;
  else if (lost.categoryIsOther || found.categoryIsOther) category = 0.3;

  let location = 0;
  if (lost.locationId === found.locationId) location = 1;
  else if (lost.zoneId && lost.zoneId === found.zoneId) location = 0.5;
  else if (lost.locationIsOther || found.locationIsOther) location = 0.3;

  const gap = Math.abs(daysAfter);
  const date = gap <= 1 ? 1 : Math.max(0, 1 - (gap - 1) / 13);
  const description = jaccard(lost.description, found.description);

  const parts = {
    name: +name.toFixed(3), category, location, date: +date.toFixed(3), description: +description.toFixed(3),
  };
  let score = w.name * name + w.category * category + w.location * location + w.date * date + w.description * description;

  // A weak name match only counts when the category is exactly the same.
  const gated = name < 0.25 && category < 1;
  if (gated) score = 0;

  const reasons = [];
  if (name >= 0.7) reasons.push('Similar name');
  else if (name >= 0.4) reasons.push('Partly similar name');
  if (category === 1) reasons.push('Same category');
  else if (category === 0.5) reasons.push('Related category');
  if (location === 1) reasons.push('Same place');
  else if (location === 0.5) reasons.push('Nearby: same area of campus');
  if (daysAfter <= 0) reasons.push('Found the same day');
  else reasons.push(`Found ${daysAfter} day${daysAfter === 1 ? '' : 's'} after it was lost`);
  if (description >= 0.25) reasons.push('Similar description');

  return { eligible: true, score: Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000, parts, reasons, gated };
}

module.exports = { scorePair, nameScore, tokens, DEFAULTS };
