// Normalising identifiers and comparing names, shared by sign-in, activation and registry import.

/** Registration numbers and staff IDs: trimmed, upper-case, inner spaces removed. "s24b23 /101" -> "S24B23/101". */
const normaliseId = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** Lower-case word set, ignoring punctuation, so "Okello, Daniel" equals "daniel  OKELLO". */
const nameWords = (name) => String(name ?? '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z\s'-]/g, ' ')
  .split(/\s+/)
  .filter(Boolean)
  .sort();

/** True when both names have the same words in any order. */
function namesMatch(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  return x.length > 0 && x.length === y.length && x.every((w, i) => w === y[i]);
}

/** "na****@students.ucu.ac.ug" — enough for the student to recognise the address, not enough to harvest it. */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

module.exports = { normaliseId, namesMatch, maskEmail };
