// Client-side validation mirrors the server rules (server/src/validation.js) for instant feedback.
// The server re-validates everything; these checks only improve the experience.

const today = () => new Date().toISOString().slice(0, 10);
const len = (v) => (v || '').trim().length;

/** Registration numbers and staff IDs: trimmed, upper-case, inner spaces removed (same as the server). */
export const normaliseId = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** Mirrors server/src/utils/passwordPolicy.js except the common-password list, which only the server checks. */
export function passwordProblem(password, identifiers = []) {
  const pw = password || '';
  if (pw.length < 10) return 'Password must be at least 10 characters long.';
  if (new TextEncoder().encode(pw).length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw)) return 'Password must include at least one letter.';
  if (!/\d/.test(pw)) return 'Password must include at least one number.';
  const squashed = pw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (identifiers.some((id) => { const s = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return s.length >= 4 && squashed.includes(s); })) {
    return 'Password must not contain your registration number or staff ID.';
  }
  return null;
}

export function validateLogin(f, kind = 'student') {
  const e = {};
  if (kind === 'student' && !normaliseId(f.registrationNumber)) e.registrationNumber = 'Enter your registration number.';
  if (kind === 'admin' && !normaliseId(f.staffId)) e.staffId = 'Enter your staff ID.';
  if (!f.password) e.password = 'Enter your password.';
  return e;
}

export function validateActivationStart(f) {
  const e = {};
  if (!normaliseId(f.registrationNumber)) e.registrationNumber = 'Enter your registration number.';
  if (len(f.fullName) < 2) e.fullName = 'Enter your full name as it appears on your student ID.';
  else if (!/^[\p{L}][\p{L} ,.'-]*$/u.test(f.fullName.trim())) e.fullName = 'Full name may only contain letters, spaces, commas, apostrophes, dots and hyphens.';
  return e;
}

export function validateCode(code) {
  return /^\d{6}$/.test((code || '').trim()) ? {} : { code: 'Enter the 6-digit code from the email.' };
}

export function validateNewPassword(f, identifiers = []) {
  const e = {};
  const problem = passwordProblem(f.password, identifiers);
  if (problem) e.password = problem;
  if (!f.confirmPassword) e.confirmPassword = 'Type the password again to confirm it.';
  else if (f.confirmPassword !== f.password) e.confirmPassword = 'The two passwords don’t match. Type the same password twice.';
  return e;
}

export function validateReport(f) {
  const e = {};
  if (!['lost', 'found'].includes(f.type)) e.type = 'Choose whether the item was lost or found.';
  if (len(f.title) < 3) e.title = 'Title must be at least 3 characters, e.g. "Keys with blue keyring".';
  else if (len(f.title) > 120) e.title = 'Title must be 120 characters or fewer — please shorten it.';
  if (!f.categoryId) e.categoryId = 'Choose a category from the list.';
  if (len(f.description) < 10) e.description = 'Public description must be at least 10 characters — describe the item without private identifying marks.';
  else if (len(f.description) > 1000) e.description = 'Public description must be 1000 characters or fewer — please shorten it.';
  if (len(f.identifyingDetails) > 1000) e.identifyingDetails = 'Identifying details must be 1000 characters or fewer.';
  if (len(f.custodyNote) > 255) e.custodyNote = 'Keep this note to 255 characters or fewer.';
  if (!f.eventDate) e.eventDate = 'Date is required.';
  else if (f.eventDate > today()) e.eventDate = 'The date cannot be in the future — choose today or an earlier date.';
  if (!f.locationId) e.locationId = 'Choose a campus location from the list.';
  if (len(f.locationDetail) > 150) e.locationDetail = 'Location detail must be 150 characters or fewer.';
  const photoProblem = validatePhotos(f.photos || [], f.existingPhotoCount || 0);
  if (photoProblem) e.photos = photoProblem;
  return e;
}

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Checks new photo files (File objects) against the server's rules. Returns a message or null. */
export function validatePhotos(files, existingCount = 0) {
  if (files.length + existingCount > MAX_PHOTOS) return `Add at most ${MAX_PHOTOS} photos.`;
  const bad = files.find((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
  if (bad) return `“${bad.name}” isn’t a JPG, PNG or WebP image.`;
  const big = files.find((f) => f.size > MAX_PHOTO_BYTES);
  if (big) return `“${big.name}” is larger than 5 MB. Choose a smaller photo.`;
  return null;
}

export function validateClaim(f) {
  const e = {};
  if (len(f.evidence) < 20) e.evidence = 'Ownership explanation must be at least 20 characters — describe details only the owner would know (marks, contents, inscriptions).';
  else if (len(f.evidence) > 1500) e.evidence = 'Ownership explanation must be 1500 characters or fewer.';
  return e;
}

export function validateDecision(f, needInstructions) {
  const e = {};
  if (len(f.reason) < 5) e.reason = 'Reason must be at least 5 characters so the claimant understands the decision.';
  if (needInstructions && len(f.collectionInstructions) < 5) e.collectionInstructions = 'Collection instructions must be at least 5 characters, e.g. "Dean of Students office, 9am–4pm, bring student ID".';
  return e;
}
