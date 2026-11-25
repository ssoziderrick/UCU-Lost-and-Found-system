// Password rule for v2: 10-72 characters (bcrypt reads at most 72 bytes), a letter and a number,
// not a commonly used password, and not the account's own identifier.

// A short list of passwords that appear at the top of every breach list, plus local variants.
// It blocks the worst choices without shipping a large dictionary.
const COMMON = new Set([
  '123456789a', '1234567890', 'qwerty1234', 'password1', 'password12', 'password123', 'password1234',
  'passw0rd123', 'iloveyou12', 'welcome123', 'abc1234567', 'abcd123456', 'qwertyuiop1', 'admin12345',
  'letmein123', 'football12', 'monkey1234', 'dragon1234', 'sunshine12', 'princess12', 'baseball12',
  'master1234', 'superman12', 'trustno1234', 'starwars12', 'whatever12', 'computer12', 'zaq12wsxcde',
  '1q2w3e4r5t', 'q1w2e3r4t5', 'asdfghjkl1', 'changeme123', 'student123', 'student1234', 'uganda1234',
  'uganda12345', 'kampala123', 'kampala1234', 'mukono1234', 'ucu1234567', 'ucuucu1234', 'findora123',
  'findora1234', 'lostfound1', 'lostandfound1', 'jesus12345', 'godisgood1', 'blessed123',
]);

/** Returns an error message, or null when the password is acceptable. */
function passwordProblem(password, { identifiers = [] } = {}) {
  const pw = String(password ?? '');
  if (pw.length < 10) return 'Password must be at least 10 characters long.';
  if (Buffer.byteLength(pw, 'utf8') > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw)) return 'Password must include at least one letter.';
  if (!/\d/.test(pw)) return 'Password must include at least one number.';
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose something less predictable.';
  const squashed = lower.replace(/[^a-z0-9]/g, '');
  for (const id of identifiers) {
    const idSquashed = String(id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (idSquashed.length >= 4 && squashed.includes(idSquashed)) {
      return 'Password must not contain your registration number or staff ID.';
    }
  }
  return null;
}

module.exports = { passwordProblem };
