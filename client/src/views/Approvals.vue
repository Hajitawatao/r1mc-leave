<template>
  <div class="page">
    <div class="page-head">
      <div><h1>For my action</h1><div class="sub">Applications waiting at a step you approve<span v-if="store.user.acting_for">, including those delegated to you</span>.</div></div>
    </div>
    <div class="tabs">
      <button :class="{ on: tab === 'inbox' }" @click="tab = 'inbox'">Waiting <span class="faint">{{ inbox.length }}</span></button>
      <button :class="{ on: tab === 'acted' }" @click="tab = 'acted'">I acted on</button>
    </div>
    <div class="card table-wrap">
      <table class="table" v-if="rows.length">
        <thead><tr><th>Tracking no.</th><th>Employee</th><th>Leave</th><th>Dates</th><th class="num">Days</th><th>{{ tab === 'inbox' ? 'Step' : 'Status' }}</th><th>Filed</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="clickable" @click="$router.push(`/requests/${r.id}`)">
            <td class="mono">{{ r.tracking_no }}</td>
            <td><strong>{{ r.last_name }}, {{ r.first_name }}</strong><div class="faint">{{ r.position }}<span v-if="r.department_name"> · {{ r.department_name }}</span></div></td>
            <td>{{ r.leave_name }}</td>
            <td class="nowrap">{{ fmtRange(r.start_date, r.end_date) }}<div v-if="r.start_date <= today && tab === 'inbox'" class="faint" style="color:var(--warn)">already started</div></td>
            <td class="num">{{ fmtDays(r.days_applied) }}</td>
            <td v-if="tab === 'inbox'">{{ r.current_step }}</td>
            <td v-else><StatusBadge :status="r.status" :lwop="r.is_lwop" /></td>
            <td class="faint nowrap">{{ fmtDate(r.submitted_at) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">{{ tab === 'inbox' ? 'Nothing is waiting for you.' : 'You have not acted on any application yet.' }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import { store } from '../store';
import { fmtDate, fmtDays, fmtRange, todayStr } from '../format';
import StatusBadge from '../components/StatusBadge.vue';

const tab = ref('inbox');
const inbox = ref([]);
const acted = ref([]);
const today = todayStr();
const rows = computed(() => (tab.value === 'inbox' ? inbox.value : acted.value));
onMounted(async () => { [inbox.value, acted.value] = await Promise.all([api.get('/requests/inbox'), api.get('/requests/acted')]); });
</script>
