// Creates an administrator from the command line (for the first super admin on a new install) and prints
// a one-time link to set the password. No password is ever typed on the command line or stored in history.
//   npm run admin:create -- --staff-id STAFF-0001 --name "Ruth Achieng" --email ruth@ucu.ac.ug [--role super_admin]
const config = require('../src/config');
const db = require('../src/db');
const tokens = require('../src/services/tokens');
const { schemas } = require('../src/validation');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const parsed = schemas.adminCreate.safeParse({
    fullName: arg('name'), staffId: arg('staff-id'), email: arg('email'), roleCode: arg('role') || 'super_admin', currentPassword: 'not-used',
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  --${{ fullName: 'name', staffId: 'staff-id', email: 'email', roleCode: 'role' }[i.path[0]] || i.path[0]}: ${i.message}`);
    throw new Error(`Usage: npm run admin:create -- --staff-id STAFF-0001 --name "Full Name" --email name@ucu.ac.ug [--role super_admin|officer|viewer]\n${problems.join('\n')}`);
  }
  const d = parsed.data;
  const [clash] = await db.query('SELECT id FROM users WHERE staff_id = ? OR email = ?', [d.staffId, d.email]);
  if (clash) throw new Error('An account with that staff ID or email already exists.');

  const link = await db.transaction(async (tx) => {
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const ins = await tx.query(
      `INSERT INTO users (full_name, email, staff_id, password_hash, role, admin_role_id)
       VALUES (?, ?, ?, ?, 'admin', (SELECT id FROM admin_roles WHERE code = ?))`,
      [d.fullName, d.email, d.staffId, unusable, d.roleCode]);
    const { link: l } = await tokens.issue({ purpose: 'admin_invite', userId: ins.insertId, withCode: false, minutes: config.auth.inviteHours * 60 }, tx);
    await tx.query(
      `INSERT INTO audit_logs (actor_type, action, entity_type, entity_id, details) VALUES ('system', 'admin.created', 'user', ?, ?)`,
      [String(ins.insertId), JSON.stringify({ staffId: d.staffId, role: d.roleCode, via: 'command_line' })]);
    return l;
  });
  console.log(`\nCreated ${d.roleCode} ${d.fullName} (staff ID ${d.staffId}).`);
  console.log(`Open this link within ${config.auth.inviteHours} hours to set the password. It works once:\n\n  ${link}\n`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
