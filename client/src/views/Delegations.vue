<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Delegate approval</h1><div class="sub">When you are away, let someone act on leave applications for you. Their actions are recorded as “for” you.</div></div>
    </div>
    <div class="grid-main">
      <div class="card">
        <div class="card-head"><h2>Delegations</h2></div>
        <div class="table-wrap">
          <table class="table" v-if="rows.length">
            <thead><tr><th>From</th><th>To</th><th>Period</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              <tr v-for="d in rows" :key="d.id" :style="{ opacity: active(d) ? 1 : .55 }">
                <td>{{ d.delegator_name }}</td>
                <td>{{ d.delegate_name }}</td>
                <td class="nowrap">{{ fmtRange(d.start_date, d.end_date) }}<div class="faint">{{ !d.is_active ? 'revoked' : active(d) ? 'active now' : d.end_date < today ? 'ended' : 'scheduled' }}</div></td>
                <td>{{ d.reason }}</td>
                <td><button v-if="d.is_active && d.delegator_user_id === store.user.id && d.end_date >= today" class="btn sm danger" @click="revoke(d)">Revoke</button></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">No delegations.</div>
        </div>
      </div>
      <form class="card card-pad stack" @submit.prevent="save">
        <h2>New delegation</h2>
        <label class="field">Delegate to
          <EmployeePicker v-model="f.delegate_user_id" endpoint="/delegations/candidates" id-key="user_id" />
        </label>
        <div class="form-grid">
          <label class="field">From<input class="input" type="date" v-model="f.start_date" :min="today" required /></label>
          <label class="field">Until<input class="input" type="date" v-model="f.end_date" :min="f.start_date" required /></label>
        </div>
        <label class="field">Reason<input class="input" v-model="f.reason" placeholder="e.g. On vacation leave" /></label>
        <div v-if="error" class="alert error">{{ error }}</div>
        <button class="btn primary" :disabled="!f.delegate_user_id">Delegate</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api';
import { store, toast } from '../store';
import { fmtRange, todayStr } from '../format';
import EmployeePicker from '../components/EmployeePicker.vue';

const today = todayStr();
const rows = ref([]);
const error = ref('');
const f = reactive({ delegate_user_id: null, start_date: today, end_date: today, reason: '' });
const active = (d) => d.is_active && d.start_date <= today && d.end_date >= today;

async function load() { rows.value = await api.get('/delegations'); }
async function save() {
  error.value = '';
  try { await api.post('/delegations', f); toast('Delegation saved'); f.reason = ''; await load(); } catch (e) { error.value = e.message; }
}
async function revoke(d) {
  if (!window.confirm(`Revoke delegation to ${d.delegate_name}?`)) return;
  await api.del(`/delegations/${d.id}`);
  toast('Delegation revoked');
  await load();
}
onMounted(load);
</script>
