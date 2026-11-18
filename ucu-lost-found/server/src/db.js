// MySQL connection pool (mysql2/promise). All queries use placeholders (?) to prevent SQL injection.
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE/DATETIME as strings, avoids timezone shifts
});

/** Run a SELECT/INSERT/UPDATE and return rows (or the result header). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run several statements atomically. fn receives a connection with the same query helper. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = { query: async (sql, params = []) => (await conn.query(sql, params))[0] };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, transaction };
