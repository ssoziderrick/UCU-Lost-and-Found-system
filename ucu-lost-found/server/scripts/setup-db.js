// Recreates the database from scratch: drops it, applies every migration, then loads fictional sample data.
//   npm run db:setup              -> reset + migrations + seed into DB_NAME
//   npm run db:setup -- --no-seed -> reset + migrations only
// WARNING: deletes ALL data in the target database. For an existing database use `npm run db:migrate`.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const migrate = require('./migrate');

async function setup({ seed = true, database = config.db.database, quiet = false } = {}) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Unsafe database name: ${database}`);
  if (config.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to reset a database in production. Use npm run db:migrate, or pass --force if you really mean it.');
  }
  const connOpts = {
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
    multipleStatements: true,
  };

  const conn = await mysql.createConnection(connOpts);
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  } finally {
    await conn.end();
  }

  await migrate({ database, quiet: true });

  if (seed) {
    const seedSql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'seed.sql'), 'utf8')
      .replace(/ucu_lost_found\b/g, database);
    const seedConn = await mysql.createConnection({ ...connOpts, database });
    try {
      await seedConn.query(seedSql);
    } finally {
      await seedConn.end();
    }
  }
  // Score the sample reports so the demo starts with real match suggestions. The app's pool points at
  // DB_NAME (or the test database), so this only runs when that is the database just rebuilt.
  if (seed && database === config.db.database) {
    const { sweep, clearConfigCache } = require('../src/matching/service');
    clearConfigCache();
    await sweep();
  }
  if (!quiet) console.log(`Database "${database}" recreated from migrations${seed ? ' and seeded with fictional data' : ''}.`);
}

if (require.main === module) {
  setup({ seed: !process.argv.includes('--no-seed') })
    .catch((err) => { console.error('Database setup failed:', err.message); process.exitCode = 1; })
    .finally(() => require('../src/db').pool.end());
}

module.exports = setup;
