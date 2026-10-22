# R1MC Leave Enrollment and Approval Module

The leave module of the Region 1 Medical Center HRIS, built from the *Leave Enrollment and Approval Module SRD* (HRMO/MIS).
It runs on the hospital LAN. Staff open it in a browser and nothing is installed on their PCs.

**Stack:** Vue 3 (Vite) · Node.js + Express · MySQL 8 / MariaDB (XAMPP works)

---

## What it does

| SRD requirement | How it is built |
|---|---|
| Employee self-service (3.2.1) | File leave online. See live balances, leave card (ledger) and full history. Upload medical certificates and other documents (PDF/JPG/PNG). |
| Automated leave validation (3.2.2) | Working days are counted with weekends and holidays skipped. Checks cover overlapping applications, yearly caps (FL 5, SPL 3, Solo Parent 7…), per-application limits (ML 105, PL 7…), sex eligibility and required documents. Credits are checked net of other pending applications. Insufficient credits are flagged as LWOP before the employee submits. |
| Approval workflow (3.2.3, 4.1) | Each leave type has its own approval route, configured by HR. The default route is **Immediate Supervisor → HR (certifies credits) → Accounting**, and **Sick Leave** starts with **OSH medical clearance**, as in the SRD process-flow diagram. Every step can Approve, **Return** (to the employee or to the previous step) or Disapprove with remarks. |
| Delegation (3.2.3) | Approvers can delegate their approval rights for a date range. Actions are recorded as "X for Y". |
| Notifications (4.1.2, 4.1.4) | In-app notifications at every step. Email is optional through the hospital SMTP server (see `.env`). Accounting is notified of every approval that has days without pay. |
| Tracking ID (4.1.1) | Every application gets a tracking number in the format `LV-2026-000123`. |
| HR internal control / LWOP (4.1.3) | Credits are deducted on final approval. Days beyond the balance automatically become leave without pay, and the HR step can also set LWOP days manually. Balance changes are written to a ledger. |
| Centralized database (3.2.4) | All data lives in one MySQL database. The Excel leave ledger is replaced by a per-employee ledger (leave card). |
| Reports & analytics (3.2.5, 4.1.5) | Dashboard showing who is on leave today, absenteeism, monthly trend and usage by leave type. Leave summary by type, department, employee or month. Balance reconciliation report. **LWOP report for payroll**. CSV export everywhere. Supervisors see their own team only; HR, Accounting and Management see the whole hospital. |
| Integration with HRIS/payroll (3.2.6) | Employees and opening balances are imported from Excel/CSV (Medsys export + leave ledger). Payroll receives the LWOP report as CSV. See "Not included" below. |
| Security (3.2.7, RA 10173) | Accounts are created by HR only (no self-registration). Passwords are bcrypt-hashed, and the initial password must be changed at first login. Accounts lock for 15 minutes after 5 failed logins. Access is role-based. Attachments are visible only to the applicant, the applicant's approvers and HR. A full **audit trail** records logins, every leave action, credit changes and configuration changes. |
| CSC Form 6 | Every application prints as **CSC Form No. 6 (Revised 2020)**. The 7.A credit certification and approver names are filled in automatically. |

### Leave types preloaded (CSC Omnibus Rules on Leave)
VL and SL each earn **1.25 days per month**. Also preloaded: Mandatory/Forced (charged to VL, 5 days a year), Maternity (105 calendar days), Paternity (7), Special Privilege (3 a year), Solo Parent (7), Study, VAWC (10), Rehabilitation, Special Leave Benefits for Women, Special Emergency/Calamity (5), and Adoption.
**HRMO must review every rule** under *Leave types & approvals* before go-live. All rules can be edited.

### Roles
| Role | Can do |
|---|---|
| Every employee | File leave, track it, see own leave card, delegate approval if they approve for others |
| Supervisor / Department head | Approve for their direct reports or department, see team applications and reports. This is **not** a role: it follows the *Immediate supervisor* field and the *Department head* field. |
| HR | Everything HR: employees, accounts, credits, accruals, import, leave types, routes, holidays, all reports, and the HR approval step |
| Accounting / OSH / CAO | Their approval step in a route. Accounting also gets the LWOP payroll report |
| Management | Organization-wide reports (read-only) |
| Admin | Everything, plus settings and audit trail |

