// Applies database/migrations/NNN_name.sql files in order and records each one in schema_migrations.
//   npm run db:migrate        -> apply pending migrations to DB_NAME
// Safe to run repeatedly: applied files are skipped. If an applied file has been edited since,
// the runner stops, because the database would no longer match the code. Add a new file instead.
//
// Note: MySQL commits DDL statements implicitly, so a migration that fails halfway can leave
// part of its changes applied. Keep each migration small and focused, and test it on a copy first.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');
const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return {
        version: file.slice(0, 3),
        file,
        sql,
        checksum: crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
      };
    });
}

function assertNoDuplicateVersions(migrations) {
  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Two migration files share version ${m.version}. Renumber one of them.`);
    seen.add(m.version);
  }
}

async function migrate({ database = config.db.database, quiet = false } = {}) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Unsafe database name: ${database}`);
  const log = (msg) => { if (!quiet) console.log(msg); };
  const migrations = listMigrations();
  assertNoDuplicateVersions(migrations);

  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
    multipleStatements: true, // migration files contain several statements
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version     CHAR(3)      NOT NULL PRIMARY KEY,
      file        VARCHAR(120) NOT NULL,
      checksum    CHAR(64)     NOT NULL,
      applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);

    const [rows] = await conn.query('SELECT version, file, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.version, r]));

    for (const [version, row] of applied) {
      const current = migrations.find((m) => m.version === version);
      if (!current) throw new Error(`Migration ${row.file} is recorded as applied but its file is missing.`);
      if (current.checksum !== row.checksum) {
        throw new Error(`Migration ${current.file} was edited after it was applied. Revert the edit and add a new migration instead.`);
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.version));
    for (const m of pending) {
      log(`Applying ${m.file}…`);
      await conn.query(m.sql);
      await conn.query('INSERT INTO schema_migrations (version, file, checksum) VALUES (?, ?, ?)', [m.version, m.file, m.checksum]);
    }
    log(pending.length ? `Applied ${pending.length} migration(s) to "${database}".` : `"${database}" is up to date.`);
    return pending.map((m) => m.file);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = migrate;
module.exports.listMigrations = listMigrations;
