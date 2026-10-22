// Import employees + opening leave balances from Excel (.xlsx) or CSV
const express = require('express');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const db = require('../db');
const credits = require('../credits');
const { requireRole } = require('../auth');
const { memoryUpload } = require('../upload');
const { HttpError, wrap, audit, isDateStr } = require('../util');

const router = express.Router();
router.use(requireRole('HR'));

const BASE_COLUMNS = ['employee_no', 'last_name', 'first_name', 'middle_name', 'suffix', 'sex', 'position', 'salary_grade', 'monthly_salary',
  'department_code', 'department_name', 'supervisor_employee_no', 'employment_status', 'date_hired', 'email', 'roles'];
const ROLES = ['HR', 'ACCOUNTING', 'OSH', 'CAO', 'MANAGEMENT'];

async function creditTypes() {
  return db.query('SELECT id, code FROM leave_types WHERE is_credit_type = 1 ORDER BY sort_order');
}

router.get('/template', wrap(async (req, res) => {
  const types = await creditTypes();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  const cols = [...BASE_COLUMNS, ...types.map((t) => `${t.code.toLowerCase()}_balance`)];
  ws.addRow(cols);
  ws.addRow(['2019-0001', 'Dela Cruz', 'Juan', 'Santos', '', 'M', 'Nurse II', '15', 41000, 'NSG', 'Nursing Service', '2010-0005', 'Permanent', '2019-03-01', 'juan@r1mc.local', '', ...types.map(() => 12.5)]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 18; });
  const notes = wb.addWorksheet('Instructions');
  [
    'One row per employee. Required: employee_no, last_name, first_name.',
    'sex: M or F. date_hired: YYYY-MM-DD (or an Excel date). monthly_salary: number.',
    'department_code + department_name: the department is created if it does not exist.',
    'supervisor_employee_no: the immediate supervisor (must also be in the file or already in the system).',
    'roles (optional): comma-separated from HR, ACCOUNTING, OSH, CAO, MANAGEMENT. ADMIN cannot be granted by import.',
    '*_balance columns: opening leave credits from the Excel leave ledger, as of the cut-off date.',
    'Opening balances are only applied to employees with no leave history yet, unless you tick "Overwrite balances".',
    'New employees get a login: username = employee_no, initial password = employee_no (must be changed at first login).',
    'Re-importing the same file updates existing employees (matched by employee_no).',
  ].forEach((t) => notes.addRow([t]));
  notes.getColumn(1).width = 120;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result !== undefined) return cellValue(v.result);
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if (v.hyperlink) return String(v.text || v.hyperlink).replace(/^mailto:/, '');
  }
  return String(v).trim();
}

async function readRows(file) {
  const wb = new ExcelJS.Workbook();
  const name = (file.originalname || '').toLowerCase();
  let ws;
  if (name.endsWith('.csv')) {
    ws = await wb.csv.read(Readable.from(file.buffer.toString('utf8').replace(/^﻿/, '')));
  } else if (name.endsWith('.xlsx')) {
    await wb.xlsx.load(file.buffer);
    ws = wb.worksheets[0];
  } else {
    throw new HttpError(400, 'Upload an .xlsx or .csv file (save older .xls files as .xlsx first)');
  }
  if (!ws) throw new HttpError(400, 'The file has no worksheet');
  const rows = [];
  let headers = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values.slice(1).map(cellValue);
    if (!headers) { headers = vals.map((h) => h.toLowerCase().trim().replace(/[\s.]+/g, '_')); return; }
    if (vals.every((v) => v === '')) return;
    const obj = { _row: row.number };
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
    rows.push(obj);
  });
  if (!headers) throw new HttpError(400, 'The file is empty');
  for (const req of ['employee_no', 'last_name', 'first_name']) {
    if (!headers.includes(req)) throw new HttpError(400, `Missing required column: ${req}. Download the template for the expected columns.`);
  }
  return rows;
}

