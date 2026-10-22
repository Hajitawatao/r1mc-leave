const db = require('./db');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Dates (always 'YYYY-MM-DD' strings, computed in UTC to avoid timezone drift) ----
function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}
function toUTC(s) { return new Date(s + 'T00:00:00Z'); }
function fmt(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
function lastDayOfMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return fmt(new Date(Date.UTC(y, m, 0)));
}

/** Count leave days between start and end inclusive. */
async function countDays(start, end, dayCount, q = db.query) {
  if (dayCount === 'CALENDAR') return diffDays(start, end) + 1;
  const hol = await q('SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?', [start, end]);
  const holidays = new Set(hol.map((h) => String(h.holiday_date).slice(0, 10)));
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = toUTC(d).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(d)) n += 1;
  }
  return n;
}

function round3(n) { return Math.round(n * 1000) / 1000; }

// ---- Audit ----
async function audit(req, action, entity, entityId, details, q = db.query) {
  try {
    await q('INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?)', [
      req && req.user ? req.user.id : null,
      action,
      entity || null,
      entityId != null ? String(entityId) : null,
      details ? JSON.stringify(details) : null,
      req ? (req.ip || '').slice(0, 64) : null,
    ]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('audit failed', e.message);
  }
}

function fullName(e) {
  if (!e) return '';
  const mi = e.middle_name ? ` ${e.middle_name.trim()[0]}.` : '';
  return `${e.first_name}${mi} ${e.last_name}${e.suffix ? ' ' + e.suffix : ''}`;
}

function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}

function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows, columns));
}

module.exports = {
  HttpError, wrap, isDateStr, addDays, today, diffDays, lastDayOfMonth, countDays, round3, audit, fullName, sendCsv,
};
