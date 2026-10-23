<template>
  <div class="page" v-if="h">
    <div class="page-head">
      <div>
        <div class="ws-banner">HRMO workspace</div>
        <h1>Human Resource Management Office</h1>
        <div class="sub">Validate applications, certify credits and keep leave records accurate.</div>
      </div>
      <div class="row">
        <router-link to="/approvals" class="btn primary">Review applications</router-link>
        <router-link to="/admin/employees" class="btn">Employees</router-link>
      </div>
    </div>

    <div v-if="h.accrual.due" class="alert warn" style="margin-bottom:16px">
      Leave credits for <strong>{{ h.accrual.expected }}</strong> have not been posted yet<span v-if="h.accrual.last"> (last posted: {{ h.accrual.last }})</span>.
      <router-link to="/admin/credits">Post monthly accrual →</router-link>
    </div>

    <div class="stats">
      <div class="stat primary"><div class="label">Waiting at HR validation</div><div class="value">{{ h.pending_at_hr }}</div><div class="hint">need your certification</div></div>
      <div class="stat"><div class="label">Pending (all steps)</div><div class="value">{{ h.pending }}</div><div class="hint">{{ h.returned }} returned to employees</div></div>
      <div class="stat"><div class="label">Approved this month</div><div class="value">{{ h.approved_month }}</div><div class="hint">applications</div></div>
      <div class="stat"><div class="label">LWOP this month</div><div class="value" :style="{ color: h.lwop_month ? 'var(--bad)' : '' }">{{ fmtDays(h.lwop_month) }}</div><div class="hint">day(s) without pay</div></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Password reset requests</h2><span class="faint">last 7 days</span></div>
        <div class="card-body">
          <div v-if="!h.reset_requests.length" class="faint">No requests.</div>
          <div v-for="r in h.reset_requests" :key="r.created_at + r.employee_no" class="bal">
            <div><div style="font-weight:600">{{ r.last_name }}, {{ r.first_name }}</div><div class="faint">{{ r.employee_no }} · {{ fmtDateTime(r.created_at) }}</div></div>
            <router-link :to="{ path: '/admin/employees', query: { q: r.employee_no } }" class="btn sm">Reset</router-link>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Data to fix</h2></div>
        <div class="card-body">
          <div class="bal"><span>Employees without a login</span><strong>{{ h.no_account }}</strong></div>
          <div class="bal"><span>Employees without an immediate supervisor</span><strong>{{ h.no_supervisor.length }}</strong></div>
          <p class="faint" style="margin-top:8px">Applications from employees without a supervisor go straight to HR.</p>
          <div v-for="e in h.no_supervisor.slice(0, 6)" :key="e.id" class="bal">
            <span>{{ e.last_name }}, {{ e.first_name }} <span class="faint">{{ e.department_name }}</span></span>
            <router-link :to="{ path: '/admin/employees', query: { q: e.employee_no } }" class="faint">Set →</router-link>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Upcoming holidays</h2><router-link to="/admin/holidays">Manage</router-link></div>
        <div class="card-body">
          <div v-if="!h.holidays.length" class="faint">No holidays in the next 45 days. Add special non-working days as they are proclaimed.</div>
          <div v-for="x in h.holidays" :key="x.holiday_date" class="bal"><span>{{ x.name }}</span><span class="faint">{{ fmtDate(x.holiday_date) }}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Shortcuts</h2></div>
        <div class="card-body row">
          <router-link to="/admin/credits" class="btn sm">Leave credits</router-link>
          <router-link to="/admin/import" class="btn sm">Import from Excel</router-link>
          <router-link to="/admin/leave-types" class="btn sm">Leave types &amp; routes</router-link>
          <router-link to="/reports" class="btn sm">Reports</router-link>
          <router-link to="/admin/roles" class="btn sm">Roles &amp; access</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../api';
import { fmtDate, fmtDateTime, fmtDays } from '../../format';

const h = ref(null);
onMounted(async () => { h.value = await api.get('/reports/home/hr'); });
</script>
