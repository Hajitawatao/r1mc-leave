// Role workspaces: each role gets its own menu, colour and home screen (SRD 3.3 Stakeholders and Target Users).
// A person with several roles switches workspace from the drawer.

const DELEGATE = { to: '/delegations', label: 'Delegate approval', icon: 'share' };
const INBOX = { to: '/approvals', label: 'For my action', icon: 'inbox', badge: 'inbox' };
const ALL = { to: '/all-requests', label: 'All applications', icon: 'folder' };
const REPORTS = { to: '/reports', label: 'Reports', icon: 'chart' };
const HR_ADMIN = [
  { section: 'Records' },
  { to: '/admin/employees', label: 'Employees & accounts', icon: 'users' },
  { to: '/admin/credits', label: 'Leave credits', icon: 'coins' },
  { to: '/admin/import', label: 'Import from Excel', icon: 'upload' },
  { section: 'Configuration' },
  { to: '/admin/leave-types', label: 'Leave types & routes', icon: 'sliders' },
  { to: '/admin/departments', label: 'Departments', icon: 'building' },
  { to: '/admin/holidays', label: 'Holidays', icon: 'calendar' },
  { to: '/admin/roles', label: 'Roles & access', icon: 'shield' },
];

export const WORKSPACES = {
  EMPLOYEE: {
    label: 'Employee', icon: 'user', accent: '#2e7d4f', home: '/',
    blurb: 'File leave, track approval and check your credits.',
    nav: [
      { to: '/', label: 'Dashboard', icon: 'home' },
      { to: '/file', label: 'File a leave', icon: 'filePlus' },
      { to: '/my-requests', label: 'My applications', icon: 'list' },
      { to: '/leave-card', label: 'My leave card', icon: 'book' },
      { to: '/notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
    ],
  },
  SUPERVISOR: {
    label: 'Supervisor', icon: 'briefcase', accent: '#0b6fa4', home: '/home/approver',
    blurb: 'Review your team’s leave against workload and staffing (SRD 4.1.2).',
    nav: [
      { to: '/home/approver', label: 'Dashboard', icon: 'home' },
      INBOX,
      { to: '/all-requests', label: 'Team applications', icon: 'folder' },
      { to: '/reports', label: 'Team reports', icon: 'chart' },
      DELEGATE,
    ],
  },
  OSH: {
    label: 'OSH', icon: 'heart', accent: '#00897b', home: '/home/approver',
    blurb: 'Medical clearance of sick leave before it goes to the supervisor.',
    nav: [{ to: '/home/approver', label: 'Dashboard', icon: 'home' }, INBOX, DELEGATE],
  },
  HR: {
    label: 'HRMO', icon: 'users', accent: '#1a3f8f', home: '/home/hr',
    blurb: 'Validate leave, certify credits, mark LWOP and maintain leave records (SRD 4.1.3).',
    nav: [{ to: '/home/hr', label: 'Dashboard', icon: 'home' }, INBOX, ALL, REPORTS, DELEGATE, ...HR_ADMIN],
  },
  ACCOUNTING: {
    label: 'Accounting', icon: 'wallet', accent: '#b26a00', home: '/home/accounting',
    blurb: 'Payroll review of approved leave and leave without pay (SRD 3.2.6).',
    nav: [
      { to: '/home/accounting', label: 'Dashboard', icon: 'home' },
      INBOX,
      { to: '/reports?tab=lwop', label: 'LWOP for payroll', icon: 'coins' },
      { to: '/reports?tab=balances', label: 'Balance reconciliation', icon: 'book' },
      ALL, DELEGATE,
    ],
  },
  CAO: {
    label: 'CAO', icon: 'stamp', accent: '#6a3d9a', home: '/home/approver',
    blurb: 'Official processing and record-keeping of leave (SRD 4.1.3).',
    nav: [{ to: '/home/approver', label: 'Dashboard', icon: 'home' }, INBOX, ALL, REPORTS, DELEGATE],
  },
  MANAGEMENT: {
    label: 'Management', icon: 'chart', accent: '#455a64', home: '/reports',
    blurb: 'Leave utilization, absenteeism and workforce availability (SRD 3.2.5).',
    nav: [{ to: '/reports', label: 'Analytics', icon: 'chart' }, ALL],
  },
  ADMIN: {
    label: 'Admin (MIS)', icon: 'monitor', accent: '#b3261e', home: '/home/admin',
    blurb: 'Full access: system setup, accounts and every module (SRD 3.3 MIS team).',
    nav: [
      { to: '/home/admin', label: 'Dashboard', icon: 'home' },
      INBOX, ALL, REPORTS,
      ...HR_ADMIN,
      { section: 'System' },
      { to: '/admin/settings', label: 'Settings', icon: 'gear' },
    ],
  },
};

const ORDER = ['ADMIN', 'HR', 'ACCOUNTING', 'CAO', 'MANAGEMENT', 'OSH', 'SUPERVISOR', 'EMPLOYEE'];

export function availableWorkspaces(user) {
  if (!user) return [];
  const has = new Set(user.roles);
  if (user.is_supervisor || user.acting_for > 0) has.add('SUPERVISOR');
  has.add('EMPLOYEE');
  return ORDER.filter((k) => has.has(k)).map((k) => ({ key: k, ...WORKSPACES[k] }));
}

export function defaultWorkspace(user) {
  const list = availableWorkspaces(user);
  return list.length ? list[0].key : 'EMPLOYEE';
}

export const ROLE_LABEL = { EMPLOYEE: 'Employee', SUPERVISOR: 'Supervisor', OSH: 'OSH', HR: 'HRMO', ACCOUNTING: 'Accounting', CAO: 'CAO', MANAGEMENT: 'Management', ADMIN: 'Admin (MIS)' };
