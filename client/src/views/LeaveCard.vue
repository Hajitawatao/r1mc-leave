<template>
  <div class="page" v-if="data">
    <div class="page-head">
      <div>
        <h1>Leave card</h1>
        <div class="sub">{{ data.employee.last_name }}, {{ data.employee.first_name }} · {{ data.employee.employee_no }}<span v-if="data.employee.position"> · {{ data.employee.position }}</span></div>
      </div>
      <div class="row no-print">
        <select class="input" v-model="code" style="width:auto">
          <option value="">All leave</option>
          <option v-for="b in data.balances" :key="b.code" :value="b.code">{{ b.name }}</option>
        </select>
        <button class="btn" @click="print">Print</button>
        <button v-if="empId" class="btn" @click="csv">Export CSV</button>
      </div>
    </div>
    <div class="stats" style="margin-bottom:16px">
      <div v-for="b in data.balances" :key="b.code" class="stat"><div class="label">{{ b.name }}</div><div class="value">{{ fmtNum(b.balance) }}</div><div class="hint">current balance</div></div>
    </div>
    <div class="card table-wrap">
      <table class="table" v-if="rows.length">
        <thead><tr><th>Date</th><th>Leave</th><th>Transaction</th><th>Reference / remarks</th><th class="num">Earned</th><th class="num">Used</th><th class="num">Balance</th></tr></thead>
        <tbody>
          <tr v-for="l in rows" :key="l.id">
            <td class="nowrap">{{ fmtDate(l.txn_date) }}</td>
            <td><span class="tag">{{ l.leave_code }}</span></td>
            <td>{{ TX[l.txn_type] }}</td>
            <td><router-link v-if="l.tracking_no" :to="'/requests/' + l.request_id" class="mono">{{ l.tracking_no }}</router-link> <span class="muted">{{ l.remarks }}</span></td>
            <td class="num">{{ l.days > 0 ? fmtNum(l.days) : '' }}</td>
            <td class="num">{{ l.days < 0 ? fmtNum(-l.days) : '' }}</td>
            <td class="num"><strong>{{ fmtNum(l.balance_after) }}</strong></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No leave transactions yet. HRMO posts opening balances and monthly earnings here.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, download } from '../api';
import { store } from '../store';
import { fmtDate, fmtNum } from '../format';

const route = useRoute();
const empId = route.params.employeeId ? Number(route.params.employeeId) : null;
const data = ref(null);
const code = ref('');
const TX = { OPENING: 'Opening balance', ACCRUAL: 'Earned', DEDUCTION: 'Leave taken', ADJUSTMENT: 'Adjustment', RESTORE: 'Restored (cancelled)', LWOP: 'Without pay' };
const rows = computed(() => data.value.ledger.filter((l) => !code.value || l.leave_code === code.value));

function print() { window.print(); }
function csv() { download(`/admin/credits/employee/${empId}?format=csv`); }

onMounted(async () => {
  if (empId) {
    data.value = await api.get(`/admin/credits/employee/${empId}`);
  } else {
    const [bal, ledger] = await Promise.all([api.get('/my/balances'), api.get('/my/ledger')]);
    data.value = { employee: { ...store.user }, balances: bal.credits, ledger };
  }
});
</script>
