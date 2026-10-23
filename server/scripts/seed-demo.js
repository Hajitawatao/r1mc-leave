/* Demo/UAT data: a few departments and employees covering every approver role.
 * Every demo account has password Demo@1234. Do NOT run on the production database. */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../src/config');

const DEPTS = [
  ['NSG', 'Nursing Service'], ['HRMO', 'Human Resource Management Office'], ['ACCTG', 'Accounting Section'],
  ['OSH', 'Occupational Safety and Health'], ['MIS', 'Management Information Service'],
  ['ADM', 'Administrative Division'], ['OMCC', 'Office of the Medical Center Chief'],
];
// employee_no, last, first, sex, position, dept, supervisor_no, roles, VL, SL
const EMPS = [
  ['D-1001', 'Reyes', 'Maria', 'F', 'Chief Nurse', 'NSG', null, [], 40, 55],
  ['D-1002', 'Santos', 'Ana', 'F', 'Nurse II', 'NSG', 'D-1001', [], 12.5, 10],
  ['D-1003', 'Garcia', 'Jose', 'M', 'Nurse I', 'NSG', 'D-1001', [], 1, 3],
  ['D-2001', 'Mamaril', 'Andre', 'M', 'Supervising Administrative Officer', 'HRMO', null, ['HR'], 30, 30],
  ['D-2002', 'Bautista', 'Liza', 'F', 'Administrative Officer III', 'HRMO', 'D-2001', ['HR'], 15, 15],
  ['D-3001', 'Ramos', 'Carlo', 'M', 'Accountant III', 'ACCTG', null, ['ACCOUNTING'], 20, 20],
  ['D-4001', 'Flores', 'Grace', 'F', 'Medical Officer III (OSH)', 'OSH', null, ['OSH'], 20, 20],
  ['D-5001', 'Valdez', 'Kelvin', 'M', 'Computer Maintenance Technologist III', 'MIS', null, ['ADMIN'], 18, 22],
  ['D-6001', 'Aquino', 'Ramon', 'M', 'Chief Administrative Officer', 'ADM', 'D-7001', ['CAO'], 45, 50],
  ['D-7001', 'Mendoza', 'Elena', 'F', 'Medical Center Chief II', 'OMCC', null, ['MANAGEMENT'], 60, 60],
];

async function main() {
  const db = await mysql.createConnection(config.db);
  const hash = await bcrypt.hash('Demo@1234', 10);
  const [[vl]] = await db.query("SELECT id FROM leave_types WHERE code = 'VL'");
  const [[sl]] = await db.query("SELECT id FROM leave_types WHERE code = 'SL'");
  for (const [code, name] of DEPTS) await db.query('INSERT IGNORE INTO departments (code, name) VALUES (?,?)', [code, name]);
  const ids = {};
  for (const [no, last, first, sex, pos, dept, , roles, v, s] of EMPS) {
    const [[d]] = await db.query('SELECT id FROM departments WHERE code = ?', [dept]);
    await db.query(
      `INSERT INTO employees (employee_no, last_name, first_name, sex, position, department_id, employment_status, date_hired, monthly_salary)
       VALUES (?,?,?,?,?,?, 'Permanent', '2018-01-02', 35000) ON DUPLICATE KEY UPDATE position = VALUES(position)`, [no, last, first, sex, pos, d.id]);
    const [[e]] = await db.query('SELECT id FROM employees WHERE employee_no = ?', [no]);
    ids[no] = e.id;
    await db.query('INSERT IGNORE INTO users (employee_id, username, password_hash, must_change_password) VALUES (?,?,?,0)', [e.id, no.toLowerCase(), hash]);
    const [[u]] = await db.query('SELECT id FROM users WHERE employee_id = ?', [e.id]);
    for (const r of roles) await db.query('INSERT IGNORE INTO user_roles (user_id, role) VALUES (?,?)', [u.id, r]);
    for (const [typeId, bal] of [[vl.id, v], [sl.id, s]]) {
      const [[has]] = await db.query('SELECT id FROM leave_ledger WHERE employee_id = ? AND leave_type_id = ? LIMIT 1', [e.id, typeId]);
      if (has) continue;
      await db.query('INSERT INTO leave_balances (employee_id, leave_type_id, balance) VALUES (?,?,?)', [e.id, typeId, bal]);
      await db.query("INSERT INTO leave_ledger (employee_id, leave_type_id, txn_date, txn_type, days, balance_after, remarks) VALUES (?,?,CURDATE(),'OPENING',?,?,'Demo opening balance')", [e.id, typeId, bal, bal]);
    }
  }
  for (const [no, , , , , , sup] of EMPS) if (sup) await db.query('UPDATE employees SET supervisor_id = ? WHERE id = ?', [ids[sup], ids[no]]);
  for (const [code, head] of [['NSG', 'D-1001'], ['HRMO', 'D-2001'], ['ACCTG', 'D-3001'], ['OSH', 'D-4001'], ['MIS', 'D-5001'], ['ADM', 'D-6001'], ['OMCC', 'D-7001']]) {
    await db.query('UPDATE departments SET head_employee_id = ? WHERE code = ?', [ids[head], code]);
  }
  await db.end();
  console.log('Demo data loaded. Password for every demo account: Demo@1234');
  console.log('  d-1002 Employee (Nurse) | d-1001 Supervisor (Chief Nurse) | d-4001 OSH | d-2002 HR | d-3001 Accounting');
  console.log('  d-6001 CAO | d-7001 Management (Medical Center Chief) | d-5001 Admin (MIS)');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
