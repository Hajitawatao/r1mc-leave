import { reactive } from 'vue';
import { api } from './api';

export const store = reactive({
  user: null,
  settings: {},
  unread: 0,
  inbox: 0,
  toasts: [],
});

export async function loadMe() {
  try {
    store.user = await api.get('/auth/me');
  } catch (e) {
    store.user = null;
  }
  return store.user;
}

export async function loadSettings() {
  try { store.settings = await api.get('/admin/settings'); } catch (e) { /* ignore */ }
}

export async function refreshCounts() {
  if (!store.user || store.user.must_change_password) return;
  try {
    const [n, inbox] = await Promise.all([api.get('/notifications/count'), api.get('/requests/inbox')]);
    store.unread = n.unread;
    store.inbox = inbox.length;
  } catch (e) { /* ignore */ }
}

let toastId = 0;
export function toast(message, kind = 'ok') {
  const id = ++toastId;
  store.toasts.push({ id, message, kind });
  setTimeout(() => { store.toasts = store.toasts.filter((t) => t.id !== id); }, kind === 'error' ? 6000 : 3500);
}

export const hasRole = (...roles) => !!store.user && (store.user.roles.includes('ADMIN') || roles.some((r) => store.user.roles.includes(r)));
