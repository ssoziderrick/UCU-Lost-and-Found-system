// Backend input validation (zod). Every message says what is wrong AND how to fix it.
// The React client mirrors these rules for instant feedback, but the server is the authority.
const { z } = require('zod');
const { badRequest } = require('./utils/errors');

const trimmed = (min, max, label, hint = '') =>
  z.string({ error: `${label} is required.` })
    .trim()
    .min(min, `${label} must be at least ${min} characters${hint}.`)
    .max(max, `${label} must be ${max} characters or fewer — please shorten it.`);

const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer — please shorten it.`)
    .optional().or(z.literal('')).transform((v) => (v ? v : null));

const isoDate = z.string({ error: 'Date is required.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date in the format YYYY-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a real calendar date.')
  .refine((v) => v <= new Date().toISOString().slice(0, 10), 'The date cannot be in the future — choose today or an earlier date.');

const positiveId = (label) =>
  z.coerce.number({ error: `Choose a ${label}.` }).int().positive(`Choose a ${label} from the list.`);

const { normaliseId } = require('./utils/identity');
const config = require('./config');

/** A registration number or staff ID, normalised before checking. */
const identifier = (label) => z.string({ error: `${label} is required.` })
  .transform(normaliseId)
  .pipe(z.string().min(1, `${label} is required.`).max(30, `${label} is too long.`));

const registrationNumber = identifier('Registration number')
  .pipe(z.string().regex(config.regNumberPattern, 'That doesn’t look like a registration number. Use the format on the student ID, e.g. S24B23/101.'));

const personName = z.string({ error: 'Full name is required.' }).trim()
  .min(2, 'Full name must be at least 2 characters.').max(100, 'Full name must be 100 characters or fewer.')
  // Commas allowed: registrar exports often write "Surname, Given names".
  .regex(/^[\p{L}][\p{L} ,.'-]*$/u, 'Full name may only contain letters, spaces, commas, apostrophes, dots and hyphens.');

const schemas = {
  // ---- Identity (Phase 2). Identifiers are normalised: trimmed, upper-case, spaces removed. ----
  studentLogin: z.object({
    registrationNumber: identifier('Registration number'),
    password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(200),
    remember: z.boolean().optional().default(false),
  }),

  adminLogin: z.object({
    staffId: identifier('Staff ID'),
    password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(200),
  }),

  activateStart: z.object({
    registrationNumber: registrationNumber,
    fullName: personName,
  }),

  forgot: z.object({
    registrationNumber: identifier('Registration number').optional(),
    staffId: identifier('Staff ID').optional(),
  }).refine((d) => d.registrationNumber || d.staffId, { message: 'Enter your registration number.', path: ['registrationNumber'] }),

  verifyCode: z.object({
    token: z.string().max(100).optional(),
    registrationNumber: identifier('Registration number').optional(),
    staffId: identifier('Staff ID').optional(),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.').optional(),
  }).refine((d) => d.token || ((d.registrationNumber || d.staffId) && d.code), {
    message: 'Enter the 6-digit code from the email.', path: ['code'],
  }),

  setPassword: z.object({
    ticket: z.string({ error: 'Your verification has expired. Start again.' }).min(10).max(100),
    password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(200),
    confirmPassword: z.string({ error: 'Confirm your password.' }),
  }).refine((d) => d.password === d.confirmPassword, { message: 'The two passwords don’t match. Type the same password twice.', path: ['confirmPassword'] }),

  adminCreate: z.object({
    fullName: personName,
    staffId: identifier('Staff ID').pipe(z.string().regex(/^[A-Z0-9][A-Z0-9/-]{2,29}$/, 'Staff ID may use letters, digits, "/" and "-" (3–30 characters).')),
    email: z.string({ error: 'Email is required.' }).trim().toLowerCase()
      .email('Enter a valid email address, for example name@ucu.ac.ug.').max(150),
    roleCode: z.enum(['super_admin', 'officer', 'viewer'], { error: 'Choose a role.' }),
    currentPassword: z.string({ error: 'Enter your own password to confirm.' }).min(1, 'Enter your own password to confirm.'),
  }),

  roleChange: z.object({
    roleCode: z.enum(['super_admin', 'officer', 'viewer'], { error: 'Choose a role.' }),
  }),

  registryRow: z.object({
    registration_number: registrationNumber,
    full_name: personName,
    university_email: z.string().trim().toLowerCase().max(150)
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'university_email is not a valid email address.')
      .transform((v) => v || null),
    programme: z.string().trim().max(150, 'programme must be 150 characters or fewer.').transform((v) => v || null),
    status: z.string().trim().toLowerCase().transform((v) => v || 'enrolled')
      .pipe(z.enum(['enrolled', 'withdrawn', 'graduated'], { error: 'status must be enrolled, withdrawn or graduated.' })),
  }),

  report: z.object({
    type: z.enum(['lost', 'found'], { error: 'Choose whether the item was lost or found.' }),
    title: trimmed(3, 120, 'Title', ', e.g. "Keys with blue keyring"'),
    categoryId: positiveId('category'),
    description: trimmed(10, 1000, 'Public description', ' — describe the item without private identifying marks'),
    privateDetails: optionalText(1000, 'Private identifying details'),
    eventDate: isoDate,
    locationId: positiveId('campus location'),
    locationDetail: optionalText(150, 'Location detail'),
  }),

  claim: z.object({
    evidence: trimmed(20, 1500, 'Ownership explanation',
      ' — describe details only the owner would know (marks, contents, inscriptions)'),
  }),

  approve: z.object({
    reason: trimmed(5, 1000, 'Reason for decision'),
    collectionInstructions: trimmed(5, 255, 'Collection instructions', ', e.g. "Dean of Students office, 9am–4pm, bring student ID"'),
  }),

  reasonOnly: z.object({
    reason: trimmed(5, 1000, 'Reason'),
  }),
};

/** Parse data with a schema; throw a 400 with per-field messages if invalid. */
function validate(schemaName, data) {
  const result = schemas[schemaName].safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] ?? 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('Some fields need attention. Please correct them and try again.', { fields });
  }
  return result.data;
}

module.exports = { validate, schemas };
