<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Leave credits</h1><div class="sub">Post monthly earnings, correct balances and open any employee's leave card. Every change is written to the ledger and audit trail.</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Monthly accrual</h2></div>
        <div class="card-body stack" style="gap:12px">
          <p class="muted" style="margin:0">Adds each credit-earning leave's monthly rate (VL and SL: 1.25 days) to every active employee hired on or before the month's end. Days without pay in that month reduce the credit by 1.25 ÷ 30 per day. Each month can be posted only once.</p>
          <div class="row">
            <input class="input" type="month" v-model="period" :max="lastMonth" style="width:auto" />
            <button class="btn primary" :disabled="busy || !period" @click="accrue">Post accrual</button>
          </div>
          <div v-if="accrualMsg" class="alert" :class="accrualMsg.kind">{{ accrualMsg.text }}</div>
          <table class="table" v-if="runs.length">
            <thead><tr><th>Period</th><th class="num">Employees</th><th>Posted by</th><th>When</th></tr></thead>
            <tbody><tr v-for="r in runs" :key="r.id"><td class="mono">{{ r.period }}</td><td class="num">{{ r.employees_count }}</td><td>{{ r.run_by_name }}</td><td class="faint">{{ fmtDateTime(r.run_at) }}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Adjust a balance</h2></div>
        <div class="card-body stack" style="gap:12px">
          <label class="field">Employee<EmployeePicker v-model="adj.employee_id" @picked="picked" /></label>
          <div v-if="emp" class="alert info">
            <span v-for="b in emp.balances" :key="b.code" style="margin-right:14px"><strong>{{ b.code }}</strong> {{ fmtNum(b.balance) }}</span>
            <router-link :to="`/leave-card/${adj.employee_id}`">Open leave card →</router-link>
          </div>
          <div class="form-grid">
            <label class="field">Leave<select class="input" v-model="adj.leave_type_id"><option v-for="t in creditTypes" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
            <label class="field">Mode<select class="input" v-model="adj.mode"><option value="ADD">Add / subtract days</option><option value="SET">Set balance to</option></select></label>
            <label class="field">{{ adj.mode === 'SET' ? 'New balance' : 'Days (+ or −)' }}<input class="input" type="number" step="0.001" v-model="adj.days" /></label>
          </div>
          <label class="field">Remarks (required)<input class="input" v-model="adj.remarks" placeholder="e.g. Correction per leave ledger audit, memo no. …" /></label>
          <div v-if="adjError" class="alert error">{{ adjError }}</div>
          <button class="btn primary" style="align-self:flex-start" :disabled="!adj.employee_id || adj.days === ''" @click="adjust">Save adjustment</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../../api';
import { toast } from '../../store';
import { fmtDateTime, fmtNum } from '../../format';
import EmployeePicker from '../../components/EmployeePicker.vue';

const d = new Date();
d.setDate(0);
const lastMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const period = ref(lastMonth);
const runs = ref([]);
const busy = ref(false);
const accrualMsg = ref(null);
const types = ref([]);
const creditTypes = computed(() => types.value.filter((t) => t.is_credit_type));
const adj = reactive({ employee_id: null, leave_type_id: null, mode: 'ADD', days: '', remarks: '' });
const emp = ref(null);
const adjError = ref('');

async function loadRuns() { runs.value = await api.get('/admin/credits/accruals'); }
async function accrue() {
  if (!window.confirm(`Post leave credit earnings for ${period.value} to all active employees?`)) return;
  busy.value = true;
  accrualMsg.value = null;
  try {
    const r = await api.post('/admin/credits/accrual', { period: period.value });
    accrualMsg.value = { kind: 'ok', text: `Posted ${r.types.join(' and ')} credits for ${r.period} to ${r.employees} employees.` };
    await loadRuns();
  } catch (e) { accrualMsg.value = { kind: 'error', text: e.message }; } finally { busy.value = false; }
}
async function picked() { emp.value = await api.get(`/admin/credits/employee/${adj.employee_id}`); }
async function adjust() {
  adjError.value = '';
  try {
    const r = await api.post('/admin/credits/adjust', adj);
    toast(`Saved. New balance: ${fmtNum(r.balance)}`);
    adj.days = ''; adj.remarks = '';
    await picked();
  } catch (e) { adjError.value = e.message; }
}
onMounted(async () => {
  types.value = (await api.get('/admin/leave-types')).types;
  adj.leave_type_id = creditTypes.value[0]?.id || null;
  await loadRuns();
});
</script>
