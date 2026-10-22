<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Notifications</h1><div class="sub">Status updates on your applications and items for your action.</div></div>
      <button v-if="unread" class="btn" @click="readAll">Mark all as read</button>
    </div>
    <div class="card">
      <div v-if="!items.length" class="empty">No notifications yet.</div>
      <div v-for="n in items" :key="n.id" class="notif" :class="{ unread: !n.is_read }" @click="open(n)">
        <div class="row" style="justify-content:space-between">
          <strong>{{ n.title }}</strong>
          <span class="faint">{{ fmtDateTime(n.created_at) }}</span>
        </div>
        <div class="muted">{{ n.message }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { refreshCounts } from '../store';
import { fmtDateTime } from '../format';

const router = useRouter();
const items = ref([]);
const unread = ref(0);
async function load() { const r = await api.get('/notifications'); items.value = r.items; unread.value = r.unread; }
async function open(n) {
  if (!n.is_read) await api.post('/notifications/read', { id: n.id });
  refreshCounts();
  if (n.request_id) router.push(`/requests/${n.request_id}`); else await load();
}
async function readAll() { await api.post('/notifications/read', {}); await load(); refreshCounts(); }
onMounted(load);
</script>

<style scoped>
.notif { padding: 12px 20px; border-bottom: 1px solid var(--border); cursor: pointer; }
.notif:last-child { border-bottom: 0; }
.notif:hover { background: var(--surface-2); }
.notif.unread { border-left: 3px solid var(--accent); padding-left: 17px; background: #fffdf6; }
</style>
