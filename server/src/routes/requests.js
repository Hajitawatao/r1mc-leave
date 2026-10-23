const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const wf = require('../workflow');
const credits = require('../credits');
const { notify } = require('../notify');
const { upload, discard, filePath } = require('../upload');
const { teamScope } = require('../auth');
const { HttpError, wrap, audit, fullName, sendCsv } = require('../util');

const router = express.Router();

function pickInput(body) {
  return {
    leave_type_id: parseInt(body.leave_type_id, 10),
    start_date: body.start_date,
    end_date: body.end_date || body.start_date,
    is_half_day: body.is_half_day === true || body.is_half_day === 'true' || body.is_half_day === '1',
    half_day_period: ['AM', 'PM'].includes(body.half_day_period) ? body.half_day_period : null,
    reason: String(body.reason || '').trim().slice(0, 2000),
    detail_option: body.detail_option || null,
    detail_text: String(body.detail_text || '').trim().slice(0, 255) || null,
    commutation: body.commutation === 'REQUESTED' ? 'REQUESTED' : 'NOT_REQUESTED',
  };
}

async function employeeOf(q, id) {
  const e = (await q('SELECT * FROM employees WHERE id = ?', [id]))[0];
  if (!e) throw new HttpError(404, 'Employee not found');
  return e;
}

// Live validation for the filing form
router.post('/preview', wrap(async (req, res) => {
  const input = pickInput(req.body);
  if (!input.leave_type_id) return res.json({ errors: ['Select a leave type'], warnings: [], days: 0 });
  const employee = await employeeOf(db.query, req.user.employee_id);
  const excl = parseInt(req.body.request_id, 10) || 0;
  let existing = 0;
  if (excl) existing = (await db.one('SELECT COUNT(*) n FROM request_attachments WHERE request_id = ?', [excl])).n;
  const v = await wf.validate(db.query, { employee, input, excludeRequestId: excl, attachmentCount: (parseInt(req.body.attachment_count, 10) || 0) + existing });
  res.json({ errors: v.errors, warnings: v.warnings, days: v.days, estimate: v.estimate });
}));

// Submit a new application (multipart: fields + files)
router.post('/', upload.array('files', 5), wrap(async (req, res) => {
  const files = req.files || [];
  try {
    const input = pickInput(req.body);
    if (!input.leave_type_id) throw new HttpError(400, 'Select a leave type');
    const result = await db.tx(async (t) => {
      const employee = await employeeOf(t.query, req.user.employee_id);
      const v = await wf.validate(t.query, { employee, input, attachmentCount: files.length });
      if (v.errors.length) throw new HttpError(422, v.errors[0], { errors: v.errors, warnings: v.warnings });
      const ins = await t.query(
        `INSERT INTO leave_requests (tracking_no, employee_id, leave_type_id, start_date, end_date, is_half_day, half_day_period, days_applied,
            reason, detail_option, detail_text, commutation, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING')`,
        ['TMP-' + crypto.randomBytes(8).toString('hex'), employee.id, input.leave_type_id, input.start_date, input.end_date, input.is_half_day ? 1 : 0,
          input.is_half_day ? input.half_day_period : null, v.days, input.reason, input.detail_option, input.detail_text, input.commutation]);
      const id = ins.insertId;
      const tracking = `LV-${input.start_date.slice(0, 4)}-${String(id).padStart(6, '0')}`;
      await t.query('UPDATE leave_requests SET tracking_no = ? WHERE id = ?', [tracking, id]);
      for (const f of files) {
        await t.query('INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?)',
          [id, f.originalname.slice(0, 255), f.filename, f.mimetype, f.size, req.user.id]);
      }
      await t.query('INSERT INTO request_actions (request_id, actor_user_id, action, remarks) VALUES (?,?,?,?)', [id, req.user.id, 'SUBMIT', null]);
      const first = await wf.buildSteps(t.query, { id, leave_type_id: input.leave_type_id }, employee);
      const label = `${tracking} (${v.leave_type.name}, ${input.start_date}${input.end_date !== input.start_date ? ' to ' + input.end_date : ''})`;
      if (first) {
        await notify(await wf.approverUserIds(t.query, first), id, 'New leave application for your action', `${fullName(employee)} filed ${label}. Step: ${first.name}.`, t.query);
      }
      await notify([req.user.id], id, 'Leave application submitted', `${label} was submitted. Tracking ID: ${tracking}.`, t.query);
      await audit(req, 'REQUEST_SUBMIT', 'leave_request', id, { tracking, days: v.days }, t.query);
      if (!first) {
        // chain with no active steps: treat as approved immediately
        const r = await t.one('SELECT * FROM leave_requests WHERE id = ?', [id]);
        await credits.applyOnApproval(t, r, v.leave_type, req.user.id);
        await t.query(`UPDATE leave_requests SET status = 'APPROVED', final_action_at = NOW() WHERE id = ?`, [id]);
      }
      return { id, tracking_no: tracking, warnings: v.warnings };
    });
    res.status(201).json(result);
  } catch (e) {
    discard(files);
    throw e;
  }
}));

