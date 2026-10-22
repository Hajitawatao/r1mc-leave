<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Good {{ greeting }}, {{ store.user.first_name }}</h1>
        <div class="sub">{{ store.user.position }}<span v-if="store.user.department_name"> · {{ store.user.department_name }}</span></div>
      </div>
      <router-link to="/file" class="btn primary">+ File a leave</router-link>
    </div>

    <div v-if="store.inbox" class="alert info" style="margin-bottom:16px">
      <strong>{{ store.inbox }}</strong> leave application{{ store.inbox > 1 ? 's are' : ' is' }} waiting for your action.
      <router-link to="/approvals">Review now →</router-link>
    </div>

    <div class="stats" v-if="bal">
      <div v-for="c in bal.credits" :key="c.code" class="stat" :class="{ primary: c.code === 'VL' }">
        <div class="label">{{ c.name }}</div>
        <div class="value">{{ fmtDays(c.balance) }}</div>
        <div class="hint">day(s) available<span v-if="c.pending"> · {{ fmtDays(c.pending) }} pending</span></div>
      </div>
      <div v-for="y in bal.yearly.filter((x) => x.max_days_per_year && ['FL','SPL'].includes(x.code))" :key="y.code" class="stat">
        <div class="label">{{ y.name }} ({{ bal.year }})</div>
        <div class="value">{{ fmtDays(y.max_days_per_year - y.used) }}<span class="faint"> / {{ fmtDays(y.max_days_per_year) }}</span></div>
        <div class="hint">day(s) left this year</div>
      </div>
    </div>

    <div class="grid-main" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>My recent applications</h2><router-link to="/my-requests">View all</router-link></div>
        <div class="table-wrap">
          <table class="table" v-if="mine.length">
            <thead><tr><th>Tracking no.</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="r in mine.slice(0, 6)" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
                <td class="mono">{{ r.tracking_no }}</td>
                <td>{{ r.leave_name }}</td>
                <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}</td>
                <td class="num">{{ fmtDays(r.days_applied) }}</td>
                <td><StatusBadge :status="r.status" :lwop="r.is_lwop" /><div v-if="r.status === 'PENDING'" class="faint">At: {{ r.current_step }}</div></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">No applications yet. <router-link to="/file">File your first leave</router-link>.</div>
        </div>
      </div>

      <div class="stack">
        <div class="card" v-if="dash">
          <div class="card-head"><h2>On leave today</h2><span class="tag">{{ dash.on_leave_today.length }}</span></div>
          <div class="card-body">
            <div v-if="!dash.on_leave_today.length" class="faint">Nobody {{ store.user.org_wide ? '' : 'in your team ' }}is on approved leave today.</div>
            <div v-for="p in dash.on_leave_today.slice(0, 10)" :key="p.id" class="bal">
              <div><div style="font-weight:600">{{ p.name }}</div><div class="faint">{{ p.department_name }}</div></div>
              <span class="tag">{{ p.leave_code }} · until {{ fmtDate(p.end_date) }}</span>
            </div>
          </div>
        </div>
        <div class="card" v-if="dash && dash.upcoming.length">
          <div class="card-head"><h2>Upcoming (14 days)</h2></div>
          <div class="card-body">
            <div v-for="p in dash.upcoming" :key="p.id" class="bal">
              <div style="font-weight:600">{{ p.name }}</div>
              <span class="faint nowrap">{{ p.leave_code }} · {{ fmtRange(p.start_date, p.end_date) }}</span>
            </div>
          </div>
        </div>
        <div class="card" v-if="!dash">
          <div class="card-head"><h2>Good to know</h2></div>
          <div class="card-body">
            <p class="muted">Vacation and sick leave credits are earned at 1.25 days each per month of service and posted by HRMO monthly.</p>
            <p class="muted">If your credits are not enough, the excess days are processed as leave without pay.</p>
            <p class="muted">Every application gets a tracking number. You are notified at every step.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../api';
import { store } from '../store';
import { fmtDate, fmtDays, fmtRange } from '../format';
import StatusBadge from '../components/StatusBadge.vue';

const bal = ref(null);
const mine = ref([]);
const dash = ref(null);
const greeting = computed(() => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; });

onMounted(async () => {
  [bal.value, mine.value] = await Promise.all([api.get('/my/balances'), api.get('/requests/mine')]);
  if (store.user.org_wide || store.user.is_supervisor) dash.value = await api.get('/reports/dashboard');
});
</script>
