const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError, today } = require('./util');

const COOKIE = 'lv_token';
// Roles that see every employee's applications and reports: HRMO, Accounting (payroll), Admin (MIS)
const ORG_WIDE_ROLES = ['HR', 'ADMIN', 'ACCOUNTING'];

function issue(res, userId) {
  const token = jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: config.sessionHours * 3600 * 1000 });
}

function clear(res) { res.clearCookie(COOKIE); }

async function loadUser(userId) {
  const u = await db.one(
    `SELECT u.id, u.username, u.employee_id, u.must_change_password, u.is_active,
            e.employee_no, e.first_name, e.last_name, e.middle_name, e.suffix, e.position, e.sex,
            e.department_id, d.name AS department_name
       FROM users u JOIN employees e ON e.id = u.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE u.id = ?`, [userId]);
  if (!u || !u.is_active) return null;
  const roles = (await db.query('SELECT role FROM user_roles WHERE user_id = ?', [userId])).map((r) => r.role);
  u.roles = Array.from(new Set(['EMPLOYEE', ...roles]));
  // people this user approves for (direct reports + department members if head)
  const sub = await db.one(
    `SELECT COUNT(*) n FROM employees e
      WHERE e.is_active = 1 AND e.id <> ? AND (e.supervisor_id = ? OR e.department_id IN (SELECT id FROM departments WHERE head_employee_id = ?))`,
    [u.employee_id, u.employee_id, u.employee_id]);
  u.is_supervisor = sub.n > 0;
  // active delegations given to this user
  const t = today();
  u.delegated_from = await db.query(
    `SELECT dl.delegator_user_id AS user_id, du.employee_id
       FROM delegations dl JOIN users du ON du.id = dl.delegator_user_id
      WHERE dl.delegate_user_id = ? AND dl.is_active = 1 AND ? BETWEEN dl.start_date AND dl.end_date`, [userId, t]);
  if (u.delegated_from.length) {
    const ids = u.delegated_from.map((d) => d.user_id);
    u.delegated_roles = Array.from(new Set((await db.query('SELECT role FROM user_roles WHERE user_id IN (?)', [ids])).map((r) => r.role)));
  } else {
    u.delegated_roles = [];
  }
  u.org_wide = u.roles.some((r) => ORG_WIDE_ROLES.includes(r));
  return u;
}

async function authenticate(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) throw new HttpError(401, 'Not logged in');
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch (e) { throw new HttpError(401, 'Session expired. Please log in again.'); }
    const user = await loadUser(payload.uid);
    if (!user) throw new HttpError(401, 'Account not found or disabled');
    req.user = user;
    // until the default password is changed, only allow auth endpoints
    if (user.must_change_password && !req.originalUrl.startsWith('/api/auth/')) {
      throw new HttpError(403, 'You must change your password first', { code: 'MUST_CHANGE_PASSWORD' });
    }
    next();
  } catch (e) { next(e); }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not logged in'));
  if (req.user.roles.includes('ADMIN') || roles.some((r) => req.user.roles.includes(r))) return next();
  return next(new HttpError(403, 'You do not have access to this function'));
};

/** Employee ids this user may see in team views/reports. null = everyone. */
async function teamScope(user) {
  if (user.org_wide) return null;
  const rows = await db.query(
    `SELECT e.id FROM employees e
      WHERE e.id = ? OR e.supervisor_id = ? OR e.department_id IN (SELECT id FROM departments WHERE head_employee_id = ?)`,
    [user.employee_id, user.employee_id, user.employee_id]);
  return rows.map((r) => r.id);
}

module.exports = { issue, clear, authenticate, requireRole, loadUser, teamScope, ORG_WIDE_ROLES };
