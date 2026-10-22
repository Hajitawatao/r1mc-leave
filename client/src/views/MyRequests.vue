<template>
  <div class="page">
    <div class="page-head">
      <div><h1>My applications</h1><div class="sub">Every leave you filed and where it is now.</div></div>
      <router-link to="/file" class="btn primary">+ File a leave</router-link>
    </div>
    <div class="tabs">
      <button v-for="t in tabs" :key="t.v" :class="{ on: tab === t.v }" @click="tab = t.v">{{ t.l }} <span class="faint">{{ count(t.v) }}</span></button>
    </div>
    <div class="card table-wrap">
      <table class="table" v-if="shown.length">
        <thead><tr><th>Tracking no.</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th class="num">W/o pay</th><th>Status</th><th>Filed</th></tr></thead>
        <tbody>
          <tr v-for="r in shown" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
            <td class="mono">{{ r.tracking_no }}</td>
            <td>{{ r.leave_name }}</td>
            <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}<span v-if="r.is_half_day" class="tag" style="margin-left:4px">{{ r.half_day_period }}</span></td>
            <td class="num">{{ fmtDays(r.days_applied) }}</td>
            <td class="num">{{ r.days_without_pay ? fmtDays(r.days_without_pay) : '' }}</td>
            <td><StatusBadge :status="r.status" :lwop="r.is_lwop" /><div v-if="r.status === 'PENDING'" class="faint">At: {{ r.current_step }}</div></td>
            <td class="faint nowrap">{{ fmtDate(r.submitted_at) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">Nothing here.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import { fmtDate, fmtDays, fmtRange } from '../format';
import StatusBadge from '../components/StatusBadge.vue';

const rows = ref([]);
const tab = ref('');
const tabs = [{ v: '', l: 'All' }, { v: 'PENDING', l: 'Pending' }, { v: 'RETURNED', l: 'Returned' }, { v: 'APPROVED', l: 'Approved' }, { v: 'DISAPPROVED', l: 'Disapproved' }, { v: 'CANCELLED', l: 'Cancelled' }];
const shown = computed(() => rows.value.filter((r) => !tab.value || r.status === tab.value));
const count = (v) => rows.value.filter((r) => !v || r.status === v).length;
onMounted(async () => { rows.value = await api.get('/requests/mine'); });
</script>
