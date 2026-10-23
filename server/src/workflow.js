const db = require('./db');
const credits = require('./credits');
const { notify } = require('./notify');
const { HttpError, isDateStr, countDays, today, diffDays, round3, fullName } = require('./util');

const FORM6_OPTIONS = {
  LOCATION: ['WITHIN_PH', 'ABROAD'],
  ILLNESS: ['IN_HOSPITAL', 'OUT_PATIENT'],
  WOMEN_ILLNESS: ['ILLNESS'],
  STUDY: ['MASTERS', 'BAR_BOARD'],
  OTHER: ['MONETIZATION', 'TERMINAL'],
};

async function getLeaveType(q, id) {
  const lt = (await q('SELECT * FROM leave_types WHERE id = ?', [id]))[0];
  if (!lt) throw new HttpError(400, 'Unknown leave type');
  return lt;
}

/**
 * Validate a leave application. Returns { errors, warnings, days, estimate }.
 * Used for the live preview on the form and again on submit.
 */
async function validate(q, { employee, input, excludeRequestId = 0, attachmentCount = 0 }) {
  const errors = [];
  const warnings = [];
  const lt = await getLeaveType(q, input.leave_type_id);
  if (!lt.is_active) errors.push(`${lt.name} is not currently available`);
  const { start_date: s, end_date: e } = input;
  if (!isDateStr(s) || !isDateStr(e)) {
    errors.push('Enter valid start and end dates');
    return { errors, warnings, days: 0, leave_type: lt };
  }
  if (e < s) errors.push('End date cannot be earlier than start date');

  let days = e >= s ? await countDays(s, e, lt.day_count, q) : 0;
  const half = !!input.is_half_day;
  if (half) {
    if (!lt.allow_half_day) errors.push(`${lt.name} cannot be filed as half day`);
    if (s !== e) errors.push('Half day applies to a single date only');
    if (days === 1) days = 0.5;
  }
  if (e >= s && days <= 0) errors.push('The selected dates fall on weekends or holidays only');

  if (lt.sex_restriction !== 'ANY' && employee.sex && employee.sex !== lt.sex_restriction) {
    errors.push(`${lt.name} is only available to ${lt.sex_restriction === 'F' ? 'female' : 'male'} employees`);
  }
  if (lt.sex_restriction !== 'ANY' && !employee.sex) warnings.push('Your sex is not recorded in your employee profile; HR will verify eligibility');

  if (lt.max_days_per_request && days > Number(lt.max_days_per_request)) {
    errors.push(`${lt.name} is limited to ${Number(lt.max_days_per_request)} day(s) per application`);
  }
  if (lt.max_days_per_year && isDateStr(s)) {
    const year = s.slice(0, 4);
    const used = (await q(
      `SELECT COALESCE(SUM(days_applied),0) d FROM leave_requests
        WHERE employee_id = ? AND leave_type_id = ? AND status IN ('PENDING','RETURNED','APPROVED') AND YEAR(start_date) = ? AND id <> ?`,
      [employee.id, lt.id, year, excludeRequestId]))[0].d;
    if (Number(used) + days > Number(lt.max_days_per_year)) {
      errors.push(`${lt.name} is limited to ${Number(lt.max_days_per_year)} day(s) per year; you have already used or filed ${Number(used)}`);
    }
  }

  const overlap = await q(
    `SELECT tracking_no FROM leave_requests WHERE employee_id = ? AND id <> ? AND status IN ('PENDING','RETURNED','APPROVED')
      AND start_date <= ? AND end_date >= ?`, [employee.id, excludeRequestId, e, s]);
  if (overlap.length) errors.push(`These dates overlap with your other application(s): ${overlap.map((o) => o.tracking_no).join(', ')}`);

  if (lt.form6_detail !== 'NONE') {
    const allowed = FORM6_OPTIONS[lt.form6_detail] || [];
    if (input.detail_option && !allowed.includes(input.detail_option)) errors.push('Invalid leave detail option');
    if (['LOCATION', 'ILLNESS', 'WOMEN_ILLNESS'].includes(lt.form6_detail) && !input.detail_option && lt.form6_detail !== 'WOMEN_ILLNESS') {
      errors.push('Complete the details of leave (section 6.B)');
    }
    if (['ABROAD', 'IN_HOSPITAL', 'OUT_PATIENT', 'ILLNESS'].includes(input.detail_option) && !String(input.detail_text || '').trim()) {
      errors.push('Specify the details (country or illness)');
    }
  }

  const needsAttachment = lt.attachment_rule === 'ALWAYS' || (lt.attachment_rule === 'OVER_DAYS' && days > Number(lt.attachment_threshold_days || 0));
  if (needsAttachment && attachmentCount === 0) {
    errors.push(`A supporting document is required${lt.attachment_note ? `: ${lt.attachment_note}` : ''}`);
  }

  if (lt.min_advance_days > 0 && isDateStr(s) && diffDays(today(), s) < lt.min_advance_days) {
    warnings.push(`${lt.name} should be filed at least ${lt.min_advance_days} day(s) in advance`);
  }
  if (lt.code === 'SL' && isDateStr(s) && s > today()) {
    warnings.push('Sick leave filed in advance requires a medical certificate stating the need for leave');
  }

  let estimate = null;
  const bt = credits.balanceTypeId(lt);
  if (bt && days > 0) {
    const balType = bt === lt.id ? lt : await getLeaveType(q, bt);
    const balance = await credits.getBalance(q, employee.id, bt);
    const pending = await credits.pendingDays(q, employee.id, bt, excludeRequestId);
    const available = round3(Math.max(0, balance - pending));
    const withPay = Math.floor(Math.min(days, available) * 2) / 2;
    const withoutPay = round3(days - withPay);
    estimate = { balance_type: balType.code, balance_type_name: balType.name, balance, pending, available, with_pay: withPay, without_pay: withoutPay };
    if (withoutPay > 0) {
      if (lt.insufficient_credit_action === 'BLOCK') errors.push(`Insufficient ${balType.name} credits: ${available} available, ${days} applied`);
      else warnings.push(`Insufficient ${balType.name} credits: ${withoutPay} day(s) will be processed as Leave Without Pay (LWOP)`);
    }
  } else if (days > 0) {
    estimate = { balance_type: null, with_pay: days, without_pay: 0 };
  }
  return { errors, warnings, days, estimate, leave_type: lt };
}

