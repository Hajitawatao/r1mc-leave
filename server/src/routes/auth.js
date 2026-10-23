const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { issue, clear, authenticate } = require('../auth');
const { HttpError, wrap, audit } = require('../util');

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) throw new HttpError(400, 'Enter your username and password');
  const u = await db.one('SELECT * FROM users WHERE username = ?', [username]);
  const fail = async () => {
    if (u) {
      const attempts = u.failed_attempts + 1;
      await db.query('UPDATE users SET failed_attempts = ?, locked_until = IF(? >= 5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), locked_until) WHERE id = ?', [attempts >= 5 ? 0 : attempts, attempts, u.id]);
    }
    await audit({ ip: req.ip, user: u ? { id: u.id } : null }, 'LOGIN_FAILED', 'user', u ? u.id : null, { username });
    throw new HttpError(401, 'Incorrect username or password');
  };
  if (!u || !u.is_active) return fail();
  if (u.locked_until && new Date(u.locked_until.replace(' ', 'T')) > new Date()) {
    throw new HttpError(423, 'Too many failed attempts. Try again in 15 minutes or ask HR/MIS to reset your password.');
  }
  if (!(await bcrypt.compare(password, u.password_hash))) return fail();
  await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [u.id]);
  issue(res, u.id);
  await audit({ ip: req.ip, user: { id: u.id } }, 'LOGIN', 'user', u.id);
  res.json({ ok: true, must_change_password: !!u.must_change_password });
}));

// "Forgot password": no email on the LAN, so the request goes to HRMO, who resets it from Employees & accounts.
// Always answers the same way so the form cannot be used to discover which usernames exist.
router.post('/forgot-password', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) throw new HttpError(400, 'Enter your username or employee number');
  const u = await db.one(
    `SELECT u.id, e.employee_no, e.first_name, e.last_name, d.name department_name
       FROM users u JOIN employees e ON e.id = u.employee_id LEFT JOIN departments d ON d.id = e.department_id
      WHERE u.is_active = 1 AND (u.username = ? OR e.employee_no = ?) LIMIT 1`, [username, username]);
  if (u) {
    const recent = await db.one(
      `SELECT id FROM audit_logs WHERE action = 'PASSWORD_RESET_REQUEST' AND entity_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`, [String(u.id)]);
    if (!recent) {
      const hr = (await db.query(
        `SELECT DISTINCT x.id FROM users x JOIN user_roles r ON r.user_id = x.id WHERE r.role IN ('HR','ADMIN') AND x.is_active = 1 AND x.id <> ?`, [u.id])).map((r) => r.id);
      const { notify } = require('../notify');
      await notify(hr, null, 'Password reset requested',
        `${u.first_name} ${u.last_name} (${u.employee_no}${u.department_name ? ', ' + u.department_name : ''}) forgot their password. Reset it in Employees & accounts > Edit > Reset password, then tell them the temporary password in person.`);
      await audit({ ip: req.ip, user: null }, 'PASSWORD_RESET_REQUEST', 'user', u.id, { username });
    }
  }
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => { clear(res); res.json({ ok: true }); });

router.get('/me', authenticate, wrap(async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, username: u.username, employee_id: u.employee_id, employee_no: u.employee_no,
    first_name: u.first_name, last_name: u.last_name, middle_name: u.middle_name, position: u.position,
    department_name: u.department_name, sex: u.sex, roles: u.roles, is_supervisor: u.is_supervisor,
    org_wide: u.org_wide, must_change_password: !!u.must_change_password,
    delegated_roles: u.delegated_roles, acting_for: u.delegated_from.length,
  });
}));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
    throw new HttpError(400, 'New password must be at least 8 characters and contain letters and numbers');
  }
  const u = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, u.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  if (current === next) throw new HttpError(400, 'New password must be different from the current one');
  await db.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await bcrypt.hash(next, 10), req.user.id]);
  await audit(req, 'PASSWORD_CHANGE', 'user', req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