// Resubmit a returned application
router.put('/:id', upload.array('files', 5), wrap(async (req, res) => {
  const files = req.files || [];
  try {
    const id = parseInt(req.params.id, 10);
    const input = pickInput(req.body);
    const result = await db.tx(async (t) => {
      const r = await t.one('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [id]);
      if (!r || r.employee_id !== req.user.employee_id) throw new HttpError(404, 'Request not found');
      if (r.status !== 'RETURNED') throw new HttpError(409, 'Only returned applications can be revised');
      const existing = (await t.one('SELECT COUNT(*) n FROM request_attachments WHERE request_id = ?', [id])).n;
      const employee = await employeeOf(t.query, r.employee_id);
      const v = await wf.validate(t.query, { employee, input, excludeRequestId: id, attachmentCount: files.length + existing });
      if (v.errors.length) throw new HttpError(422, v.errors[0], { errors: v.errors, warnings: v.warnings });
      await t.query(
        `UPDATE leave_requests SET leave_type_id=?, start_date=?, end_date=?, is_half_day=?, half_day_period=?, days_applied=?, days_without_pay=0, is_lwop=0,
            reason=?, detail_option=?, detail_text=?, commutation=?, status='PENDING', credits_snapshot=NULL, submitted_at=NOW() WHERE id=?`,
        [input.leave_type_id, input.start_date, input.end_date, input.is_half_day ? 1 : 0, input.is_half_day ? input.half_day_period : null, v.days,
          input.reason, input.detail_option, input.detail_text, input.commutation, id]);
      for (const f of files) {
        await t.query('INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?)',
          [id, f.originalname.slice(0, 255), f.filename, f.mimetype, f.size, req.user.id]);
      }
      await t.query('INSERT INTO request_actions (request_id, actor_user_id, action, remarks) VALUES (?,?,?,?)', [id, req.user.id, 'RESUBMIT', String(req.body.remarks || '').trim() || null]);
      const first = await wf.buildSteps(t.query, { id, leave_type_id: input.leave_type_id }, employee);
      if (first) await notify(await wf.approverUserIds(t.query, first), id, 'Revised leave application for your action', `${fullName(employee)} resubmitted ${r.tracking_no}. Step: ${first.name}.`, t.query);
      await audit(req, 'REQUEST_RESUBMIT', 'leave_request', id, null, t.query);
      return { id, warnings: v.warnings };
    });
    res.json(result);
  } catch (e) {
    discard(files);
    throw e;
  }
}));

router.post('/:id/cancel', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const remarks = String(req.body.remarks || '').trim();
  const out = await db.tx(async (t) => {
    const r = await t.one('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [id]);
    if (!r) throw new HttpError(404, 'Request not found');
    const isOwner = r.employee_id === req.user.employee_id;
    const isHr = req.user.roles.includes('HR') || req.user.roles.includes('ADMIN');
    if (['PENDING', 'RETURNED'].includes(r.status)) {
      if (!isOwner && !isHr) throw new HttpError(403, 'Only the applicant or HR can cancel this request');
    } else if (r.status === 'APPROVED') {
      if (!isHr) throw new HttpError(403, 'Approved leave can only be cancelled by HR. Ask HR to cancel it.');
      if (!remarks) throw new HttpError(400, 'Remarks are required to cancel approved leave');
      const lt = await wf.getLeaveType(t.query, r.leave_type_id);
      await credits.restoreOnCancel(t, r, lt, req.user.id);
    } else {
      throw new HttpError(409, `This request is already ${r.status.toLowerCase()}`);
    }
    await t.query(`UPDATE leave_requests SET status = 'CANCELLED', current_step_order = NULL, final_action_at = NOW() WHERE id = ?`, [id]);
    await t.query(`UPDATE request_steps SET status = 'SKIPPED' WHERE request_id = ? AND status IN ('PENDING','WAITING')`, [id]);
    await t.query('INSERT INTO request_actions (request_id, actor_user_id, action, remarks) VALUES (?,?,?,?)', [id, req.user.id, 'CANCEL', remarks || null]);
    if (!isOwner) await notify([await wf.employeeUserId(t.query, r.employee_id)], id, 'Leave application cancelled', `${r.tracking_no} was cancelled by HR${remarks ? ': ' + remarks : ''}.`, t.query);
    await audit(req, 'REQUEST_CANCEL', 'leave_request', id, { previous: r.status, remarks }, t.query);
    return { status: 'CANCELLED' };
  });
  res.json(out);
}));

