// Creates (or recreates) the database from database/schema.sql and loads fictional sample data.
//   npm run db:setup              -> schema + seed into DB_NAME
//   npm run db:setup -- --no-seed -> schema only
// WARNING: drops existing tables in the target database.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function setup({ seed = true, database = config.db.database, quiet = false } = {}) {
  const dir = path.join(__dirname, '..', '..', 'database');
  const swapName = (sql) => sql.replace(/ucu_lost_found\b/g, database);
  const schema = swapName(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  const seedSql = swapName(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'));

  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
    multipleStatements: true,
  });
  try {
    await conn.query(schema);
    if (seed) await conn.query(seedSql);
    if (!quiet) console.log(`Database "${database}" created${seed ? ' and seeded with fictional data' : ''}.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  setup({ seed: !process.argv.includes('--no-seed') }).catch((err) => {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = setup;
