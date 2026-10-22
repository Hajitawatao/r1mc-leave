const nodemailer = require('nodemailer');
const config = require('./config');
const db = require('./db');

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Create in-app notifications (inside the caller's transaction when q is given)
 * and queue emails after the fact. Email failures never break the workflow.
 */
async function notify(userIds, requestId, title, message, q = db.query) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return;
  for (const uid of ids) {
    await q('INSERT INTO notifications (user_id, request_id, title, message) VALUES (?,?,?,?)', [uid, requestId || null, title.slice(0, 150), message.slice(0, 500)]);
  }
  if (transport) {
    setImmediate(async () => {
      try {
        const rows = await db.query(
          `SELECT e.email FROM users u JOIN employees e ON e.id = u.employee_id WHERE u.id IN (?) AND e.email IS NOT NULL AND e.email <> ''`, [ids]);
        const link = config.appUrl && requestId ? `\n\nOpen: ${config.appUrl}/#/requests/${requestId}` : '';
        for (const r of rows) {
          await transport.sendMail({ from: config.smtp.from, to: r.email, subject: `[R1MC Leave] ${title}`, text: message + link });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('email failed:', e.message);
      }
    });
  }
}

module.exports = { notify, emailEnabled: () => !!transport };
