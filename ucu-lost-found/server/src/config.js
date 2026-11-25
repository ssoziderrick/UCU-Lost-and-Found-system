// Central configuration. Values come from environment variables (.env in development).
// Load server/.env by path, so it is found whichever folder the process is started from.
// Variables already set in the environment (e.g. by the host) take precedence.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const isTest = process.env.NODE_ENV === 'test';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // Tests always run against a separate database so real data is never touched.
    database: isTest ? (process.env.DB_NAME_TEST || 'ucu_lost_found_test') : (process.env.DB_NAME || 'ucu_lost_found'),
    ssl: process.env.DB_SSL === 'true',
  },
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  cookieName: 'lf_session',
  maxPhotoBytes: 2 * 1024 * 1024, // 2 MB
};

module.exports = config;
