// Client-side validation mirrors the server rules (server/src/validation.js) for instant feedback.
// The server re-validates everything; these checks only improve the experience.

const today = () => new Date().toISOString().slice(0, 10);
const len = (v) => (v || '').trim().length;

export function validateRegister(f) {
  const e = {};
  if (len(f.fullName) < 2) e.fullName = 'Full name must be at least 2 characters.';
  else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(f.fullName.trim())) e.fullName = 'Full name may only contain letters, spaces, apostrophes, dots and hyphens.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((f.email || '').trim())) e.email = 'Enter a valid email address, for example name@students.ucu.ac.ug.';
  if (f.studentNumber && !/^[A-Za-z0-9/-]{4,20}$/.test(f.studentNumber.trim())) e.studentNumber = 'Student number should be 4–20 letters, digits, "/" or "-", e.g. S23B23/045.';
  if (f.phone && !/^(\+2567|07)\d{8}$/.test(f.phone.trim())) e.phone = 'Enter a Ugandan mobile number like 0772123456 or +256772123456.';
  if ((f.password || '').length < 8) e.password = 'Password must be at least 8 characters long.';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Password must include at least one letter and one number.';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match — type the same password in both boxes.';
  return e;
}

export function validateLogin(f) {
  const e = {};
  if (!len(f.email)) e.email = 'Email is required.';
  if (!f.password) e.password = 'Password is required.';
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
  if (len(f.privateDetails) > 1000) e.privateDetails = 'Private identifying details must be 1000 characters or fewer.';
  if (!f.eventDate) e.eventDate = 'Date is required.';
  else if (f.eventDate > today()) e.eventDate = 'The date cannot be in the future — choose today or an earlier date.';
  if (!f.locationId) e.locationId = 'Choose a campus location from the list.';
  if (len(f.locationDetail) > 150) e.locationDetail = 'Location detail must be 150 characters or fewer.';
  if (f.photo) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.photo.type)) e.photo = 'Upload a JPG, PNG or WebP image.';
    else if (f.photo.size > 2 * 1024 * 1024) e.photo = 'Photo must be 2 MB or smaller — choose a smaller image.';
  }
  return e;
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
