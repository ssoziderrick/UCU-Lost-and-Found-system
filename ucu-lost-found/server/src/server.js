const app = require('./app');
const config = require('./config');
const db = require('./db');

config.assertProductionConfig(); // refuses to start production with unsafe settings

app.listen(config.port, () => {
  console.log(`UCU Findora API listening on http://localhost:${config.port} (${config.env}, mail: ${config.mail.transport})`);
});

// Housekeeping every hour: expired sessions, and one-time tokens finished more than a week ago.
setInterval(() => {
  db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch((e) => console.error('Session cleanup failed', e));
  db.query(`DELETE FROM verification_tokens
             WHERE (used_at IS NOT NULL OR expires_at < NOW()) AND created_at < NOW() - INTERVAL 7 DAY`)
    .catch((e) => console.error('Token cleanup failed', e));
}, 60 * 60 * 1000).unref();
