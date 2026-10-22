-- R1MC Leave Enrollment and Approval Module
-- MySQL 8.0+ / MariaDB 10.6+ schema

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  head_employee_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_no VARCHAR(30) NOT NULL UNIQUE,
  last_name VARCHAR(80) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NULL,
  suffix VARCHAR(10) NULL,
  sex ENUM('M','F') NULL,
  position VARCHAR(150) NULL,
  salary_grade VARCHAR(10) NULL,
  monthly_salary DECIMAL(12,2) NULL,
  department_id INT NULL,
  supervisor_id INT NULL,
  employment_status VARCHAR(40) NULL,
  date_hired DATE NULL,
  email VARCHAR(150) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_emp_dept (department_id),
  KEY idx_emp_sup (supervisor_id),
  CONSTRAINT fk_emp_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_sup FOREIGN KEY (supervisor_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL UNIQUE,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles: EMPLOYEE (implicit for everyone), HR, ACCOUNTING, OSH, CAO, MANAGEMENT, ADMIN
-- Supervisors are not a role: anyone set as another employee's supervisor or as a department head approves for them.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL,
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_role_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  legal_basis VARCHAR(255) NULL,
  -- has its own running balance (e.g. VL, SL)
  is_credit_type TINYINT(1) NOT NULL DEFAULT 0,
  accrual_per_month DECIMAL(6,3) NOT NULL DEFAULT 0,
  -- which balance this leave deducts from (e.g. Forced Leave deducts from VL); NULL = no deduction
  deducts_from_type_id INT NULL,
  max_days_per_request DECIMAL(6,1) NULL,
  max_days_per_year DECIMAL(6,1) NULL,
  day_count ENUM('WORKING','CALENDAR') NOT NULL DEFAULT 'WORKING',
  allow_half_day TINYINT(1) NOT NULL DEFAULT 1,
  attachment_rule ENUM('NEVER','OPTIONAL','ALWAYS','OVER_DAYS') NOT NULL DEFAULT 'OPTIONAL',
  attachment_threshold_days DECIMAL(6,1) NULL,
  attachment_note VARCHAR(255) NULL,
  sex_restriction ENUM('ANY','F','M') NOT NULL DEFAULT 'ANY',
  min_advance_days INT NOT NULL DEFAULT 0,
  -- when credits run out: LWOP = file anyway, excess is without pay; BLOCK = cannot file
  insufficient_credit_action ENUM('LWOP','BLOCK') NOT NULL DEFAULT 'LWOP',
  form6_detail ENUM('NONE','LOCATION','ILLNESS','WOMEN_ILLNESS','STUDY','OTHER') NOT NULL DEFAULT 'NONE',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 100,
  CONSTRAINT fk_lt_deduct FOREIGN KEY (deducts_from_type_id) REFERENCES leave_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Approval chain per leave type. Rows with leave_type_id NULL = default chain used when a type has none.
CREATE TABLE IF NOT EXISTS approval_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  leave_type_id INT NULL,
  step_order INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  approver_type ENUM('SUPERVISOR','DEPT_HEAD','ROLE') NOT NULL,
  approver_role VARCHAR(20) NULL,
  certifies_credits TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_step (leave_type_id, step_order),
  CONSTRAINT fk_step_lt FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  balance DECIMAL(9,3) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id, leave_type_id),
  CONSTRAINT fk_bal_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_bal_lt FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tracking_no VARCHAR(30) NOT NULL UNIQUE,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_half_day TINYINT(1) NOT NULL DEFAULT 0,
  half_day_period ENUM('AM','PM') NULL,
  days_applied DECIMAL(6,1) NOT NULL,
  days_with_pay DECIMAL(6,1) NOT NULL DEFAULT 0,
  days_without_pay DECIMAL(6,1) NOT NULL DEFAULT 0,
  reason TEXT NULL,
  detail_option VARCHAR(40) NULL,
  detail_text VARCHAR(255) NULL,
  commutation ENUM('NOT_REQUESTED','REQUESTED') NOT NULL DEFAULT 'NOT_REQUESTED',
  status ENUM('PENDING','RETURNED','APPROVED','DISAPPROVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  current_step_order INT NULL,
  is_lwop TINYINT(1) NOT NULL DEFAULT 0,
  credits_snapshot TEXT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  final_action_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_req_emp (employee_id),
  KEY idx_req_status (status),
  KEY idx_req_dates (start_date, end_date),
  CONSTRAINT fk_req_emp FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_req_lt FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Snapshot of the chain at filing time, so editing a chain does not disturb requests in flight
CREATE TABLE IF NOT EXISTS request_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  step_order INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  approver_type ENUM('SUPERVISOR','DEPT_HEAD','ROLE') NOT NULL,
  approver_role VARCHAR(20) NULL,
  approver_employee_id INT NULL,
  certifies_credits TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('WAITING','PENDING','APPROVED','RETURNED','DISAPPROVED','SKIPPED') NOT NULL DEFAULT 'WAITING',
  acted_by_user_id INT NULL,
  acted_at DATETIME NULL,
  remarks TEXT NULL,
  UNIQUE KEY uq_req_step (request_id, step_order),
  CONSTRAINT fk_rs_req FOREIGN KEY (request_id) REFERENCES leave_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  step_order INT NULL,
  step_name VARCHAR(100) NULL,
  actor_user_id INT NOT NULL,
  on_behalf_of_user_id INT NULL,
  action ENUM('SUBMIT','RESUBMIT','APPROVE','RETURN','DISAPPROVE','CANCEL','MARK_LWOP') NOT NULL,
  remarks TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ra_req (request_id),
  CONSTRAINT fk_ra_req FOREIGN KEY (request_id) REFERENCES leave_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(100) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_by INT NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_req FOREIGN KEY (request_id) REFERENCES leave_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every change to a balance. Balance = sum of days for that employee/type.
CREATE TABLE IF NOT EXISTS leave_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  txn_date DATE NOT NULL,
  txn_type ENUM('OPENING','ACCRUAL','DEDUCTION','ADJUSTMENT','RESTORE','LWOP') NOT NULL,
  days DECIMAL(9,3) NOT NULL,
  balance_after DECIMAL(9,3) NOT NULL,
  request_id INT NULL,
  period VARCHAR(7) NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ledger_emp (employee_id, leave_type_id),
  CONSTRAINT fk_led_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_led_lt FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accrual_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period VARCHAR(7) NOT NULL UNIQUE,
  employees_count INT NOT NULL,
  run_by INT NULL,
  run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delegations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delegator_user_id INT NOT NULL,
  delegate_user_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_del_from FOREIGN KEY (delegator_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_del_to FOREIGN KEY (delegate_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  request_id INT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NULL,
  entity_id VARCHAR(40) NULL,
  details TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_time (created_at),
  KEY idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