router.post('/:id/attachments', upload.array('files', 5), wrap(async (req, res) => {
  const files = req.files || [];
  try {
    const id = parseInt(req.params.id, 10);
    const r = await db.one('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (!r || r.employee_id !== req.user.employee_id) throw new HttpError(404, 'Request not found');
    if (!['PENDING', 'RETURNED'].includes(r.status)) throw new HttpError(409, 'Attachments can only be added while the request is pending or returned');
    if (!files.length) throw new HttpError(400, 'No file uploaded');
    for (const f of files) {
      await db.query('INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?)',
        [id, f.originalname.slice(0, 255), f.filename, f.mimetype, f.size, req.user.id]);
    }
    await audit(req, 'ATTACHMENT_ADD', 'leave_request', id, { count: files.length });
    res.status(201).json({ ok: true });
  } catch (e) {
    discard(files);
    throw e;
  }
}));

router.post('/:id/action', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const out = await wf.act(req.user, id, {
    action: String(req.body.action || '').toUpperCase(),
    remarks: req.body.remarks,
    return_to: req.body.return_to,
    days_without_pay: req.body.days_without_pay,
  });
  await audit(req, `REQUEST_${String(req.body.action || '').toUpperCase()}`, 'leave_request', id, { remarks: req.body.remarks || null, result: out.status });
  res.json(out);
}));

const LIST_SQL = `
  SELECT r.id, r.tracking_no, r.start_date, r.end_date, r.days_applied, r.days_with_pay, r.days_without_pay, r.status, r.is_lwop,
         r.submitted_at, r.final_action_at, r.is_half_day, r.half_day_period,
         t.code AS leave_code, t.name AS leave_name,
         e.id AS employee_id, e.employee_no, e.last_name, e.first_name, e.middle_name, e.position,
         d.name AS department_name,
         rs.name AS current_step
    FROM leave_requests r
    JOIN leave_types t ON t.id = r.leave_type_id
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN request_steps rs ON rs.request_id = r.id AND rs.step_order = r.current_step_order`;

