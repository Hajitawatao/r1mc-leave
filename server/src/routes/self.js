// Endpoints every logged-in employee uses: leave types, own balances/ledger, notifications, delegations
const express = require('express');
const db = require('../db');
const { HttpError, wrap, audit, isDateStr, today } = require('../util');

const router = express.Router();

router.get('/leave-types', wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT t.id, t.code, t.name, t.description, t.legal_basis, t.is_credit_type, t.deducts_from_type_id, t.max_days_per_request, t.max_days_per_year,
            t.day_count, t.allow_half_day, t.attachment_rule, t.attachment_threshold_days, t.attachment_note, t.sex_restriction, t.min_advance_days,
            t.form6_detail, t.insufficient_credit_action
       FROM leave_types t WHERE t.is_active = 1 ORDER BY t.sort_order, t.name`);
  const sex = req.user.sex;
  res.json(rows.filter((t) => t.sex_restriction === 'ANY' || !sex || t.sex_restriction === sex));
}));

router.get('/holidays', wrap(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  res.json(await db.query('SELECT id, holiday_date, name FROM holidays WHERE YEAR(holiday_date) BETWEEN ? AND ? ORDER BY holiday_date', [year - 1, year + 1]));
}));

router.get('/my/balances', wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT t.id, t.code, t.name, COALESCE(b.balance,0) balance,
            (SELECT COALESCE(SUM(r.days_applied),0) FROM leave_requests r JOIN leave_types x ON x.id = r.leave_type_id
              WHERE r.employee_id = ? AND r.status IN ('PENDING','RETURNED') AND (x.id = t.id OR x.deducts_from_type_id = t.id)) pending
       FROM leave_types t LEFT JOIN leave_balances b ON b.leave_type_id = t.id AND b.employee_id = ?
      WHERE t.is_credit_type = 1 ORDER BY t.sort_order`, [req.user.employee_id, req.user.employee_id]);
  // yearly-capped leave usage this year
  const year = new Date().getFullYear();
  const capped = await db.query(
    `SELECT t.id, t.code, t.name, t.max_days_per_year,
            (SELECT COALESCE(SUM(r.days_applied),0) FROM leave_requests r WHERE r.employee_id = ? AND r.leave_type_id = t.id
              AND r.status IN ('PENDING','RETURNED','APPROVED') AND YEAR(r.start_date) = ?) used
       FROM leave_types t WHERE t.is_active = 1 AND t.max_days_per_year IS NOT NULL ORDER BY t.sort_order`, [req.user.employee_id, year]);
  res.json({ credits: rows, yearly: capped, year });
}));

router.get('/my/ledger', wrap(async (req, res) => {
  res.json(await ledgerFor(req.user.employee_id));
}));

async function ledgerFor(employeeId) {
  return db.query(
    `SELECT l.id, l.txn_date, l.txn_type, l.days, l.balance_after, l.period, l.remarks, l.request_id, t.code leave_code, r.tracking_no
       FROM leave_ledger l JOIN leave_types t ON t.id = l.leave_type_id LEFT JOIN leave_requests r ON r.id = l.request_id
      WHERE l.employee_id = ? ORDER BY l.txn_date, l.id`, [employeeId]);
}

router.get('/notifications', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [req.user.id]);
  const unread = (await db.one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id])).n;
  res.json({ items: rows, unread });
}));

router.get('/notifications/count', wrap(async (req, res) => {
  const unread = (await db.one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id])).n;
  res.json({ unread });
}));

router.post('/notifications/read', wrap(async (req, res) => {
  if (req.body.id) await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.body.id, req.user.id]);
  else await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}));

// ---- Delegation of approval rights ----
router.get('/delegations', wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT dl.*, CONCAT(fe.first_name,' ',fe.last_name) delegator_name, CONCAT(te.first_name,' ',te.last_name) delegate_name
       FROM delegations dl JOIN users fu ON fu.id = dl.delegator_user_id JOIN employees fe ON fe.id = fu.employee_id
       JOIN users tu ON tu.id = dl.delegate_user_id JOIN employees te ON te.id = tu.employee_id
      WHERE dl.delegator_user_id = ? OR dl.delegate_user_id = ? ORDER BY dl.start_date DESC`, [req.user.id, req.user.id]);
  res.json(rows);
}));

router.get('/delegations/candidates', wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  res.json(await db.query(
    `SELECT u.id user_id, e.employee_no, e.first_name, e.last_name, e.position, d.name department_name
       FROM users u JOIN employees e ON e.id = u.employee_id LEFT JOIN departments d ON d.id = e.department_id
      WHERE u.is_active = 1 AND u.id <> ? AND (e.last_name LIKE ? OR e.first_name LIKE ? OR e.employee_no LIKE ?)
      ORDER BY e.last_name LIMIT 20`, [req.user.id, q, q, q]));
}));

router.post('/delegations', wrap(async (req, res) => {
  const { delegate_user_id: to, start_date: s, end_date: e } = req.body;
  if (!to || !isDateStr(s) || !isDateStr(e) || e < s) throw new HttpError(400, 'Choose a delegate and a valid date range');
  if (Number(to) === req.user.id) throw new HttpError(400, 'You cannot delegate to yourself');
  if (e < today()) throw new HttpError(400, 'The delegation period has already ended');
  const target = await db.one('SELECT id FROM users WHERE id = ? AND is_active = 1', [to]);
  if (!target) throw new HttpError(400, 'Delegate not found');
  const r = await db.query('INSERT INTO delegations (delegator_user_id, delegate_user_id, start_date, end_date, reason) VALUES (?,?,?,?,?)',
    [req.user.id, to, s, e, String(req.body.reason || '').slice(0, 255) || null]);
  await audit(req, 'DELEGATION_CREATE', 'delegation', r.insertId, { to, s, e });
  const { notify } = require('../notify');
  await notify([Number(to)], null, 'Approval rights delegated to you', `${req.user.first_name} ${req.user.last_name} delegated leave approval to you from ${s} to ${e}.`);
  res.status(201).json({ id: r.insertId });
}));

router.delete('/delegations/:id', wrap(async (req, res) => {
  const d = await db.one('SELECT * FROM delegations WHERE id = ?', [req.params.id]);
  if (!d || (d.delegator_user_id !== req.user.id && !req.user.roles.includes('ADMIN'))) throw new HttpError(404, 'Not found');
  await db.query('UPDATE delegations SET is_active = 0 WHERE id = ?', [d.id]);
  await audit(req, 'DELEGATION_REVOKE', 'delegation', d.id);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.ledgerFor = ledgerFor;
