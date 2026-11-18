const app = require('./app');
const config = require('./config');
const db = require('./db');

app.listen(config.port, () => {
  console.log(`UCU Lost & Found API listening on http://localhost:${config.port} (${config.env})`);
});

// Housekeeping: remove expired sessions every hour.
setInterval(() => {
  db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch((e) => console.error('Session cleanup failed', e));
}, 60 * 60 * 1000).unref();