async function chainFor(q, leaveTypeId) {
  let steps = await q('SELECT * FROM approval_steps WHERE leave_type_id = ? ORDER BY step_order', [leaveTypeId]);
  if (!steps.length) steps = await q('SELECT * FROM approval_steps WHERE leave_type_id IS NULL ORDER BY step_order', []);
  if (!steps.length) throw new HttpError(500, 'No approval chain is configured. Ask HR/Admin to set one up.');
  return steps;
}

/** Copy the chain onto the request, resolving supervisor/department head to actual people. */
async function buildSteps(q, request, employee) {
  await q('DELETE FROM request_steps WHERE request_id = ?', [request.id]);
  const chain = await chainFor(q, request.leave_type_id);
  const dept = employee.department_id ? (await q('SELECT head_employee_id FROM departments WHERE id = ?', [employee.department_id]))[0] : null;
  let order = 0;
  for (const st of chain) {
    let type = st.approver_type;
    let role = st.approver_role;
    let approver = null;
    let name = st.name;
    let status = 'WAITING';
    if (type === 'SUPERVISOR' || type === 'DEPT_HEAD') {
      approver = type === 'SUPERVISOR' ? (employee.supervisor_id || (dept && dept.head_employee_id)) : ((dept && dept.head_employee_id) || employee.supervisor_id);
      if (approver === employee.id) {
        // the applicant is their own supervisor/head: go one level up, else skip
        const up = (await q('SELECT supervisor_id FROM employees WHERE id = ?', [employee.id]))[0];
        approver = up && up.supervisor_id && up.supervisor_id !== employee.id ? up.supervisor_id : null;
        if (!approver) status = 'SKIPPED';
      }
      if (!approver && status !== 'SKIPPED') {
        type = 'ROLE'; role = 'HR'; name = `${st.name} (no supervisor on record - routed to HR)`;
      } else if (approver) {
        const hasUser = (await q('SELECT id FROM users WHERE employee_id = ? AND is_active = 1', [approver]))[0];
        if (!hasUser) { type = 'ROLE'; role = 'HR'; approver = null; name = `${st.name} (approver has no account - routed to HR)`; }
      }
    }
    order += 1;
    await q(
      `INSERT INTO request_steps (request_id, step_order, name, approver_type, approver_role, approver_employee_id, certifies_credits, status)
       VALUES (?,?,?,?,?,?,?,?)`, [request.id, order, name, type, role, approver, st.certifies_credits, status]);
  }
  return activateNext(q, request.id, 0);
}

