<template>
  <div class="page" v-if="a">
    <div class="page-head">
      <div>
        <div class="ws-banner">Accounting workspace</div>
        <h1>Payroll review</h1>
        <div class="sub">Approved leave and leave without pay for {{ monthLabel }}.</div>
      </div>
      <div class="row">
        <router-link to="/approvals" class="btn primary">Review applications</router-link>
        <button class="btn" @click="download('/reports/lwop' + qs({ from: a.from, to: a.to, format: 'csv' }))">Export LWOP (CSV)</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat primary"><div class="label">Waiting at Accounting</div><div class="value">{{ a.pending_at_accounting }}</div><div class="hint">application(s)</div></div>
      <div class="stat"><div class="label">LWOP days this month</div><div class="value" :style="{ color: a.lwop_days ? 'var(--bad)' : '' }">{{ fmtDays(a.lwop_days) }}</div><div class="hint">for payroll deduction</div></div>
      <div class="stat"><div class="label">Employees with LWOP</div><div class="value">{{ a.lwop_employees }}</div><div class="hint">this month</div></div>
    </div>
    <div class="card table-wrap" style="margin-top:16px">
      <div class="card-head"><h2>Leave without pay, {{ monthLabel }}</h2><router-link to="/reports?tab=lwop">Other periods →</router-link></div>
      <table class="table" v-if="a.lwop.length">
        <thead><tr><th>Employee</th><th>Tracking no.</th><th>Dates</th><th class="num">Days without pay</th></tr></thead>
        <tbody>
          <tr v-for="r in a.lwop" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
            <td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.employee_no }} · {{ r.department_name }}</div></td>
            <td class="mono">{{ r.tracking_no }}</td>
            <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}</td>
            <td class="num"><strong>{{ fmtDays(r.days_without_pay) }}</strong></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No leave without pay this month.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api, qs, download } from '../../api';
import { fmtDays, fmtRange } from '../../format';

const a = ref(null);
const monthLabel = computed(() => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
onMounted(async () => { a.value = await api.get('/reports/home/accounting'); });
</script>