---

## Install on the server PC (Windows)

1. Install **Node.js 20 LTS** from nodejs.org.
2. Install **XAMPP** (or MySQL 8) and start **MySQL** in the XAMPP Control Panel.
3. Copy this folder to the server, for example `C:\Users\MIS-27\Desktop\Deployments\r1mc-leave`.
4. Run **`setup.bat`**. It asks for the MySQL connection (XAMPP default: user `root`, no password), installs the packages and creates the database.
5. Run **`start.bat`**. It shows the address staff will use, for example `http://192.168.1.10:8080`.
6. Optional but recommended: right-click **`install-autostart.bat`** → *Run as administrator*. This opens the firewall port for the LAN and starts the system when Windows starts. In the XAMPP Control Panel, also tick **Service** for MySQL.

The first login is `admin` / `Admin@12345`. You must change the password right away.

The frontend is already built (`server/public`), so the server PC does not need to build anything.

### First-time configuration (in this order)
1. **Settings**: agency name and address, and the default signatories for Form 6.
2. **Leave types & approvals**: review each leave type and its approval route. If R1MC uses a CAO step, add it here (role `CAO`).
3. **Holidays**: add special non-working days declared by proclamation. Regular 2026 holidays are preloaded.
4. **Import from Excel**: download the template, fill it from the Medsys export and the Excel leave ledger (`vl_balance`, `sl_balance` as of the cut-off date), validate, then import.
5. **Employees & accounts**: give HR, Accounting, OSH and Management staff their roles. Set department heads under **Departments**.
6. **Leave credits**: post the monthly accrual for every month after the ledger cut-off date, then every month from then on.

### Daily operations
- **Monthly**: HR posts the accrual for the month that just ended (*Leave credits → Post accrual*). A month cannot be posted twice.
- **Payroll cut-off**: Accounting exports *Reports → LWOP for payroll*.
- **Backups**: run **`backup-db.bat`** (database + uploaded documents go to `backups\`). Copy that folder off the server regularly.

### Updating
Replace the files with the new version, keeping `server\.env` and `server\uploads\`. Then run `setup.bat`. It keeps the existing `.env`, installs any new packages and applies database changes without touching existing data.

---

## UAT / demo data
`npm run seed:demo` adds departments and employees covering every approver role. **Do not run it on the production database.**
Log in with `d-1002` (nurse), `d-1001` (chief nurse/supervisor), `d-2002` (HR), `d-3001` (accounting) or `d-4001` (OSH). The password is `Demo@1234` for all of them.

## Development
```
npm --prefix server install
npm --prefix client install
copy server\.env.example server\.env     (fill in DB and JWT_SECRET)
npm run migrate
npm run dev:server       (API on :8080)
npm run dev:client       (Vite on :5173, proxies /api)
npm run build            (builds client into server/public)
```
Run `save-to-git.bat` to commit your local edits and push them to GitHub.

---

## Decisions HRMO should confirm before sign-off
These were not specified in the SRD. They are configurable, so a different decision means a settings change, not a rewrite.
1. **Approval route.** The SRD text says Supervisor → HRIC → CAO Action Officer (OSM). The SRD diagram says Supervisor → HR → Accounting, with OSH first for sick leave. The system ships with the diagram version.
2. **OSH clearance for every sick leave.** It is in the diagram, but a 1-day sick leave going to OSH may be too heavy. Remove the OSH step from the Sick Leave route if not needed.
3. **Accrual reduction for LWOP** uses 1.25 ÷ 30 per day without pay. Confirm it matches the CSC table HRMO uses.
4. **Accrual for employees hired mid-month.** An employee hired on or before the last day of the month gets that month's full 1.25 days. If HRMO prorates the first month, use *Adjust a balance* for the difference.

## Not included (outside the SRD's build, or needs MIS input)
- **Live Medsys sync.** Data moves through Excel/CSV import. A direct link needs Medsys database access and its schema.
- **Direct payroll posting.** Accounting receives the LWOP CSV instead.
- **SMS notifications.** These need an SMS gateway. Email works if an SMTP server is reachable from the LAN.
- **Leave monetization and terminal leave processing.**
- **CTO / overtime credits.**
