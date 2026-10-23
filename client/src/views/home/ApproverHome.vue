<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ws-banner">{{ ws.label }} workspace</div>
        <h1>Good {{ greeting }}, {{ store.user.first_name }}</h1>
        <div class="sub">{{ ws.blurb }}</div>
      </div>
      <router-link to="/approvals" class="btn primary" :style="{ background: ws.accent, borderColor: ws.accent }">Review applications</router-link>
    </div>

    <div class="stats">
      <div class="stat primary"><div class="label">Waiting for your action</div><div class="value">{{ inbox.length }}</div><div class="hint">application(s)</div></div>
      <div class="stat"><div class="label">Already started</div><div class="value" :style="{ color: started ? 'var(--warn)' : '' }">{{ started }}</div><div class="hint">leave date has passed, still pending</div></div>
      <div class="stat"><div class="label">Acted on (this month)</div><div class="value">{{ actedMonth }}</div><div class="hint">approved, returned or disapproved</div></div>
      <div class="stat" v-if="dash"><div class="label">{{ store.user.org_wide ? 'On leave today' : 'Team on leave today' }}</div><div class="value">{{ dash.on_leave_today.length }}</div><div class="hint">approved leave</div></div>
    </div>

    <div class="grid-main" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>For your action</h2><router-link to="/approvals">Open all</router-link></div>
        <div class="table-wrap">
          <table class="table" v-if="inbox.length">
            <thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Step</th></tr></thead>
            <tbody>
              <tr v-for="r in inbox.slice(0, 10)" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
                <td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.department_name }}</div></td>
                <td>{{ r.leave_name }}</td>
                <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}<div v-if="r.start_date <= today" class="faint" style="color:var(--warn)">already started</div></td>
                <td class="num">{{ fmtDays(r.days_applied) }}</td>
                <td class="faint">{{ r.current_step }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">Nothing is waiting for you. 🎉</div>
        </div>
      </div>
      <div class="stack">
        <div class="card" v-if="dash">
          <div class="card-head"><h2>On leave today</h2></div>
          <div class="card-body">
            <div v-if="!dash.on_leave_today.length" class="faint">Nobody is on approved leave today.</div>
            <div v-for="p in dash.on_leave_today.slice(0, 10)" :key="p.id" class="bal"><span style="font-weight:600">{{ p.name }}</span><span class="tag">{{ p.leave_code }} · until {{ fmtDate(p.end_date) }}</span></div>
          </div>
        </div>
        <div class="card" v-if="dash && dash.upcoming.length">
          <div class="card-head"><h2>Upcoming (14 days)</h2></div>
          <div class="card-body">
            <div v-for="p in dash.upcoming" :key="p.id" class="bal"><span style="font-weight:600">{{ p.name }}</span><span class="faint nowrap">{{ p.leave_code }} · {{ fmtRange(p.start_date, p.end_date) }}</span></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Going on leave yourself?</h2></div>
          <div class="card-body">
            <p class="muted">Delegate your approval rights so applications don't wait for you.</p>
            <router-link to="/delegations" class="btn sm">Delegate approval</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api';
import { store, currentWorkspace } from '../../store';
import { fmtDate, fmtDays, fmtRange, todayStr } from '../../format';

const ws = computed(() => currentWorkspace());
const inbox = ref([]);
const acted = ref([]);
const dash = ref(null);
const today = todayStr();
const started = computed(() => inbox.value.filter((r) => r.start_date <= today).length);
const actedMonth = computed(() => acted.value.filter((r) => String(r.final_action_at || r.submitted_at).slice(0, 7) === today.slice(0, 7)).length);
const greeting = computed(() => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; });

onMounted(async () => {
  [inbox.value, acted.value] = await Promise.all([api.get('/requests/inbox'), api.get('/requests/acted')]);
  if (store.user.org_wide || store.user.is_supervisor) dash.value = await api.get('/reports/dashboard');
});
</script>
