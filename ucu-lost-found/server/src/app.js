// Express application (exported separately from server.js so tests can import it).
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { loadUser } = require('./middleware/auth');
const { HttpError } = require('./utils/errors');

const app = express();
app.set('trust proxy', 1); // behind Render/Railway proxy: needed for secure cookies + rate limiting

app.use(helmet({
  contentSecurityPolicy: {
    directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'blob:'] },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
const { me, claims } = require('./routes/me');
app.use('/api/me', me);
app.use('/api/claims', claims);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));

// In production the built React app is served by the same server (one origin, simple cookies).
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Central error handler: consistent JSON shape { error, fields? }
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That action conflicts with an existing record (for example, a duplicate claim or a second approval).' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
});

module.exports = app;
