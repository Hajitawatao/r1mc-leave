<template>
  <div class="page">
    <div class="page-head">
      <div><div class="ws-banner">{{ ws.label }} workspace</div><h1>Reports</h1><div class="sub">{{ store.user.org_wide ? 'Organization-wide' : 'Your team' }} leave utilization, balances and leave without pay.</div></div>
    </div>
    <div class="tabs">
      <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button>
      <button :class="{ on: tab === 'summary' }" @click="tab = 'summary'">Leave summary</button>
      <button :class="{ on: tab === 'balances' }" @click="tab = 'balances'; loadBalances()">Balances</button>
      <button v-if="hasRole('HR', 'ACCOUNTING')" :class="{ on: tab === 'lwop' }" @click="tab = 'lwop'; loadLwop()">LWOP for payroll</button>
    </div>

    <template v-if="tab === 'overview' && dash">
      <div class="stats">
        <div class="stat primary"><div class="label">On leave today</div><div class="value">{{ dash.on_leave_today.length }}</div><div class="hint">of {{ dash.headcount }} active employees</div></div>
        <div class="stat"><div class="label">Absenteeism today</div><div class="value">{{ dash.headcount ? ((dash.on_leave_today.length / dash.headcount) * 100).toFixed(1) : 0 }}%</div><div class="hint">approved leave only</div></div>
        <div class="stat" v-for="s in ['PENDING', 'APPROVED', 'DISAPPROVED']" :key="s"><div class="label">{{ STATUS_LABEL[s] }} ({{ dash.year }})</div><div class="value">{{ statusCount(s) }}</div><div class="hint">applications</div></div>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-head"><h2>Leave days per month, {{ dash.year }}</h2><span class="faint"><span style="color:var(--gold)">■</span> without pay</span></div>
          <div class="card-body">
            <div class="bars">
              <div v-for="m in dash.monthly" :key="m.month" class="bar" :title="`${m.days} day(s), ${m.lwop} without pay`">
                <span class="val">{{ m.days ? fmtDays(m.days) : '' }}</span>
                <div class="fill" :style="{ height: pct(m.days) + '%' }"><div class="lw" :style="{ height: m.days ? (m.lwop / m.days) * 100 + '%' : 0 }"></div></div>
                <span class="lbl">{{ MONTHS[m.month - 1] }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>By leave type, {{ dash.year }}</h2></div>
          <div class="card-body">
            <div v-if="!dash.by_type.length" class="faint">No approved leave yet this year.</div>
            <div v-for="t in dash.by_type" :key="t.code" class="hbar">
              <span>{{ t.name }}</span>
              <div class="track"><div :style="{ width: (t.days / maxType) * 100 + '%' }"></div></div>
              <span class="num">{{ fmtDays(t.days) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-if="tab === 'summary'">
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="row">
          <label class="faint">Group by
            <select class="input" style="width:auto" v-model="s.group"><option value="type">Leave type</option><option value="department">Department</option><option value="employee">Employee</option><option value="month">Month</option></select>
          </label>
          <label class="faint">From <input class="input" type="date" v-model="s.from" style="width:auto" /></label>
          <label class="faint">To <input class="input" type="date" v-model="s.to" style="width:auto" /></label>
          <select v-if="store.user.org_wide" class="input" style="width:auto" v-model="s.department_id"><option value="">All departments</option><option v-for="d in depts" :key="d.id" :value="d.id">{{ d.name }}</option></select>
          <button class="btn primary" @click="loadSummary">Run</button>
          <button class="btn" @click="download('/reports/summary' + qs({ ...s, format: 'csv' }))">Export CSV</button>
        </div>
      </div>
      <div class="card table-wrap">
        <table class="table" v-if="summary.length">
          <thead><tr><th>{{ { type: 'Leave type', department: 'Department', employee: 'Employee', month: 'Month' }[s.group] }}</th><th>Code</th><th class="num">Applications</th><th class="num">Employees</th><th class="num">Days</th><th class="num">With pay</th><th class="num">Without pay</th></tr></thead>
          <tbody>
            <tr v-for="r in summary" :key="r.label + r.code"><td>{{ r.label }}<div v-if="r.department_name" class="faint">{{ r.department_name }}</div></td><td class="faint">{{ r.code }}</td><td class="num">{{ r.requests }}</td><td class="num">{{ r.employees }}</td><td class="num"><strong>{{ fmtDays(r.days) }}</strong></td><td class="num">{{ fmtDays(r.with_pay) }}</td><td class="num">{{ fmtDays(r.without_pay) }}</td></tr>
          </tbody>
          <tfoot><tr><td><strong>Total</strong></td><td></td><td class="num">{{ sum('requests') }}</td><td></td><td class="num"><strong>{{ fmtDays(sum('days')) }}</strong></td><td class="num">{{ fmtDays(sum('with_pay')) }}</td><td class="num">{{ fmtDays(sum('without_pay')) }}</td></tr></tfoot>
        </table>
        <div v-else class="empty">No approved leave in this period.</div>
      </div>
    </template>

    <template v-if="tab === 'balances'">
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="row">
          <select v-if="store.user.org_wide" class="input" style="width:auto" v-model="b.department_id" @change="loadBalances"><option value="">All departments</option><option v-for="d in depts" :key="d.id" :value="d.id">{{ d.name }}</option></select>
          <button class="btn" @click="download('/reports/balances' + qs({ ...b, format: 'csv' }))">Export CSV</button>
          <span class="faint">Balance reconciliation for payroll and accounting.</span>
        </div>
      </div>
      <div class="card table-wrap" v-if="balances">
        <table class="table">
          <thead><tr><th>Employee</th><th>Department</th><th v-for="c in balances.types" :key="c" class="num">{{ c }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in balances.rows" :key="r.id"><td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.employee_no }} · {{ r.position }}</div></td><td>{{ r.department_name }}</td><td v-for="c in balances.types" :key="c" class="num">{{ fmtNum(r[c]) }}</td><td><router-link :to="`/leave-card/${r.id}`">Leave card</router-link></td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="tab === 'lwop'">
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="row">
          <label class="faint">From <input class="input" type="date" v-model="l.from" style="width:auto" /></label>
          <label class="faint">To <input class="input" type="date" v-model="l.to" style="width:auto" /></label>
          <button class="btn primary" @click="loadLwop">Run</button>
          <button class="btn" @click="download('/reports/lwop' + qs({ ...l, format: 'csv' }))">Export CSV</button>
        </div>
      </div>
      <div class="card table-wrap">
        <table class="table" v-if="lwop.length">
          <thead><tr><th>Employee</th><th>Tracking no.</th><th>Leave</th><th>Dates</th><th class="num">Applied</th><th class="num">With pay</th><th class="num">Without pay</th></tr></thead>
          <tbody>
            <tr v-for="r in lwop" :key="r.tracking_no"><td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.employee_no }} · {{ r.department_name }}</div></td><td class="mono">{{ r.tracking_no }}</td><td>{{ r.leave_name }}</td><td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}</td><td class="num">{{ fmtDays(r.days_applied) }}</td><td class="num">{{ fmtDays(r.days_with_pay) }}</td><td class="num"><strong>{{ fmtDays(r.days_without_pay) }}</strong></td></tr>
          </tbody>
        </table>
        <div v-else class="empty">No leave without pay in this period.</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, qs, download } from '../api';
