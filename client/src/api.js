import router from './router';

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || `Request failed (${status})`);
    this.status = status;
    this.data = data || {};
  }
}

async function request(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('/api' + url, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) {
      const current = router.currentRoute.value;
      if (current.name !== 'login') router.push({ name: 'login', query: { next: current.fullPath } });
    }
    if (res.status === 403 && data && data.code === 'MUST_CHANGE_PASSWORD') router.push({ name: 'change-password' });
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
};

export function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.append(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Open a CSV/XLSX download from an API GET endpoint (uses the session cookie). */
export function download(url) {
  window.location.href = '/api' + url;
}
