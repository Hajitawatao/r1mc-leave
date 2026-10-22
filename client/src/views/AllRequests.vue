<template>
  <div class="page">
    <div class="page-head">
      <div><h1>{{ store.user.org_wide ? 'All applications' : 'Team applications' }}</h1><div class="sub">Search and filter leave applications. Export what you see to Excel (CSV).</div></div>
      <button class="btn" @click="exportCsv">Export CSV</button>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="row">
        <input class="input" style="max-width:240px" v-model="f.q" placeholder="Name, employee no., tracking no." @keydown.enter="load" />
        <select class="input" style="width:auto" v-model="f.status"><option value="">Any status</option><option v-for="s in statuses" :key="s">{{ s }}</option></select>
        <select class="input" style="width:auto" v-model="f.leave_type_id"><option value="">Any leave type</option><option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option></select>
        <select v-if="store.user.org_wide" class="input" style="width:auto" v-model="f.department_id"><option value="">All departments</option><option v-for="d in depts" :key="d.id" :value="d.id">{{ d.name }}</option></select>
        <label class="faint">From <input class="input" type="date" v-model="f.from" style="width:auto" /></label>
        <label class="faint">To <input class="input" type="date" v-model="f.to" style="width:auto" /></label>
        <button class="btn primary" @click="load">Search</button>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="table" v-if="rows.length">
        <thead><tr><th>Tracking no.</th><th>Employee</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th class="num">W/o pay</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
            <td class="mono">{{ r.tracking_no }}</td>
            <td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.employee_no }}<span v-if="r.department_name"> · {{ r.department_name }}</span></div></td>
            <td>{{ r.leave_name }}</td>
            <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}</td>
            <td class="num">{{ fmtDays(r.days_applied) }}</td>
            <td class="num">{{ r.days_without_pay ? fmtDays(r.days_without_pay) : '' }}</td>
            <td><StatusBadge :status="r.status" :lwop="r.is_lwop" /><div v-if="r.status === 'PENDING'" class="faint">At: {{ r.current_step }}</div></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No applications match.</div>
      <div v-if="rows.length >= 2000" class="faint" style="padding:10px 20px">Showing the first 2,000. Narrow the filters to see more.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api, qs, download } from '../api';
import { store } from '../store';
import { fmtDays, fmtRange } from '../format';
import StatusBadge from '../components/StatusBadge.vue';

const statuses = ['PENDING', 'RETURNED', 'APPROVED', 'DISAPPROVED', 'CANCELLED'];
const rows = ref([]);
const types = ref([]);
const depts = ref([]);
const f = reactive({ q: '', status: '', leave_type_id: '', department_id: '', from: '', to: '' });
async function load() { rows.value = await api.get('/requests' + qs(f)); }
function exportCsv() { download('/requests' + qs({ ...f, format: 'csv' })); }
onMounted(async () => {
  const [lt, d] = await Promise.all([api.get('/admin/leave-types'), api.get('/admin/departments')]);
  types.value = lt.types;
  depts.value = d;
  await load();
});
</script>
