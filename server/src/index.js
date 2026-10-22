const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const config = require('./config');
const db = require('./db');
const { authenticate } = require('./auth');
const { HttpError } = require('./util');
const { emailEnabled } = require('./notify');

const app = express();
app.set('trust proxy', false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'upgrade-insecure-requests': null },
  },
  crossOriginEmbedderPolicy: false,
  hsts: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, email: emailEnabled() }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', authenticate);
app.use('/api/requests', require('./routes/requests'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/import', require('./routes/import'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api', require('./routes/self'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Built Vue app
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Frontend not built. Run "npm run build" in the project root.'));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${config.maxUploadMb} MB)` : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with the same unique value already exists' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' });
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'Unexpected server error. Please contact MIS.' });
});

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`R1MC Leave System running on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  });
}

module.exports = app;
