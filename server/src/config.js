const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'r1mc_leave',
  },
  jwtSecret: process.env.JWT_SECRET || '',
  sessionHours: parseInt(process.env.SESSION_HOURS || '10', 10),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '25', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'R1MC Leave System <no-reply@r1mc.local>',
  },
  appUrl: process.env.APP_URL || '',
};

if (!config.jwtSecret || config.jwtSecret.length < 24) {
  // eslint-disable-next-line no-console
  console.error('JWT_SECRET is missing or shorter than 24 characters. Run setup.bat or set it in server/.env');
  if (require.main && /index\.js$/.test(require.main.filename)) process.exit(1);
}

module.exports = config;
