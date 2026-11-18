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

const schemas = {
  register: z.object({
    fullName: trimmed(2, 100, 'Full name')
      .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'Full name may only contain letters, spaces, apostrophes, dots and hyphens.'),
    email: z.string({ error: 'Email is required.' }).trim().toLowerCase()
      .email('Enter a valid email address, for example name@students.ucu.ac.ug.').max(150),
    studentNumber: z.string().trim().toUpperCase()
      .regex(/^[A-Z0-9/-]{4,20}$/, 'Student number should be 4–20 letters, digits, "/" or "-", e.g. S23B23/045.')
      .optional().or(z.literal('')).transform((v) => (v ? v : null)),
    phone: z.string().trim()
      .regex(/^(\+2567|07)\d{8}$/, 'Enter a Ugandan mobile number like 0772123456 or +256772123456.')
      .optional().or(z.literal('')).transform((v) => (v ? v : null)),
    password: z.string({ error: 'Password is required.' })
      .min(8, 'Password must be at least 8 characters long.')
      .max(72, 'Password must be 72 characters or fewer.')
      .regex(/[A-Za-z]/, 'Password must include at least one letter.')
      .regex(/\d/, 'Password must include at least one number.'),
  }),

  login: z.object({
    email: z.string({ error: 'Email is required.' }).trim().toLowerCase().min(1, 'Email is required.'),
    password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
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
