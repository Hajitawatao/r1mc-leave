const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDate(s, long = false) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${d}, ${y}`;
}

export function fmtDateTime(s) {
  if (!s) return '';
  const t = String(s).slice(11, 16);
  return `${fmtDate(s)} ${t}`;
}

export function fmtRange(a, b) {
  if (!a) return '';
  if (!b || a === b) return fmtDate(a);
  const [ya, ma] = a.split('-');
  const [yb, mb, db] = b.split('-');
  if (ya === yb && ma === mb) return `${MONTHS[Number(ma) - 1]} ${Number(a.slice(8))}–${Number(db)}, ${ya}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

export function fmtDays(n) {
  return String(Number(Number(n || 0).toFixed(3)));
}

export function fmtNum(n, d = 3) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

export function fullName(e) {
  if (!e) return '';
  return `${e.last_name}, ${e.first_name}${e.middle_name ? ' ' + e.middle_name[0] + '.' : ''}`;
}

export const STATUS_LABEL = {
  PENDING: 'Pending', RETURNED: 'Returned', APPROVED: 'Approved', DISAPPROVED: 'Disapproved', CANCELLED: 'Cancelled',
};

export const ACTION_LABEL = {
  SUBMIT: 'Submitted', RESUBMIT: 'Resubmitted', APPROVE: 'Approved', RETURN: 'Returned', DISAPPROVE: 'Disapproved', CANCEL: 'Cancelled', MARK_LWOP: 'Marked LWOP',
};

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