import { store, hasRole, currentWorkspace } from '../store';
import { fmtDays, fmtNum, STATUS_LABEL } from '../format';

const ws = computed(() => currentWorkspace());
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const y = new Date().getFullYear();
const route = useRoute();
const tab = ref(['summary', 'balances', 'lwop'].includes(route.query.tab) ? route.query.tab : 'overview');
const dash = ref(null);
const depts = ref([]);
const summary = ref([]);
const balances = ref(null);
const lwop = ref([]);
const s = reactive({ group: 'type', from: `${y}-01-01`, to: `${y}-12-31`, department_id: '' });
const b = reactive({ department_id: '' });
const l = reactive({ from: `${y}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, to: `${y}-12-31` });
const maxMonth = computed(() => Math.max(1, ...dash.value.monthly.map((m) => m.days)));
const maxType = computed(() => Math.max(1, ...dash.value.by_type.map((t) => t.days)));
const pct = (v) => (v / maxMonth.value) * 100;
const statusCount = (st) => (dash.value.status.find((x) => x.status === st) || { n: 0 }).n;
const sum = (k) => summary.value.reduce((a, r) => a + Number(r[k] || 0), 0);

async function loadSummary() { summary.value = (await api.get('/reports/summary' + qs(s))).rows; }
async function loadBalances() { balances.value = await api.get('/reports/balances' + qs(b)); }
async function loadLwop() { lwop.value = (await api.get('/reports/lwop' + qs(l))).rows; }

onMounted(async () => {
  [dash.value, depts.value] = await Promise.all([api.get('/reports/dashboard'), api.get('/admin/departments')]);
  loadSummary();
  if (tab.value === 'balances') loadBalances();
  if (tab.value === 'lwop') loadLwop();
});
</script>
