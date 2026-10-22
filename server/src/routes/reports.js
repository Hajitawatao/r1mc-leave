const express = require('express');
const db = require('../db');
const { teamScope, requireRole } = require('../auth');
const { HttpError, wrap, isDateStr, today, sendCsv } = require('../util');

const router = express.Router();

async function scopeClause(req, alias = 'r.employee_id') {
  const scope = await teamScope(req.user);
  if (!scope) return { sql: '1=1', params: [] };
  if (scope.length <= 1 && !req.user.is_supervisor) throw new HttpError(403, 'Reports are available to supervisors, HR and management');
  return { sql: `${alias} IN (?)`, params: [scope] };
}

function range(req) {
  const y = new Date().getFullYear();
  const from = isDateStr(req.query.from) ? req.query.from : `${y}-01-01`;
  const to = isDateStr(req.query.to) ? req.query.to : `${y}-12-31`;
  return { from, to };
}

router.get('/dashboard', wrap(async (req, res) => {
  const sc = await scopeClause(req);
  const y = new Date().getFullYear();
  const t = today();
  const status = await db.query(
    `SELECT r.status, COUNT(*) n FROM leave_requests r WHERE ${sc.sql} AND YEAR(r.start_date) = ? GROUP BY r.status`, [...sc.params, y]);
  const onLeave = await db.query(
    `SELECT r.id, r.tracking_no, r.start_date, r.end_date, t.code leave_code, CONCAT(e.last_name,', ',e.first_name) name, d.name department_name
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE ${sc.sql} AND r.status = 'APPROVED' AND ? BETWEEN r.start_date AND r.end_date ORDER BY d.name, e.last_name`, [...sc.params, t]);
  const upcoming = await db.query(
    `SELECT r.id, r.tracking_no, r.start_date, r.end_date, t.code leave_code, CONCAT(e.last_name,', ',e.first_name) name
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
      WHERE ${sc.sql} AND r.status = 'APPROVED' AND r.start_date > ? AND r.start_date <= DATE_ADD(?, INTERVAL 14 DAY) ORDER BY r.start_date LIMIT 30`, [...sc.params, t, t]);
  const monthly = await db.query(
    `SELECT MONTH(r.start_date) m, SUM(r.days_applied) days, SUM(r.days_without_pay) lwop FROM leave_requests r
      WHERE ${sc.sql} AND r.status = 'APPROVED' AND YEAR(r.start_date) = ? GROUP BY MONTH(r.start_date)`, [...sc.params, y]);
  const byType = await db.query(
    `SELECT t.code, t.name, COUNT(*) n, SUM(r.days_applied) days FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
      WHERE ${sc.sql} AND r.status = 'APPROVED' AND YEAR(r.start_date) = ? GROUP BY t.id ORDER BY days DESC`, [...sc.params, y]);
  const headcount = (await db.one(`SELECT COUNT(*) n FROM employees r WHERE ${sc.sql.replace('r.employee_id', 'r.id')} AND r.is_active = 1`, sc.params)).n;
  res.json({
    year: y, status, on_leave_today: onLeave, upcoming, headcount, by_type: byType,
    monthly: Array.from({ length: 12 }, (_, i) => {
      const row = monthly.find((x) => x.m === i + 1);
      return { month: i + 1, days: row ? Number(row.days) : 0, lwop: row ? Number(row.lwop) : 0 };
    }),
  });
}));

const GROUPS = {
  type: { key: 't.id', label: 't.name', extra: 't.code AS code' },
  department: { key: 'e.department_id', label: "COALESCE(d.name,'(No department)')", extra: 'd.code AS code' },
  employee: { key: 'e.id', label: "CONCAT(e.last_name,', ',e.first_name)", extra: 'e.employee_no AS code, d.name AS department_name' },
  month: { key: "DATE_FORMAT(r.start_date,'%Y-%m')", label: "DATE_FORMAT(r.start_date,'%Y-%m')", extra: "DATE_FORMAT(r.start_date,'%Y-%m') AS code" },
};