/** Make the next non-skipped step PENDING. Returns the step or null if the chain is finished. */
async function activateNext(q, requestId, afterOrder) {
  const next = (await q(`SELECT * FROM request_steps WHERE request_id = ? AND step_order > ? AND status <> 'SKIPPED' ORDER BY step_order LIMIT 1`, [requestId, afterOrder]))[0];
  if (!next) {
    await q('UPDATE leave_requests SET current_step_order = NULL WHERE id = ?', [requestId]);
    return null;
  }
  await q(`UPDATE request_steps SET status = 'PENDING' WHERE id = ?`, [next.id]);
  await q('UPDATE leave_requests SET current_step_order = ? WHERE id = ?', [next.step_order, requestId]);
  return next;
}

/** User ids who should be notified that a step is waiting for them (approvers + their active delegates). */
async function approverUserIds(q, step) {
  let base;
  if (step.approver_type === 'ROLE') {
    base = (await q(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id WHERE r.role = ? AND u.is_active = 1`, [step.approver_role])).map((r) => r.id);
  } else {
    base = (await q('SELECT id FROM users WHERE employee_id = ? AND is_active = 1', [step.approver_employee_id])).map((r) => r.id);
  }
  if (!base.length) return [];
  const t = today();
  const dels = (await q(`SELECT delegate_user_id id FROM delegations WHERE delegator_user_id IN (?) AND is_active = 1 AND ? BETWEEN start_date AND end_date`, [base, t])).map((r) => r.id);
  return Array.from(new Set([...base, ...dels]));
}

/** Can this user act on this step? Returns {ok, onBehalfOf}. */
function canActOnStep(user, step, request) {
  if (!step || step.status !== 'PENDING') return { ok: false };
  if (request.employee_id === user.employee_id) return { ok: false };
  if (step.approver_type === 'ROLE') {
    if (user.roles.includes(step.approver_role)) return { ok: true };
    if (user.delegated_roles.includes(step.approver_role)) return { ok: true, onBehalfOf: null, delegated: true };
    return adminOverride(user);
  }
  if (step.approver_employee_id === user.employee_id) return { ok: true };
  const d = user.delegated_from.find((x) => x.employee_id === step.approver_employee_id);
  if (d) return { ok: true, onBehalfOf: d.user_id };
  return adminOverride(user);
}

// Admin (MIS) can act on any step; the action is labeled as an override in the history and audit trail.
function adminOverride(user) {
  return user.roles.includes('ADMIN') ? { ok: true, override: true } : { ok: false };
}

/** SQL fragment + params selecting request_steps rows (alias rs) the user can act on now. */
function actionableWhere(user) {
  const roles = Array.from(new Set([...user.roles, ...user.delegated_roles]));
  const empIds = [user.employee_id, ...user.delegated_from.map((d) => d.employee_id)];
  return {
    sql: `rs.status = 'PENDING' AND r.status = 'PENDING' AND r.employee_id <> ? AND (
            (rs.approver_type = 'ROLE' AND rs.approver_role IN (?)) OR
            (rs.approver_type <> 'ROLE' AND rs.approver_employee_id IN (?)))`,
    params: [user.employee_id, roles, empIds],
  };
}

async function canView(user, request) {
  if (request.employee_id === user.employee_id || user.org_wide) return true;
  const steps = await db.query('SELECT approver_type, approver_role, approver_employee_id FROM request_steps WHERE request_id = ?', [request.id]);
  const roles = [...user.roles, ...user.delegated_roles];
  const emps = [user.employee_id, ...user.delegated_from.map((d) => d.employee_id)];
  if (steps.some((s) => (s.approver_type === 'ROLE' ? roles.includes(s.approver_role) : emps.includes(s.approver_employee_id)))) return true;
  const emp = await db.one('SELECT supervisor_id, department_id FROM employees WHERE id = ?', [request.employee_id]);
  if (emp && emp.supervisor_id === user.employee_id) return true;
  if (emp && emp.department_id) {
    const d = await db.one('SELECT head_employee_id FROM departments WHERE id = ?', [emp.department_id]);
    if (d && d.head_employee_id === user.employee_id) return true;
  }
  return false;
}

async function employeeUserId(q, employeeId) {
  const u = (await q('SELECT id FROM users WHERE employee_id = ?', [employeeId]))[0];
  return u ? u.id : null;
}

/**
 * Approve / return / disapprove the current step.
 * opts: { action: 'APPROVE'|'RETURN'|'DISAPPROVE', remarks, return_to: 'EMPLOYEE'|'PREVIOUS', days_without_pay }
 */
async function act(user, requestId, opts) {
  return db.tx(async (t) => {
    const r = await t.one('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [requestId]);
    if (!r) throw new HttpError(404, 'Request not found');
    if (r.status !== 'PENDING') throw new HttpError(409, `This request is already ${r.status.toLowerCase()}`);
    const step = await t.one('SELECT * FROM request_steps WHERE request_id = ? AND step_order = ?', [r.id, r.current_step_order]);
    const perm = canActOnStep(user, step, r);
    if (!perm.ok) throw new HttpError(403, 'You are not the approver for the current step of this request');
    let remarks = String(opts.remarks || '').trim();
    if (perm.override && remarks) remarks = `[Admin override] ${remarks}`;
    else if (perm.override) remarks = '[Admin override]';
    const lt = await getLeaveType(t.query, r.leave_type_id);
    const empUser = await employeeUserId(t.query, r.employee_id);
    const label = `${r.tracking_no} (${lt.name}, ${r.start_date}${r.end_date !== r.start_date ? ' to ' + r.end_date : ''})`;
    const record = (action) => t.query(
      'INSERT INTO request_actions (request_id, step_order, step_name, actor_user_id, on_behalf_of_user_id, action, remarks) VALUES (?,?,?,?,?,?,?)',
      [r.id, step.step_order, step.name, user.id, perm.onBehalfOf || null, action, remarks || null]);

    if (opts.action === 'APPROVE') {
      if (opts.days_without_pay !== undefined && opts.days_without_pay !== null && opts.days_without_pay !== '') {
        if (!step.certifies_credits) throw new HttpError(403, 'Only the credit-certifying step (HR) can set days without pay');
        const lw = Number(opts.days_without_pay);
        if (!(lw >= 0 && lw <= Number(r.days_applied)) || (lw * 2) % 1 !== 0) throw new HttpError(400, 'Days without pay must be between 0 and the days applied, in half-day steps');
        await t.query('UPDATE leave_requests SET days_without_pay = ?, is_lwop = ? WHERE id = ?', [lw, lw > 0 ? 1 : 0, r.id]);
        r.days_without_pay = lw;
        if (lw > 0) {
          await t.query('INSERT INTO request_actions (request_id, step_order, step_name, actor_user_id, action, remarks) VALUES (?,?,?,?,?,?)',
            [r.id, step.step_order, step.name, user.id, 'MARK_LWOP', `${lw} day(s) marked without pay`]);
        }
      }
      if (step.certifies_credits) {
        const bt = credits.balanceTypeId(lt);
        const snap = {};
        const types = await t.query('SELECT id, code FROM leave_types WHERE is_credit_type = 1');
        for (const ty of types) snap[ty.code] = await credits.getBalance(t.query, r.employee_id, ty.id);
        snap.as_of = today();
        snap.certified_by = fullName(user);
        snap.balance_type = bt ? types.find((x) => x.id === bt)?.code : null;
        await t.query('UPDATE leave_requests SET credits_snapshot = ? WHERE id = ?', [JSON.stringify(snap), r.id]);
      }
      await t.query(`UPDATE request_steps SET status = 'APPROVED', acted_by_user_id = ?, acted_at = NOW(), remarks = ? WHERE id = ?`, [user.id, remarks || null, step.id]);
      await record('APPROVE');
      const next = await activateNext(t.query, r.id, step.step_order);
      if (next) {
        await notify(await approverUserIds(t.query, next), r.id, 'Leave application for your action', `${label} is waiting for your review (${next.name}).`, t.query);
        await notify([empUser], r.id, 'Leave application moved forward', `${label} was approved at "${step.name}" and is now at "${next.name}".`, t.query);
        return { status: 'PENDING', next_step: next.name };
      }
      const split = await credits.applyOnApproval(t, r, lt, user.id);
      await t.query(`UPDATE leave_requests SET status = 'APPROVED', final_action_at = NOW() WHERE id = ?`, [r.id]);
      const lwopMsg = split.without_pay > 0 ? ` ${split.without_pay} day(s) were processed as Leave Without Pay.` : '';
      await notify([empUser], r.id, split.without_pay > 0 ? 'Leave approved - processed with LWOP' : 'Leave approved', `${label} has been approved: ${split.with_pay} day(s) with pay.${lwopMsg}`, t.query);
      if (split.without_pay > 0) {
        const acct = (await t.query(`SELECT u.id FROM users u JOIN user_roles x ON x.user_id = u.id WHERE x.role = 'ACCOUNTING' AND u.is_active = 1`)).map((x) => x.id);
        await notify(acct, r.id, 'LWOP for payroll', `${label}: ${split.without_pay} day(s) without pay for payroll deduction.`, t.query);
      }
      return { status: 'APPROVED', ...split };
    }

    if (!String(opts.remarks || '').trim()) throw new HttpError(400, 'Remarks are required when returning or disapproving');

    if (opts.action === 'RETURN') {
      await t.query(`UPDATE request_steps SET status = 'RETURNED', acted_by_user_id = ?, acted_at = NOW(), remarks = ? WHERE id = ?`, [user.id, remarks, step.id]);
      await record('RETURN');
      if (opts.return_to === 'PREVIOUS') {
        const prev = await t.one(`SELECT * FROM request_steps WHERE request_id = ? AND step_order < ? AND status = 'APPROVED' ORDER BY step_order DESC LIMIT 1`, [r.id, step.step_order]);
        if (prev) {
          await t.query(`UPDATE request_steps SET status = 'WAITING' WHERE id = ?`, [step.id]);
          await t.query(`UPDATE request_steps SET status = 'PENDING', acted_by_user_id = NULL, acted_at = NULL WHERE id = ?`, [prev.id]);
          await t.query('UPDATE leave_requests SET current_step_order = ? WHERE id = ?', [prev.step_order, r.id]);
          await notify(await approverUserIds(t.query, prev), r.id, 'Leave application returned to you', `${label} was returned by "${step.name}" for re-review: ${remarks}`, t.query);
          return { status: 'PENDING', returned_to: prev.name };
        }
      }
      await t.query(`UPDATE leave_requests SET status = 'RETURNED', current_step_order = NULL WHERE id = ?`, [r.id]);
      await notify([empUser], r.id, 'Leave application returned for revision', `${label} was returned by "${step.name}": ${remarks}`, t.query);
      return { status: 'RETURNED' };
    }

    if (opts.action === 'DISAPPROVE') {
      await t.query(`UPDATE request_steps SET status = 'DISAPPROVED', acted_by_user_id = ?, acted_at = NOW(), remarks = ? WHERE id = ?`, [user.id, remarks, step.id]);
      await record('DISAPPROVE');
      await t.query(`UPDATE leave_requests SET status = 'DISAPPROVED', current_step_order = NULL, final_action_at = NOW() WHERE id = ?`, [r.id]);
      await notify([empUser], r.id, 'Leave application disapproved', `${label} was disapproved at "${step.name}": ${remarks}`, t.query);
      return { status: 'DISAPPROVED' };
    }
    throw new HttpError(400, 'Unknown action');
  });
}

module.exports = { validate, buildSteps, approverUserIds, canActOnStep, actionableWhere, canView, act, getLeaveType, employeeUserId, FORM6_OPTIONS };
