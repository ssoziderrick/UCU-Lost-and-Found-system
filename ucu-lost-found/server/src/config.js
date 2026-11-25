// Central configuration. Values come from environment variables (server/.env in development).
// Load server/.env by path, so it is found whichever folder the process is started from.
// Variables already set in the environment (e.g. by the host) take precedence.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';
const isProduction = env === 'production';

const DEV_SECRET = 'development-only-secret-do-not-use-in-production';

const config = {
  env,
  isTest,
  isProduction,
  port: Number(process.env.PORT) || 4000,
  /** Public address of the web app, used in emailed links. */
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  /** Keys the HMAC of one-time codes. Must be long and random in production. */
  appSecret: process.env.APP_SECRET || DEV_SECRET,
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
  rememberDays: 30,
  adminSessionHours: 4,
  cookieName: 'lf_session',
  maxPhotoBytes: 2 * 1024 * 1024, // 2 MB
  /** Registration numbers after normalising (trim, upper-case, no spaces). Replace once UCU confirms its format. */
  regNumberPattern: new RegExp(process.env.REG_NUMBER_PATTERN || '^[A-Z0-9][A-Z0-9/-]{3,19}$'),
  auth: {
    maxFailedLogins: 5,
    lockMinutes: 15,
    codeMinutes: 15,         // emailed 6-digit codes
    ticketMinutes: 15,       // after a code is verified, time allowed to set the password
    officeLinkHours: 24,     // links an officer hands over in person
    inviteHours: 48,         // new administrator invitations
    maxCodeAttempts: 5,
    maxCodesPerHour: 3,      // per registration number / account
  },
  mail: {
    transport: process.env.MAIL_TRANSPORT || (isProduction ? 'smtp' : 'log'),
    from: process.env.MAIL_FROM || 'UCU Findora <no-reply@findora.local>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
    },
  },
};

/** Refuse to start production with settings that would leak codes or weaken tokens. */
function assertProductionConfig() {
  if (!isProduction) return;
  const problems = [];
  if (config.appSecret === DEV_SECRET || config.appSecret.length < 32) problems.push('APP_SECRET must be set to a random value of at least 32 characters.');
  if (config.mail.transport !== 'smtp') problems.push('MAIL_TRANSPORT must be "smtp" in production (the log transport stores codes in the database).');
  if (config.mail.transport === 'smtp' && !config.mail.smtp.host) problems.push('SMTP_HOST is required when MAIL_TRANSPORT=smtp.');
  if (!process.env.APP_URL) problems.push('APP_URL must be set to the public address of the web app.');
  if (problems.length) throw new Error(`Invalid production configuration:\n- ${problems.join('\n- ')}`);
}

config.assertProductionConfig = assertProductionConfig;
module.exports = config;
