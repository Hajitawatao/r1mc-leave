/* Creates the database and tables, then seeds CSC leave types, default approval chains, settings,
 * holidays and the first administrator account. Safe to run again: it never overwrites HR edits. */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../src/config');

const LEAVE_TYPES = [
  { code: 'VL', name: 'Vacation Leave', is_credit_type: 1, accrual_per_month: 1.25, min_advance_days: 5, form6_detail: 'LOCATION', legal_basis: 'Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'FL', name: 'Mandatory/Forced Leave', deducts_from: 'VL', max_days_per_year: 5, legal_basis: 'Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'SL', name: 'Sick Leave', is_credit_type: 1, accrual_per_month: 1.25, attachment_rule: 'OVER_DAYS', attachment_threshold_days: 5, attachment_note: 'Medical certificate for more than 5 days, or if filed in advance', form6_detail: 'ILLNESS', legal_basis: 'Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'ML', name: 'Maternity Leave', day_count: 'CALENDAR', max_days_per_request: 105, sex_restriction: 'F', allow_half_day: 0, attachment_rule: 'ALWAYS', attachment_note: 'Proof of pregnancy / medical certificate', legal_basis: 'R.A. No. 11210 / IRR issued by CSC, DOLE and SSS' },
  { code: 'PL', name: 'Paternity Leave', max_days_per_request: 7, max_days_per_year: 7, sex_restriction: 'M', attachment_rule: 'ALWAYS', attachment_note: "Proof of child's delivery (birth or medical certificate) and marriage contract", legal_basis: 'R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended' },
  { code: 'SPL', name: 'Special Privilege Leave', max_days_per_year: 3, form6_detail: 'LOCATION', legal_basis: 'Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'SOLO', name: 'Solo Parent Leave', max_days_per_year: 7, attachment_rule: 'ALWAYS', attachment_note: 'Valid Solo Parent ID', legal_basis: 'R.A. No. 8972 as amended by R.A. No. 11861' },
  { code: 'STUDY', name: 'Study Leave', day_count: 'CALENDAR', max_days_per_request: 180, attachment_rule: 'ALWAYS', attachment_note: 'Approved study leave contract', form6_detail: 'STUDY', legal_basis: 'Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'VAWC', name: '10-Day VAWC Leave', max_days_per_year: 10, sex_restriction: 'F', attachment_rule: 'ALWAYS', attachment_note: 'Barangay/Court protection order or certification', legal_basis: 'R.A. No. 9262 / CSC MC No. 15, s. 2005' },
  { code: 'RL', name: 'Rehabilitation Privilege', day_count: 'CALENDAR', max_days_per_request: 180, attachment_rule: 'ALWAYS', attachment_note: 'Police report / medical certificate on the injury', legal_basis: 'Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292' },
  { code: 'SLBW', name: 'Special Leave Benefits for Women', day_count: 'CALENDAR', max_days_per_request: 60, sex_restriction: 'F', attachment_rule: 'ALWAYS', attachment_note: 'Medical certificate (gynecological surgery)', form6_detail: 'WOMEN_ILLNESS', legal_basis: 'R.A. No. 9710 / CSC MC No. 25, s. 2010' },
  { code: 'SEL', name: 'Special Emergency (Calamity) Leave', max_days_per_year: 5, attachment_note: 'Proof of residence in the declared calamity area', legal_basis: 'CSC MC No. 2, s. 2012, as amended' },
  { code: 'AL', name: 'Adoption Leave', day_count: 'CALENDAR', max_days_per_request: 60, attachment_rule: 'ALWAYS', attachment_note: 'Pre-adoptive placement authority', legal_basis: 'R.A. No. 8552 / R.A. No. 11642' },
];

const DEFAULT_CHAIN = [
  { name: 'Immediate Supervisor', approver_type: 'SUPERVISOR' },
  { name: 'HR Evaluation & Certification of Leave Credits', approver_type: 'ROLE', approver_role: 'HR', certifies_credits: 1 },
  { name: 'Accounting Review', approver_type: 'ROLE', approver_role: 'ACCOUNTING' },
];
const SL_CHAIN = [
  { name: 'OSH Medical Clearance', approver_type: 'ROLE', approver_role: 'OSH' },
  ...DEFAULT_CHAIN,
];

const HOLIDAYS = [
  ['2026-01-01', "New Year's Day"], ['2026-04-02', 'Maundy Thursday'], ['2026-04-03', 'Good Friday'], ['2026-04-09', 'Araw ng Kagitingan'],
  ['2026-05-01', 'Labor Day'], ['2026-06-12', 'Independence Day'], ['2026-08-21', 'Ninoy Aquino Day'], ['2026-08-31', 'National Heroes Day'],
  ['2026-11-01', "All Saints' Day"], ['2026-11-30', 'Bonifacio Day'], ['2026-12-08', 'Feast of the Immaculate Conception'],
  ['2026-12-25', 'Christmas Day'], ['2026-12-30', 'Rizal Day'], ['2026-12-31', 'Last Day of the Year'],
];

const SETTINGS = {
  org_name: 'Region 1 Medical Center',
  org_short: 'R1MC',
  org_address: 'Dagupan City, Pangasinan',
  hr_certifying_officer: '',
  hr_certifying_position: 'Supervising Administrative Officer, HRMO',
  approving_officer: '',
  approving_position: 'Chief Administrative Officer',
  schema_version: '1',
};

async function main() {
  const { database, ...conn } = config.db;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME may only contain letters, numbers and underscore');
  const server = await mysql.createConnection({ ...conn, multipleStatements: true });
  await server.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await server.end();

  const db = await mysql.createConnection({ ...conn, database, multipleStatements: true });

  // Refuse to build on top of another system's tables (e.g. an old Laravel app that used the same database name)
  const SIGNATURE = { users: 'employee_id', employees: 'employee_no', departments: 'head_employee_id', settings: 'setting_key' };
  const [existing] = await db.query('SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database]);
  const conflicts = [];
  for (const [table, column] of Object.entries(SIGNATURE)) {
    if (!existing.some((r) => r.t.toLowerCase() === table)) continue;
    const [[col]] = await db.query('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [database, table, column]);
    if (!col.n) conflicts.push(table);
  }
  if (conflicts.length) {
    await db.end();
    console.error(`\nThe database "${database}" already contains tables from another system: ${conflicts.join(', ')}.`);
    console.error('Nothing was changed. Choose one:');
    console.error('  A) Use a new database name: delete server\\.env, run setup.bat again, and enter a different');
    console.error('     database name (e.g. r1mc_leave_system) when asked.');
    console.error(`  B) If "${database}" is an old test database you no longer need, drop it in phpMyAdmin, then run setup.bat again.`);
    process.exit(1);
  }

  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  console.log('Tables ready.');

  // leave types (insert missing only)
  for (const [i, lt] of LEAVE_TYPES.entries()) {
    const [[exists]] = await db.query('SELECT id FROM leave_types WHERE code = ?', [lt.code]);
    if (exists) continue;
    const { deducts_from: df, ...fields } = lt;
    await db.query('INSERT INTO leave_types SET ?', [{ ...fields, sort_order: (i + 1) * 10 }]);
    console.log(`  + leave type ${lt.code}`);
  }
  for (const lt of LEAVE_TYPES.filter((x) => x.deducts_from)) {
    await db.query(
      `UPDATE leave_types t JOIN leave_types s ON s.code = ? SET t.deducts_from_type_id = s.id WHERE t.code = ? AND t.deducts_from_type_id IS NULL`,
      [lt.deducts_from, lt.code]);
  }

  const [[hasDefault]] = await db.query('SELECT COUNT(*) n FROM approval_steps WHERE leave_type_id IS NULL');
  if (!hasDefault.n) {
    for (const [i, s] of DEFAULT_CHAIN.entries()) {
      await db.query('INSERT INTO approval_steps (leave_type_id, step_order, name, approver_type, approver_role, certifies_credits) VALUES (NULL,?,?,?,?,?)',
        [i + 1, s.name, s.approver_type, s.approver_role || null, s.certifies_credits || 0]);
    }
    const [[sl]] = await db.query("SELECT id FROM leave_types WHERE code = 'SL'");
    if (sl) {
      for (const [i, s] of SL_CHAIN.entries()) {
        await db.query('INSERT INTO approval_steps (leave_type_id, step_order, name, approver_type, approver_role, certifies_credits) VALUES (?,?,?,?,?,?)',
          [sl.id, i + 1, s.name, s.approver_type, s.approver_role || null, s.certifies_credits || 0]);
      }
    }
    console.log('  + default approval chains (Supervisor > HR > Accounting; Sick Leave: OSH first)');
  }

  for (const [k, v] of Object.entries(SETTINGS)) {
    await db.query('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?,?)', [k, v]);
  }
  const [[hol]] = await db.query('SELECT COUNT(*) n FROM holidays');
  if (!hol.n) {
    for (const [d, n] of HOLIDAYS) await db.query('INSERT IGNORE INTO holidays (holiday_date, name) VALUES (?,?)', [d, n]);
    console.log('  + 2026 holidays (review and add special non-working days declared by proclamation)');
  }

  // the built-in admin is not a real employee: keep it out of headcount, accruals and pickers
  await db.query("UPDATE employees SET is_active = 0 WHERE employee_no = 'ADMIN'");
  const [[admins]] = await db.query("SELECT COUNT(*) n FROM user_roles WHERE role = 'ADMIN'");
  if (!admins.n) {
    const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
    let [[emp]] = await db.query("SELECT id FROM employees WHERE employee_no = 'ADMIN'");
    if (!emp) {
      const [r] = await db.query("INSERT INTO employees (employee_no, last_name, first_name, position, is_active) VALUES ('ADMIN','Administrator','System','MIS', 0)");
      emp = { id: r.insertId };
    }
    let [[user]] = await db.query("SELECT id FROM users WHERE username = 'admin'");
    if (!user) {
      const [r] = await db.query('INSERT INTO users (employee_id, username, password_hash, must_change_password) VALUES (?,?,?,1)', [emp.id, 'admin', await bcrypt.hash(password, 10)]);
      user = { id: r.insertId };
    }
    await db.query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'ADMIN'), (?, 'HR')", [user.id, user.id]);
    console.log(`  + administrator account: username "admin", password "${password}" (change it at first login)`);
  }
  await db.end();
  console.log('Database is ready.');
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
