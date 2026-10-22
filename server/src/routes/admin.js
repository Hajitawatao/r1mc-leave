// HR / Admin configuration: employees, accounts, departments, leave types, approval chains, holidays, credits, audit
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const credits = require('../credits');
const { requireRole } = require('../auth');
const { ledgerFor } = require('./self');
const { HttpError, wrap, audit, isDateStr, today, sendCsv } = require('../util');

const router = express.Router();
const HR = requireRole('HR');
const ADMIN = requireRole('ADMIN');
const ROLES = ['HR', 'ACCOUNTING', 'OSH', 'CAO', 'MANAGEMENT', 'ADMIN'];

// ---------- Departments ----------
router.get('/departments', wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT d.*, CONCAT(e.first_name,' ',e.last_name) head_name,
            (SELECT COUNT(*) FROM employees x WHERE x.department_id = d.id AND x.is_active = 1) employee_count
       FROM departments d LEFT JOIN employees e ON e.id = d.head_employee_id ORDER BY d.name`));
}));

router.post('/departments', HR, wrap(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!code || !name) throw new HttpError(400, 'Code and name are required');
  const r = await db.query('INSERT INTO departments (code, name, head_employee_id) VALUES (?,?,?)', [code, name, req.body.head_employee_id || null]);
  await audit(req, 'DEPARTMENT_CREATE', 'department', r.insertId, { code, name });
  res.status(201).json({ id: r.insertId });
}));

router.put('/departments/:id', HR, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  await db.query('UPDATE departments SET code = ?, name = ?, head_employee_id = ?, is_active = ? WHERE id = ?',
    [String(req.body.code || '').trim().toUpperCase(), name, req.body.head_employee_id || null, req.body.is_active === false ? 0 : 1, req.params.id]);
  await audit(req, 'DEPARTMENT_UPDATE', 'department', req.params.id, req.body);
  res.json({ ok: true });
}));

// ---------- Employees & accounts ----------
router.get('/employees', HR, wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.q) {
    const like = `%${req.query.q}%`;
    where.push('(e.employee_no LIKE ? OR e.last_name LIKE ? OR e.first_name LIKE ? OR e.position LIKE ?)');
    params.push(like, like, like, like);
  }
  if (req.query.department_id) { where.push('e.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.active !== 'all') where.push('e.is_active = 1');
  const rows = await db.query(
    `SELECT e.*, d.name department_name, CONCAT(s.first_name,' ',s.last_name) supervisor_name,
            u.id user_id, u.username, u.is_active user_active, u.last_login_at,
            (SELECT GROUP_CONCAT(role ORDER BY role) FROM user_roles WHERE user_id = u.id) roles
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN employees s ON s.id = e.supervisor_id
       LEFT JOIN users u ON u.employee_id = e.id
      WHERE ${where.join(' AND ')} ORDER BY e.last_name, e.first_name LIMIT 3000`, params);
  res.json(rows);
}));

// lightweight lookup for pickers (supervisor, department head)
router.get('/employees/lookup', wrap(async (req, res) => {
  const like = `%${String(req.query.q || '').trim()}%`;
  res.json(await db.query(
    `SELECT e.id, e.employee_no, e.first_name, e.last_name, e.position FROM employees e
      WHERE e.is_active = 1 AND (e.last_name LIKE ? OR e.first_name LIKE ? OR e.employee_no LIKE ?) ORDER BY e.last_name LIMIT 20`, [like, like, like]));
}));

function empFields(b) {
  const s = (v, n = 150) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
  const f = {
    employee_no: s(b.employee_no, 30), last_name: s(b.last_name, 80), first_name: s(b.first_name, 80), middle_name: s(b.middle_name, 80),
    suffix: s(b.suffix, 10), sex: ['M', 'F'].includes(b.sex) ? b.sex : null, position: s(b.position), salary_grade: s(b.salary_grade, 10),
    monthly_salary: b.monthly_salary === '' || b.monthly_salary == null ? null : Number(b.monthly_salary),
    department_id: b.department_id || null, supervisor_id: b.supervisor_id || null, employment_status: s(b.employment_status, 40),
    date_hired: isDateStr(b.date_hired) ? b.date_hired : null, email: s(b.email),
  };
  if (!f.employee_no || !f.last_name || !f.first_name) throw new HttpError(400, 'Employee no., last name and first name are required');
  return f;
}

async function setRoles(q, req, userId, roles) {
  const clean = Array.from(new Set((roles || []).filter((r) => ROLES.includes(r))));
  if (clean.includes('ADMIN') && !req.user.roles.includes('ADMIN')) throw new HttpError(403, 'Only an administrator can grant the ADMIN role');
  const had = (await q('SELECT role FROM user_roles WHERE user_id = ?', [userId])).map((r) => r.role);
  if (had.includes('ADMIN') && !clean.includes('ADMIN') && !req.user.roles.includes('ADMIN')) throw new HttpError(403, 'Only an administrator can remove the ADMIN role');
  if (userId === req.user.id && had.includes('ADMIN') && !clean.includes('ADMIN')) throw new HttpError(400, 'You cannot remove your own ADMIN role');
  await q('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  for (const r of clean) await q('INSERT INTO user_roles (user_id, role) VALUES (?,?)', [userId, r]);
}

router.post('/employees', HR, wrap(async (req, res) => {
  const f = empFields(req.body);
  const out = await db.tx(async (t) => {
    const r = await t.query('INSERT INTO employees SET ?', [f]);
    const username = String(req.body.username || f.employee_no).trim();
    const u = await t.query('INSERT INTO users (employee_id, username, password_hash, must_change_password) VALUES (?,?,?,1)', [r.insertId, username, await bcrypt.hash(f.employee_no, 10)]);
    await setRoles(t.query, req, u.insertId, req.body.roles);
    await audit(req, 'EMPLOYEE_CREATE', 'employee', r.insertId, { employee_no: f.employee_no }, t.query);
    return { id: r.insertId, username, initial_password: f.employee_no };
  });
  res.status(201).json(out);
}));

router.put('/employees/:id', HR, wrap(async (req, res) => {
  const f = empFields(req.body);
  if (Number(f.supervisor_id) === Number(req.params.id)) throw new HttpError(400, 'An employee cannot be their own supervisor');
  await db.tx(async (t) => {
    await t.query('UPDATE employees SET ?, is_active = ? WHERE id = ?', [f, req.body.is_active === false || req.body.is_active === 0 ? 0 : 1, req.params.id]);
    const u = await t.one('SELECT id FROM users WHERE employee_id = ?', [req.params.id]);
    if (u) {
      if (req.body.roles) await setRoles(t.query, req, u.id, req.body.roles);
      if (req.body.is_active === false || req.body.is_active === 0) await t.query('UPDATE users SET is_active = 0 WHERE id = ?', [u.id]);
      else if (req.body.user_active !== undefined) await t.query('UPDATE users SET is_active = ? WHERE id = ?', [req.body.user_active ? 1 : 0, u.id]);
    }
    await audit(req, 'EMPLOYEE_UPDATE', 'employee', req.params.id, { ...f, roles: req.body.roles }, t.query);
  });
  res.json({ ok: true });
}));

router.post('/employees/:id/reset-password', HR, wrap(async (req, res) => {
  const e = await db.one('SELECT e.employee_no, u.id user_id FROM employees e JOIN users u ON u.employee_id = e.id WHERE e.id = ?', [req.params.id]);
  if (!e) throw new HttpError(404, 'This employee has no account');
  await db.query('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(e.employee_no, 10), e.user_id]);
  await audit(req, 'PASSWORD_RESET', 'user', e.user_id);
  res.json({ ok: true, initial_password: e.employee_no });
}));

router.post('/employees/:id/account', HR, wrap(async (req, res) => {
  const e = await db.one('SELECT e.id, e.employee_no, u.id user_id FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.id = ?', [req.params.id]);
  if (!e) throw new HttpError(404, 'Employee not found');
  if (e.user_id) throw new HttpError(409, 'This employee already has an account');
  await db.query('INSERT INTO users (employee_id, username, password_hash) VALUES (?,?,?)', [e.id, e.employee_no, await bcrypt.hash(e.employee_no, 10)]);
  await audit(req, 'ACCOUNT_CREATE', 'employee', e.id);
  res.status(201).json({ username: e.employee_no, initial_password: e.employee_no });
}));

// ---------- Leave types & approval chains ----------
router.get('/leave-types', wrap(async (req, res) => {
  const types = await db.query('SELECT * FROM leave_types ORDER BY sort_order, name');
  const steps = await db.query('SELECT * FROM approval_steps ORDER BY leave_type_id, step_order');
  res.json({
    types: types.map((t) => ({ ...t, steps: steps.filter((s) => s.leave_type_id === t.id) })),
    default_steps: steps.filter((s) => s.leave_type_id === null),
    roles: ROLES,
  });
}));

const LT_FIELDS = ['code', 'name', 'description', 'legal_basis', 'is_credit_type', 'accrual_per_month', 'deducts_from_type_id', 'max_days_per_request', 'max_days_per_year',
  'day_count', 'allow_half_day', 'attachment_rule', 'attachment_threshold_days', 'attachment_note', 'sex_restriction', 'min_advance_days',
  'insufficient_credit_action', 'form6_detail', 'is_active', 'sort_order'];

function ltFields(b) {
  const f = {};
  for (const k of LT_FIELDS) if (b[k] !== undefined) f[k] = b[k] === '' ? null : b[k];
  for (const k of ['is_credit_type', 'allow_half_day', 'is_active']) if (f[k] !== undefined) f[k] = f[k] ? 1 : 0;
  if (f.code) f.code = String(f.code).trim().toUpperCase();
  if (f.accrual_per_month == null && b.accrual_per_month !== undefined) f.accrual_per_month = 0;
  if (f.min_advance_days == null && b.min_advance_days !== undefined) f.min_advance_days = 0;
  return f;
}

router.post('/leave-types', HR, wrap(async (req, res) => {
  const f = ltFields(req.body);
  if (!f.code || !f.name) throw new HttpError(400, 'Code and name are required');
  const r = await db.query('INSERT INTO leave_types SET ?', [f]);
  await audit(req, 'LEAVE_TYPE_CREATE', 'leave_type', r.insertId, f);
  res.status(201).json({ id: r.insertId });
}));

router.put('/leave-types/:id', HR, wrap(async (req, res) => {
  const f = ltFields(req.body);
  if (Number(f.deducts_from_type_id) === Number(req.params.id)) throw new HttpError(400, 'A leave type cannot deduct from itself');
  await db.query('UPDATE leave_types SET ? WHERE id = ?', [f, req.params.id]);
  await audit(req, 'LEAVE_TYPE_UPDATE', 'leave_type', req.params.id, f);
  res.json({ ok: true });
}));

// Replace the whole chain for a leave type ("default" = fallback chain). Empty list on a type = use default.
router.put('/approval-chains/:typeId', HR, wrap(async (req, res) => {
  const typeId = req.params.typeId === 'default' ? null : parseInt(req.params.typeId, 10);
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  if (typeId === null && !steps.length) throw new HttpError(400, 'The default chain needs at least one step');
  for (const s of steps) {
    if (!String(s.name || '').trim()) throw new HttpError(400, 'Every step needs a name');
    if (!['SUPERVISOR', 'DEPT_HEAD', 'ROLE'].includes(s.approver_type)) throw new HttpError(400, 'Invalid approver type');
    if (s.approver_type === 'ROLE' && !ROLES.includes(s.approver_role)) throw new HttpError(400, `Step "${s.name}": choose a role`);
  }
  await db.tx(async (t) => {
    if (typeId === null) await t.query('DELETE FROM approval_steps WHERE leave_type_id IS NULL');
    else await t.query('DELETE FROM approval_steps WHERE leave_type_id = ?', [typeId]);
    let i = 0;
    for (const s of steps) {
      i += 1;
      await t.query('INSERT INTO approval_steps (leave_type_id, step_order, name, approver_type, approver_role, certifies_credits) VALUES (?,?,?,?,?,?)',
        [typeId, i, String(s.name).trim().slice(0, 100), s.approver_type, s.approver_type === 'ROLE' ? s.approver_role : null, s.certifies_credits ? 1 : 0]);
    }
    await audit(req, 'APPROVAL_CHAIN_UPDATE', 'leave_type', typeId === null ? 'default' : typeId, { steps }, t.query);
  });
  res.json({ ok: true });
}));

// ---------- Holidays ----------
router.post('/holidays', HR, wrap(async (req, res) => {
  if (!isDateStr(req.body.holiday_date) || !String(req.body.name || '').trim()) throw new HttpError(400, 'Date and name are required');
  await db.query('INSERT INTO holidays (holiday_date, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [req.body.holiday_date, String(req.body.name).trim()]);
  await audit(req, 'HOLIDAY_SET', 'holiday', req.body.holiday_date, { name: req.body.name });
  res.status(201).json({ ok: true });
}));

router.delete('/holidays/:id', HR, wrap(async (req, res) => {
  await db.query('DELETE FROM holidays WHERE id = ?', [req.params.id]);
  await audit(req, 'HOLIDAY_DELETE', 'holiday', req.params.id);
  res.json({ ok: true });
}));

// ---------- Credits ----------
router.get('/credits/accruals', HR, wrap(async (req, res) => {
  res.json(await db.query(
    `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) run_by_name FROM accrual_runs a
       LEFT JOIN users u ON u.id = a.run_by LEFT JOIN employees e ON e.id = u.employee_id ORDER BY a.period DESC LIMIT 36`));
}));

router.post('/credits/accrual', HR, wrap(async (req, res) => {
  const out = await credits.runAccrual(String(req.body.period || ''), req.user.id);
  await audit(req, 'ACCRUAL_RUN', 'accrual', out.period, out);
  res.json(out);
}));

router.post('/credits/adjust', HR, wrap(async (req, res) => {
  const { employee_id: emp, leave_type_id: typeId } = req.body;
  const days = Number(req.body.days);
  const remarks = String(req.body.remarks || '').trim();
  const mode = req.body.mode === 'SET' ? 'SET' : 'ADD';
  if (!emp || !typeId || Number.isNaN(days)) throw new HttpError(400, 'Employee, leave type and days are required');
  if (!remarks) throw new HttpError(400, 'Remarks are required for every adjustment (audit trail)');
  const lt = await db.one('SELECT is_credit_type FROM leave_types WHERE id = ?', [typeId]);
  if (!lt || !lt.is_credit_type) throw new HttpError(400, 'Only credit-earning leave types have balances');
  const bal = await db.tx(async (t) => {
    const current = await credits.getBalance(t.query, emp, typeId, true);
    const delta = mode === 'SET' ? days - current : days;
    return credits.post(t.query, { employeeId: emp, typeId, days: delta, txnType: 'ADJUSTMENT', remarks, userId: req.user.id });
  });
  await audit(req, 'CREDIT_ADJUST', 'employee', emp, { leave_type_id: typeId, mode, days, remarks, new_balance: bal });
  res.json({ balance: bal });
}));

router.get('/credits/employee/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { teamScope } = require('../auth');
  const scope = await teamScope(req.user);
  if (scope && !scope.includes(id)) throw new HttpError(403, 'Not available');
  const emp = await db.one(
    `SELECT e.id, e.employee_no, e.first_name, e.last_name, e.middle_name, e.position, e.date_hired, e.employment_status, d.name department_name
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?`, [id]);
  if (!emp) throw new HttpError(404, 'Employee not found');
  const balances = await db.query(
    `SELECT t.id, t.code, t.name, COALESCE(b.balance,0) balance FROM leave_types t
       LEFT JOIN leave_balances b ON b.leave_type_id = t.id AND b.employee_id = ? WHERE t.is_credit_type = 1 ORDER BY t.sort_order`, [id]);
  const ledger = await ledgerFor(id);
  if (req.query.format === 'csv') {
    return sendCsv(res, `leave-card-${emp.employee_no}.csv`, ledger, [
      { label: 'Date', key: 'txn_date' }, { label: 'Leave', key: 'leave_code' }, { label: 'Type', key: 'txn_type' },
      { label: 'Days', key: 'days' }, { label: 'Balance', key: 'balance_after' }, { label: 'Reference', key: 'tracking_no' }, { label: 'Remarks', key: 'remarks' },
    ]);
  }
  res.json({ employee: emp, balances, ledger });
}));

// ---------- Settings & audit ----------
router.get('/settings', wrap(async (req, res) => {
  const rows = await db.query('SELECT setting_key, setting_value FROM settings');
  res.json(Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])));
}));

router.put('/settings', ADMIN, wrap(async (req, res) => {
  const allowed = ['org_name', 'org_short', 'org_address', 'hr_certifying_officer', 'hr_certifying_position', 'approving_officer', 'approving_position'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      await db.query('INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [k, String(req.body[k]).slice(0, 255)]);
    }
  }
  await audit(req, 'SETTINGS_UPDATE', 'settings', null, req.body);
  res.json({ ok: true });
}));

router.get('/audit', ADMIN, wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`%${req.query.action}%`); }
  if (req.query.from) { where.push('a.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(req.query.to); }
  res.json(await db.query(
    `SELECT a.*, u.username, CONCAT(e.first_name,' ',e.last_name) user_name FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id LEFT JOIN employees e ON e.id = u.employee_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 500`, params));
}));

router.get('/today', wrap(async (req, res) => res.json({ today: today() })));

module.exports = router;
