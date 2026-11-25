// In-app notifications, with optional email. Each (user, dedupe key) pair can exist only once (unique index),
// so retries and re-scoring can never send the same notification twice.
const config = require('../config');
const db = require('../db');
const { sendMail } = require('./mailer');

/**
 * notify({ userId, type, title, body, link, dedupeKey, email })
 * Call after the related transaction has committed. Returns true if the notification is new.
 * Never throws: a notification problem must not undo or fail the action that caused it.
 */
async function notify({ userId, type, title, body, link = null, dedupeKey, email = false }) {
  try {
    const r = await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [userId, type, title.slice(0, 150), body.slice(0, 600), link, dedupeKey.slice(0, 100)]);
    if (!r.affectedRows) return false; // already sent

    if (email) {
      const [u] = await db.query(
        `SELECT u.full_name, u.notify_email, COALESCE(u.email, s.university_email) AS email
           FROM users u LEFT JOIN student_registry s ON s.registration_number = u.registration_number
          WHERE u.id = ? AND u.status = 'active'`, [userId]);
      if (u?.email && u.notify_email) {
        const text = `Hello ${u.full_name.split(' ')[0]},\n\n${body}\n\n${link ? `Open it here: ${config.appUrl}${link}\n\n` : ''}`
          + 'You can turn off these emails on your Notifications page.\n\nUCU Findora · Campus lost property';
        if (await sendMail({ to: u.email, subject: title, text, purpose: `notify_${type}` })) {
          await db.query('UPDATE notifications SET emailed_at = NOW() WHERE id = ?', [r.insertId]);
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`Notification ${type} for user ${userId} failed:`, err.message);
    return false;
  }
}

/** Claim lifecycle messages, used by the claim and admin routes. */
const claimMessages = {
  submitted: (title) => ({
    type: 'claim_submitted', title: 'We’ve received your claim',
    body: `Your claim for “${title}” has been sent privately to the lost-property office. You’ll be notified when they decide.`,
  }),
  approved: (title, instructions) => ({
    type: 'claim_approved', title: 'Your claim was approved', email: true,
    body: `Your claim for “${title}” has been approved. ${instructions} Bring your student ID.`,
  }),
  rejected: (title, reason) => ({
    type: 'claim_rejected', title: 'Your claim was not approved', email: true,
    body: `Your claim for “${title}” was not approved. Reason: ${reason}`,
  }),
  returnedToClaimant: (title) => ({
    type: 'item_returned', title: 'Return confirmed', email: true,
    body: `The office has recorded that you collected “${title}”. We’re glad it’s back with you.`,
  }),
  returnedToFinder: (title) => ({
    type: 'item_returned', title: 'The item you found is back with its owner', email: true,
    body: `“${title}”, which you reported as found, has been returned to its verified owner. Thank you for handing it in.`,
  }),
};

module.exports = { notify, claimMessages };
