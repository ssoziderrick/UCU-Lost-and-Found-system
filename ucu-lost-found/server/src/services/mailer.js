// Sends transactional email. Two transports:
//   log  (development, tests): prints the message and stores it in email_outbox, so no mail server is needed.
//   smtp (production): sends through the configured server and records only recipient, subject and status.
const config = require('../config');
const db = require('../db');

let smtpTransport = null;
function smtp() {
  if (!smtpTransport) {
    // Loaded lazily so development and tests never need SMTP settings.
    const nodemailer = require('nodemailer');
    const s = config.mail.smtp;
    smtpTransport = nodemailer.createTransport({
      host: s.host, port: s.port, secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.password } : undefined,
    });
  }
  return smtpTransport;
}

/**
 * Sends one plain-text email. Never throws: a delivery failure is recorded and logged, because
 * callers such as "forgot password" must answer the same way whether or not the email went out.
 */
async function sendMail({ to, subject, text, purpose }) {
  const transport = config.mail.transport === 'smtp' ? 'smtp' : 'log';
  if (transport === 'log') {
    if (!config.isTest) console.log(`\n--- email (${purpose}) to ${to} ---\nSubject: ${subject}\n\n${text}\n--- end email ---\n`);
    await db.query(
      `INSERT INTO email_outbox (to_address, subject, body_text, purpose, transport, status)
       VALUES (?, ?, ?, ?, 'log', 'logged')`, [to, subject, text, purpose]);
    return true;
  }
  try {
    await smtp().sendMail({ from: config.mail.from, to, subject, text });
    await db.query(
      `INSERT INTO email_outbox (to_address, subject, purpose, transport, status) VALUES (?, ?, ?, 'smtp', 'sent')`,
      [to, subject, purpose]);
    return true;
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    await db.query(
      `INSERT INTO email_outbox (to_address, subject, purpose, transport, status, error) VALUES (?, ?, ?, 'smtp', 'failed', ?)`,
      [to, subject, purpose, String(err.message).slice(0, 255)]).catch(() => {});
    return false;
  }
}

const SIGN_OFF = '\n\nIf you didn\'t ask for this, you can ignore this email. Nobody from UCU Findora will ever ask you for your password or this code.\n\nUCU Findora · Campus lost property';

const templates = {
  activation: ({ name, code, link, minutes }) => ({
    subject: 'Your UCU Findora activation code',
    text: `Hello ${name},\n\nUse this code to activate your UCU Findora account:\n\n    ${code}\n\nOr open this link: ${link}\n\nThe code and link expire in ${minutes} minutes.${SIGN_OFF}`,
  }),
  passwordReset: ({ name, code, link, minutes }) => ({
    subject: 'Reset your UCU Findora password',
    text: `Hello ${name},\n\nUse this code to reset your UCU Findora password:\n\n    ${code}\n\nOr open this link: ${link}\n\nThe code and link expire in ${minutes} minutes.${SIGN_OFF}`,
  }),
  passwordChanged: ({ name }) => ({
    subject: 'Your UCU Findora password was changed',
    text: `Hello ${name},\n\nThe password for your UCU Findora account was just changed and you were signed out everywhere.\n\nIf this wasn't you, go to the lost-property office with your ID straight away.${SIGN_OFF}`,
  }),
  adminInvite: ({ name, staffId, roleName, link, hours, invitedBy }) => ({
    subject: 'You have been added as a UCU Findora administrator',
    text: `Hello ${name},\n\n${invitedBy} has added you to UCU Findora as: ${roleName}.\nYour staff ID for signing in is ${staffId}.\n\nSet your password here: ${link}\n\nThe link expires in ${hours} hours.${SIGN_OFF}`,
  }),
};

module.exports = { sendMail, templates };