router.get('/mine', wrap(async (req, res) => {
  const rows = await db.query(`${LIST_SQL} WHERE r.employee_id = ? ORDER BY r.submitted_at DESC LIMIT 500`, [req.user.employee_id]);
  res.json(rows);
}));

// Inbox: requests waiting for this user's action
router.get('/inbox', wrap(async (req, res) => {
  const w = wf.actionableWhere(req.user);
  const rows = await db.query(
    `${LIST_SQL.replace('LEFT JOIN request_steps rs ON rs.request_id = r.id AND rs.step_order = r.current_step_order', 'JOIN request_steps rs ON rs.request_id = r.id AND rs.step_order = r.current_step_order')}
     WHERE ${w.sql} ORDER BY r.start_date ASC`, w.params);
  res.json(rows);
}));

router.get('/acted', wrap(async (req, res) => {
  const rows = await db.query(
    `${LIST_SQL} WHERE r.id IN (SELECT request_id FROM request_actions WHERE actor_user_id = ? AND action IN ('APPROVE','RETURN','DISAPPROVE'))
     ORDER BY r.submitted_at DESC LIMIT 300`, [req.user.id]);
  res.json(rows);
}));

// All requests (HR/management: everyone; supervisors: their team)
router.get('/', wrap(async (req, res) => {
  const scope = await teamScope(req.user);
  if (scope && scope.length <= 1 && !req.user.is_supervisor) throw new HttpError(403, 'Not available');
  const where = ['1=1'];
  const params = [];
  if (scope) { where.push('r.employee_id IN (?)'); params.push(scope); }
  if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
  if (req.query.leave_type_id) { where.push('r.leave_type_id = ?'); params.push(req.query.leave_type_id); }
  if (req.query.department_id) { where.push('e.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.from) { where.push('r.end_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('r.start_date <= ?'); params.push(req.query.to); }
  if (req.query.q) {
    where.push('(r.tracking_no LIKE ? OR e.employee_no LIKE ? OR e.last_name LIKE ? OR e.first_name LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like, like);
  }
  const rows = await db.query(`${LIST_SQL} WHERE ${where.join(' AND ')} ORDER BY r.submitted_at DESC LIMIT 2000`, params);
  if (req.query.format === 'csv') {
    return sendCsv(res, 'leave-requests.csv', rows, [
      { label: 'Tracking No', key: 'tracking_no' }, { label: 'Employee No', key: 'employee_no' },
      { label: 'Employee', value: (r) => `${r.last_name}, ${r.first_name}` }, { label: 'Department', key: 'department_name' },
      { label: 'Leave Type', key: 'leave_name' }, { label: 'Start', key: 'start_date' }, { label: 'End', key: 'end_date' },
      { label: 'Days', key: 'days_applied' }, { label: 'With Pay', key: 'days_with_pay' }, { label: 'Without Pay', key: 'days_without_pay' },
      { label: 'Status', key: 'status' }, { label: 'Current Step', key: 'current_step' }, { label: 'Filed', key: 'submitted_at' },
    ]);
  }
  res.json(rows);
}));

router.get('/attachments/:attId', wrap(async (req, res) => {
  const a = await db.one('SELECT * FROM request_attachments WHERE id = ?', [req.params.attId]);
  if (!a) throw new HttpError(404, 'File not found');
  const r = await db.one('SELECT id, employee_id FROM leave_requests WHERE id = ?', [a.request_id]);
  if (!(await wf.canView(req.user, r))) throw new HttpError(404, 'File not found');
  const p = filePath(a.stored_name);
  if (!fs.existsSync(p)) throw new HttpError(404, 'File is missing on the server');
  res.setHeader('Content-Type', a.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${a.original_name.replace(/["\r\n]/g, '')}"`);
  fs.createReadStream(p).pipe(res);
}));

router.get('/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await db.one(`SELECT r.*, t.code AS leave_code, t.name AS leave_name, t.form6_detail, t.is_credit_type, t.deducts_from_type_id
                            FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id WHERE r.id = ?`, [id]);
  if (!r) throw new HttpError(404, 'Request not found');
  if (!(await wf.canView(req.user, r))) throw new HttpError(404, 'Request not found');
  const employee = await db.one(
    `SELECT e.id, e.employee_no, e.last_name, e.first_name, e.middle_name, e.suffix, e.position, e.salary_grade, e.monthly_salary, e.sex,
            d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?`, [r.employee_id]);
  const steps = await db.query(
    `SELECT rs.*, CONCAT(e.first_name,' ',e.last_name) AS approver_name, CONCAT(ae.first_name,' ',ae.last_name) AS acted_by_name, ae.position AS acted_by_position
       FROM request_steps rs LEFT JOIN employees e ON e.id = rs.approver_employee_id
       LEFT JOIN users au ON au.id = rs.acted_by_user_id LEFT JOIN employees ae ON ae.id = au.employee_id
      WHERE rs.request_id = ? ORDER BY rs.step_order`, [id]);
  const actions = await db.query(
    `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS actor_name, CONCAT(oe.first_name,' ',oe.last_name) AS on_behalf_name
       FROM request_actions a JOIN users u ON u.id = a.actor_user_id JOIN employees e ON e.id = u.employee_id
       LEFT JOIN users ou ON ou.id = a.on_behalf_of_user_id LEFT JOIN employees oe ON oe.id = ou.employee_id
      WHERE a.request_id = ? ORDER BY a.created_at, a.id`, [id]);
  const attachments = await db.query('SELECT id, original_name, mime_type, size_bytes, uploaded_at FROM request_attachments WHERE request_id = ?', [id]);
  const current = steps.find((s) => s.step_order === r.current_step_order);
  const perm = wf.canActOnStep(req.user, current, r);
  const out = { request: r, employee, steps, actions, attachments, can_act: perm.ok, admin_override: !!perm.override, current_step: current || null };
  const isOwner = r.employee_id === req.user.employee_id;
  out.can_cancel = (['PENDING', 'RETURNED'].includes(r.status) && (isOwner || req.user.roles.includes('HR') || req.user.roles.includes('ADMIN')))
    || (r.status === 'APPROVED' && (req.user.roles.includes('HR') || req.user.roles.includes('ADMIN')));
  out.can_edit = isOwner && r.status === 'RETURNED';
  out.credits_snapshot = r.credits_snapshot ? JSON.parse(r.credits_snapshot) : null;

  if (!isOwner) {
    // reviewer context: balances, recent history, overlapping team leave
    out.balances = await db.query(
      `SELECT t.code, t.name, COALESCE(b.balance,0) balance FROM leave_types t
         LEFT JOIN leave_balances b ON b.leave_type_id = t.id AND b.employee_id = ? WHERE t.is_credit_type = 1 ORDER BY t.sort_order`, [r.employee_id]);
    out.history = await db.query(
      `SELECT r.tracking_no, t.code leave_code, r.start_date, r.end_date, r.days_applied, r.status FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
        WHERE r.employee_id = ? AND r.id <> ? AND r.start_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) ORDER BY r.start_date DESC LIMIT 15`, [r.employee_id, id]);
    const emp = await db.one('SELECT supervisor_id, department_id FROM employees WHERE id = ?', [r.employee_id]);
    out.overlaps = await db.query(
      `SELECT r.tracking_no, r.start_date, r.end_date, r.status, t.code leave_code, CONCAT(e.first_name,' ',e.last_name) name
         FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
        WHERE r.id <> ? AND r.status IN ('PENDING','APPROVED') AND r.start_date <= ? AND r.end_date >= ?
          AND (e.department_id <=> ? OR e.supervisor_id <=> ?) ORDER BY r.start_date LIMIT 30`,
      [id, r.end_date, r.start_date, emp.department_id, emp.supervisor_id]);
  }
  res.json(out);
}));

module.exports = router;