router.get('/summary', wrap(async (req, res) => {
  const sc = await scopeClause(req);
  const { from, to } = range(req);
  const g = GROUPS[req.query.group] || GROUPS.type;
  const where = [sc.sql, "r.status = 'APPROVED'", 'r.start_date BETWEEN ? AND ?'];
  const params = [...sc.params, from, to];
  if (req.query.department_id) { where.push('e.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.leave_type_id) { where.push('r.leave_type_id = ?'); params.push(req.query.leave_type_id); }
  const rows = await db.query(
    `SELECT ${g.label} AS label, ${g.extra}, COUNT(*) requests, COUNT(DISTINCT r.employee_id) employees,
            SUM(r.days_applied) days, SUM(r.days_with_pay) with_pay, SUM(r.days_without_pay) without_pay
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE ${where.join(' AND ')} GROUP BY ${g.key}, ${g.label} ORDER BY ${req.query.group === 'month' ? 'label' : 'days DESC'}`, params);
  if (req.query.format === 'csv') {
    return sendCsv(res, `leave-summary-${req.query.group || 'type'}-${from}-to-${to}.csv`, rows, [
      { label: 'Group', key: 'label' }, { label: 'Code', key: 'code' }, { label: 'Requests', key: 'requests' }, { label: 'Employees', key: 'employees' },
      { label: 'Days', key: 'days' }, { label: 'With Pay', key: 'with_pay' }, { label: 'Without Pay', key: 'without_pay' },
    ]);
  }
  res.json({ from, to, rows });
}));

router.get('/balances', wrap(async (req, res) => {
  const sc = await scopeClause(req, 'e.id');
  const types = await db.query('SELECT id, code FROM leave_types WHERE is_credit_type = 1 ORDER BY sort_order');
  const where = [sc.sql, 'e.is_active = 1'];
  const params = [...sc.params];
  if (req.query.department_id) { where.push('e.department_id = ?'); params.push(req.query.department_id); }
  const cols = types.map((t) => `COALESCE((SELECT balance FROM leave_balances b WHERE b.employee_id = e.id AND b.leave_type_id = ${Number(t.id)}),0) AS \`${t.code}\``).join(', ');
  const rows = await db.query(
    `SELECT e.id, e.employee_no, e.last_name, e.first_name, e.position, d.name department_name${cols ? ', ' + cols : ''}
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE ${where.join(' AND ')} ORDER BY d.name, e.last_name, e.first_name`, params);
  if (req.query.format === 'csv') {
    return sendCsv(res, `leave-balances-${today()}.csv`, rows, [
      { label: 'Employee No', key: 'employee_no' }, { label: 'Last Name', key: 'last_name' }, { label: 'First Name', key: 'first_name' },
      { label: 'Position', key: 'position' }, { label: 'Department', key: 'department_name' }, ...types.map((t) => ({ label: t.code, key: t.code })),
    ]);
  }
  res.json({ types: types.map((t) => t.code), rows });
}));

// Leave without pay, for payroll deduction
router.get('/lwop', requireRole('HR', 'ACCOUNTING', 'MANAGEMENT'), wrap(async (req, res) => {
  const { from, to } = range(req);
  const rows = await db.query(
    `SELECT r.tracking_no, r.start_date, r.end_date, r.days_applied, r.days_with_pay, r.days_without_pay, r.final_action_at,
            e.employee_no, e.last_name, e.first_name, e.monthly_salary, d.name department_name, t.name leave_name
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE r.status = 'APPROVED' AND r.days_without_pay > 0 AND r.start_date BETWEEN ? AND ? ORDER BY e.last_name, r.start_date`, [from, to]);
  if (req.query.format === 'csv') {
    return sendCsv(res, `lwop-${from}-to-${to}.csv`, rows, [
      { label: 'Employee No', key: 'employee_no' }, { label: 'Name', value: (r) => `${r.last_name}, ${r.first_name}` }, { label: 'Department', key: 'department_name' },
      { label: 'Tracking No', key: 'tracking_no' }, { label: 'Leave', key: 'leave_name' }, { label: 'Start', key: 'start_date' }, { label: 'End', key: 'end_date' },
      { label: 'Days Applied', key: 'days_applied' }, { label: 'With Pay', key: 'days_with_pay' }, { label: 'Without Pay', key: 'days_without_pay' },
      { label: 'Monthly Salary', key: 'monthly_salary' }, { label: 'Approved', key: 'final_action_at' },
    ]);
  }
  res.json({ from, to, rows });
}));

module.exports = router;
