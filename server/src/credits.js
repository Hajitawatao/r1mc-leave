const db = require('./db');
const { round3, today, HttpError } = require('./util');

/** The balance a leave type draws from: itself if it is a credit type, else its deducts_from type, else null. */
function balanceTypeId(lt) {
  if (lt.is_credit_type) return lt.id;
  return lt.deducts_from_type_id || null;
}

async function getBalance(q, employeeId, typeId, lock = false) {
  const row = (await q(`SELECT balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?${lock ? ' FOR UPDATE' : ''}`, [employeeId, typeId]))[0];
  return row ? Number(row.balance) : 0;
}

/** Post a ledger entry and update the running balance. Must run inside a transaction (q = tx.query). */
async function post(q, { employeeId, typeId, days, txnType, requestId = null, period = null, remarks = null, userId = null, date = null }) {
  const current = await getBalance(q, employeeId, typeId, true);
  const next = round3(current + Number(days));
  await q(
    `INSERT INTO leave_balances (employee_id, leave_type_id, balance) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE balance = VALUES(balance)`, [employeeId, typeId, next]);
  await q(
    `INSERT INTO leave_ledger (employee_id, leave_type_id, txn_date, txn_type, days, balance_after, request_id, period, remarks, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [employeeId, typeId, date || today(), txnType, round3(Number(days)), next, requestId, period, remarks, userId]);
  return next;
}

/** Days already tied up in other pending/returned requests that draw from the same balance. */
async function pendingDays(q, employeeId, typeId, excludeRequestId = 0) {
  const row = (await q(
    `SELECT COALESCE(SUM(r.days_applied),0) d FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
      WHERE r.employee_id = ? AND r.status IN ('PENDING','RETURNED') AND r.id <> ?
        AND ((t.is_credit_type = 1 AND t.id = ?) OR (t.is_credit_type = 0 AND t.deducts_from_type_id = ?))`,
    [employeeId, excludeRequestId, typeId, typeId]))[0];
  return Number(row.d);
}

/** Apply credits when a request is finally approved. Returns {with_pay, without_pay}. */
async function applyOnApproval(t, request, leaveType, userId) {
  const bt = balanceTypeId(leaveType);
  const days = Number(request.days_applied);
  let withoutPay = Number(request.days_without_pay || 0);
  let withPay;
  if (bt) {
    const bal = await getBalance(t.query, request.employee_id, bt, true);
    const maxPaid = Math.max(0, Math.min(days - withoutPay, bal));
    withPay = Math.floor(maxPaid * 2) / 2; // keep half-day granularity
    withoutPay = round3(days - withPay);
    if (withPay > 0) {
      await post(t.query, { employeeId: request.employee_id, typeId: bt, days: -withPay, txnType: 'DEDUCTION', requestId: request.id, remarks: `${request.tracking_no} ${leaveType.code} ${request.start_date} to ${request.end_date}`, userId });
    }
    if (withoutPay > 0) {
      await post(t.query, { employeeId: request.employee_id, typeId: bt, days: 0, txnType: 'LWOP', requestId: request.id, remarks: `${request.tracking_no}: ${withoutPay} day(s) without pay`, userId });
    }
  } else {
    withPay = round3(days - withoutPay);
  }
  await t.query('UPDATE leave_requests SET days_with_pay = ?, days_without_pay = ?, is_lwop = ? WHERE id = ?', [withPay, withoutPay, withoutPay > 0 ? 1 : 0, request.id]);
  return { with_pay: withPay, without_pay: withoutPay };
}

/** Restore deducted credits when an approved request is cancelled. */
async function restoreOnCancel(t, request, leaveType, userId) {
  const bt = balanceTypeId(leaveType);
  if (!bt || !Number(request.days_with_pay)) return;
  await post(t.query, { employeeId: request.employee_id, typeId: bt, days: Number(request.days_with_pay), txnType: 'RESTORE', requestId: request.id, remarks: `${request.tracking_no} cancelled`, userId });
}

/**
 * Monthly accrual (CSC: 1.25 VL + 1.25 SL per month of service).
 * Days without pay in the month reduce the earned credit proportionally (1.25/30 per day).
 */
async function runAccrual(period, userId) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new HttpError(400, 'Period must be YYYY-MM');
  const { lastDayOfMonth } = require('./util');
  const end = lastDayOfMonth(period);
  if (end > today()) throw new HttpError(400, 'You can only post accrual for a month that has ended');
  const start = `${period}-01`;
  return db.tx(async (t) => {
    const exists = await t.one('SELECT id FROM accrual_runs WHERE period = ? FOR UPDATE', [period]);
    if (exists) throw new HttpError(409, `Accrual for ${period} was already posted`);
    const types = await t.query('SELECT id, code, accrual_per_month FROM leave_types WHERE is_credit_type = 1 AND accrual_per_month > 0 AND is_active = 1');
    const emps = await t.query('SELECT id FROM employees WHERE is_active = 1 AND (date_hired IS NULL OR date_hired <= ?)', [end]);
    const lwop = await t.query(
      `SELECT employee_id, SUM(days_without_pay) d FROM leave_requests
        WHERE status = 'APPROVED' AND days_without_pay > 0 AND start_date BETWEEN ? AND ? GROUP BY employee_id`, [start, end]);
    const lwopMap = new Map(lwop.map((r) => [r.employee_id, Number(r.d)]));
    for (const e of emps) {
      const lw = lwopMap.get(e.id) || 0;
      for (const ty of types) {
        const rate = Number(ty.accrual_per_month);
        const earned = Math.max(0, round3(rate - (rate / 30) * lw));
        await post(t.query, { employeeId: e.id, typeId: ty.id, days: earned, txnType: 'ACCRUAL', period, date: end, remarks: `Accrual ${period}${lw ? ` (less ${lw} day(s) LWOP)` : ''}`, userId });
      }
    }
    await t.query('INSERT INTO accrual_runs (period, employees_count, run_by) VALUES (?,?,?)', [period, emps.length, userId]);
    return { period, employees: emps.length, types: types.map((x) => x.code) };
  });
}

module.exports = { balanceTypeId, getBalance, post, pendingDays, applyOnApproval, restoreOnCancel, runAccrual };