router.post('/employees', memoryUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to import');
  const dryRun = req.body.dry_run !== 'false';
  const overwrite = req.body.overwrite_balances === 'true';
  const rows = await readRows(req.file);
  const types = await creditTypes();
  const errors = [];
  const seen = new Set();
  const valid = [];
  for (const r of rows) {
    const rowErr = [];
    const no = String(r.employee_no || '').trim();
    if (!no) rowErr.push('employee_no is empty');
    if (!r.last_name || !r.first_name) rowErr.push('last_name and first_name are required');
    if (seen.has(no)) rowErr.push(`duplicate employee_no ${no} in file`);
    seen.add(no);
    const sex = String(r.sex || '').trim().toUpperCase().slice(0, 1);
    if (sex && !['M', 'F'].includes(sex)) rowErr.push('sex must be M or F');
    if (r.date_hired && !isDateStr(r.date_hired)) rowErr.push('date_hired must be YYYY-MM-DD');
    if (r.monthly_salary && Number.isNaN(Number(String(r.monthly_salary).replace(/,/g, '')))) rowErr.push('monthly_salary is not a number');
    const roles = String(r.roles || '').split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const badRoles = roles.filter((x) => !ROLES.includes(x));
    if (badRoles.length) rowErr.push(`unknown role(s): ${badRoles.join(', ')}`);
    const balances = {};
    for (const t of types) {
      const key = `${t.code.toLowerCase()}_balance`;
      if (r[key] !== undefined && r[key] !== '') {
        const n = Number(String(r[key]).replace(/,/g, ''));
        if (Number.isNaN(n)) rowErr.push(`${key} is not a number`); else balances[t.id] = n;
      }
    }
    if (rowErr.length) errors.push({ row: r._row, employee_no: no, errors: rowErr });
    else valid.push({ ...r, employee_no: no, sex: sex || null, roles, balances });
  }
  // supervisors must exist in file or DB
  const existing = new Set((await db.query('SELECT employee_no FROM employees')).map((e) => e.employee_no));
  for (const v of valid) {
    if (v.supervisor_employee_no && !seen.has(v.supervisor_employee_no) && !existing.has(v.supervisor_employee_no)) {
      errors.push({ row: v._row, employee_no: v.employee_no, errors: [`supervisor ${v.supervisor_employee_no} not found`] });
      v._skip = true;
    }
  }
  const good = valid.filter((v) => !v._skip);
  const summary = {
    total_rows: rows.length, valid_rows: good.length, error_rows: errors.length,
    new_employees: good.filter((v) => !existing.has(v.employee_no)).length,
    updated_employees: good.filter((v) => existing.has(v.employee_no)).length,
    errors: errors.slice(0, 200), dry_run: dryRun,
  };
  if (dryRun) return res.json(summary);

  const result = await db.tx(async (t) => {
    let balancesSet = 0;
    const deptIds = new Map((await t.query('SELECT id, code FROM departments')).map((d) => [d.code, d.id]));
    for (const v of good) {
      const code = String(v.department_code || '').trim().toUpperCase();
      if (code && !deptIds.has(code)) {
        const d = await t.query('INSERT INTO departments (code, name) VALUES (?,?)', [code, String(v.department_name || code).trim()]);
        deptIds.set(code, d.insertId);
      }
      const f = {
        employee_no: v.employee_no, last_name: String(v.last_name).trim(), first_name: String(v.first_name).trim(),
        middle_name: v.middle_name || null, suffix: v.suffix || null, sex: v.sex, position: v.position || null, salary_grade: v.salary_grade || null,
        monthly_salary: v.monthly_salary ? Number(String(v.monthly_salary).replace(/,/g, '')) : null,
        department_id: code ? deptIds.get(code) : null, employment_status: v.employment_status || null,
        date_hired: v.date_hired || null, email: v.email || null, is_active: 1,
      };
      const cur = await t.one('SELECT id FROM employees WHERE employee_no = ?', [v.employee_no]);
      let empId;
      if (cur) { empId = cur.id; await t.query('UPDATE employees SET ? WHERE id = ?', [f, empId]); } else { empId = (await t.query('INSERT INTO employees SET ?', [f])).insertId; }
      v._id = empId;
      let user = await t.one('SELECT id FROM users WHERE employee_id = ?', [empId]);
      if (!user) {
        const uname = (await t.one('SELECT id FROM users WHERE username = ?', [v.employee_no])) ? `${v.employee_no}-${empId}` : v.employee_no;
        user = { id: (await t.query('INSERT INTO users (employee_id, username, password_hash) VALUES (?,?,?)', [empId, uname, await bcrypt.hash(v.employee_no, 8)])).insertId };
      }
      if (v.roles.length) {
        for (const role of v.roles) await t.query('INSERT IGNORE INTO user_roles (user_id, role) VALUES (?,?)', [user.id, role]);
      }
      for (const [typeId, amount] of Object.entries(v.balances)) {
        const hasHistory = await t.one('SELECT id FROM leave_ledger WHERE employee_id = ? AND leave_type_id = ? LIMIT 1', [empId, typeId]);
        if (!hasHistory) {
          await credits.post(t.query, { employeeId: empId, typeId: Number(typeId), days: amount, txnType: 'OPENING', remarks: 'Opening balance (import)', userId: req.user.id, date: req.body.as_of && isDateStr(req.body.as_of) ? req.body.as_of : null });
          balancesSet += 1;
        } else if (overwrite) {
          const bal = await credits.getBalance(t.query, empId, Number(typeId), true);
          if (bal !== amount) {
            await credits.post(t.query, { employeeId: empId, typeId: Number(typeId), days: amount - bal, txnType: 'ADJUSTMENT', remarks: 'Balance re-synced from import', userId: req.user.id });
            balancesSet += 1;
          }
        }
      }
    }
    // second pass: supervisors
    for (const v of good) {
      if (!v.supervisor_employee_no) continue;
      const sup = await t.one('SELECT id FROM employees WHERE employee_no = ?', [v.supervisor_employee_no]);
      if (sup && sup.id !== v._id) await t.query('UPDATE employees SET supervisor_id = ? WHERE id = ?', [sup.id, v._id]);
    }
    await audit(req, 'EMPLOYEE_IMPORT', 'import', null, { file: req.file.originalname, ...summary, errors: undefined, balances_set: balancesSet }, t.query);
    return { balances_set: balancesSet };
  });
  res.json({ ...summary, ...result });
}));

module.exports = router;
