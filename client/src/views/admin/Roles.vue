<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Roles &amp; access</h1><div class="sub">What each role can do, based on the SRD (3.3 Stakeholders and Target Users, 4.1 System Flow), and who holds it.</div></div>
      <router-link to="/admin/employees" class="btn primary">Assign roles in Employees</router-link>
    </div>

    <div class="card table-wrap" style="margin-bottom:16px">
      <table class="table matrix">
        <thead>
          <tr><th>Capability</th><th class="faint">SRD</th><th v-for="c in COLS" :key="c.key" class="c" :style="{ color: WORKSPACES[c.key].accent }">{{ c.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in MATRIX" :key="row.cap">
            <td>{{ row.cap }}</td><td class="faint nowrap">{{ row.srd }}</td>
            <td v-for="c in COLS" :key="c.key" class="c">
              <span v-if="row.who[c.key] === 1" class="yes" :style="{ background: WORKSPACES[c.key].accent }">✓</span>
              <span v-else-if="row.who[c.key] === 2" class="part" :style="{ '--c': WORKSPACES[c.key].accent }" title="Limited"></span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="faint" style="padding:10px 16px">Filled = full access · half-filled = limited (own team for supervisors; Admin acts on approvals only as a labeled override)</div>
    </div>

    <div class="grid-2" v-if="data">
      <div v-for="r in ROLES" :key="r.key" class="card">
        <div class="card-head" :style="{ borderTop: `3px solid ${WORKSPACES[r.key].accent}` }">
          <div><h2>{{ WORKSPACES[r.key].label }}</h2><div class="faint">{{ r.srd }}</div></div>
          <span class="tag">{{ count(r.key) }}</span>
        </div>
        <div class="card-body">
          <p class="muted">{{ r.desc }}</p>
          <p class="faint" style="margin-bottom:6px">{{ r.how }}</p>
          <template v-if="r.key === 'SUPERVISOR'">
            <div v-for="s in data.supervisors" :key="s.employee_id" class="bal"><span>{{ s.last_name }}, {{ s.first_name }} <span class="faint">{{ s.position }}</span></span><span class="faint">{{ s.reports }} report(s)</span></div>
            <div v-for="d in data.heads.filter((x) => x.employee_id)" :key="'h' + d.id" class="bal"><span>{{ d.last_name }}, {{ d.first_name }}</span><span class="faint">Head, {{ d.department_name }}</span></div>
          </template>
          <template v-else-if="r.key === 'EMPLOYEE'">
            <div class="bal"><span>All active employees</span><strong>{{ data.employees }}</strong></div>
          </template>
          <template v-else>
            <div v-if="!members(r.key).length" class="faint">Nobody has this role yet.</div>
            <div v-for="m in members(r.key)" :key="m.user_id" class="bal" :style="{ opacity: m.is_active ? 1 : .5 }">
              <span>{{ m.last_name }}, {{ m.first_name }} <span class="faint">{{ m.position }}</span></span><span class="faint mono">{{ m.username }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../api';
import { WORKSPACES } from '../../workspaces';

const COLS = ['EMPLOYEE', 'SUPERVISOR', 'OSH', 'HR', 'ACCOUNTING', 'ADMIN'].map((k) => ({ key: k, label: WORKSPACES[k].label }));
const all = (v = 1) => Object.fromEntries(COLS.map((c) => [c.key, v]));
const MATRIX = [
  { cap: 'File leave, upload documents, track status, get notifications', srd: '3.2.1, 4.1.1, 4.1.4', who: all() },
  { cap: 'View own balances and leave card (ledger)', srd: '3.2.1, 4.1.4', who: all() },
  { cap: 'Approve / return / disapprove for own staff', srd: '4.1.2', who: { SUPERVISOR: 1, ADMIN: 2 } },
  { cap: 'Medical clearance of sick leave', srd: 'Process flow (OSH)', who: { OSH: 1, ADMIN: 2 } },
  { cap: 'Validate eligibility, certify credits, mark LWOP', srd: '4.1.3 (HRIC)', who: { HR: 1, ADMIN: 2 } },
  { cap: 'Payroll review of approved leave', srd: '3.2.6, Process flow (Accounting)', who: { ACCOUNTING: 1, ADMIN: 2 } },
  { cap: 'Delegate approval rights while away', srd: '3.2.3', who: { SUPERVISOR: 1, OSH: 1, HR: 1, ACCOUNTING: 1, ADMIN: 1 } },
  { cap: 'View team applications and team reports', srd: '4.1.5', who: { SUPERVISOR: 2, HR: 1, ACCOUNTING: 1, ADMIN: 1 } },
  { cap: 'View all applications and organization-wide reports', srd: '3.2.5, 4.1.5', who: { HR: 1, ACCOUNTING: 1, ADMIN: 1 } },
  { cap: 'LWOP report and balance reconciliation for payroll', srd: '4.1.5', who: { HR: 1, ACCOUNTING: 1, ADMIN: 1 } },
  { cap: 'Manage employees, logins and roles; reset passwords', srd: '3.3 (Administrators)', who: { HR: 1, ADMIN: 1 } },
  { cap: 'Post accruals, adjust balances, import from Excel', srd: '3.3 (HRMO)', who: { HR: 1, ADMIN: 1 } },
  { cap: 'Configure leave types, approval routes, departments, holidays', srd: '3.3 (HRMO)', who: { HR: 1, ADMIN: 1 } },
  { cap: 'System settings and Admin role', srd: '3.3 (MIS team)', who: { ADMIN: 1 } },
];
const ROLES = [
  { key: 'EMPLOYEE', srd: 'SRD 3.3 Employees', desc: 'Primary users. File leave, upload documents and monitor their applications.', how: 'Automatic for everyone with a login.' },
  { key: 'SUPERVISOR', srd: 'SRD 3.3 Supervisors and Managers, 4.1.2', desc: 'Review subordinates’ leave against workload, policy, leave history and overlapping leave.', how: 'Automatic: set as someone’s Immediate supervisor, or as a Department head.' },
  { key: 'OSH', srd: 'SRD process flow', desc: 'Checks medical results and clears sick leave before it reaches the supervisor.', how: 'Assign the OSH role in Employees.' },
  { key: 'HR', srd: 'SRD 3.3 HRMO Staff, 4.1.3 HRIC', desc: 'Configure leave types and policies, validate applications, certify credits, mark LWOP, generate reports.', how: 'Assign the HR role in Employees.' },
  { key: 'ACCOUNTING', srd: 'SRD 3.2.6, process flow', desc: 'Reviews approved leave for payroll and receives leave-without-pay notices.', how: 'Assign the Accounting role in Employees.' },
  { key: 'ADMIN', srd: 'SRD 3.3 MIS Team', desc: 'Develops, maintains and secures the system. Full access to every module.', how: 'Assign the Admin role in Employees (Admins only).' },
];

const data = ref(null);
const members = (role) => data.value.members.filter((m) => m.role === role);
const count = (role) => {
  if (role === 'EMPLOYEE') return data.value.employees;
  if (role === 'SUPERVISOR') return new Set([...data.value.supervisors.map((s) => s.employee_id), ...data.value.heads.filter((h) => h.employee_id).map((h) => h.employee_id)]).size;
  return members(role).length;
};
onMounted(async () => { data.value = await api.get('/admin/roles'); });
</script>

<style scoped>
.matrix th.c, .matrix td.c { text-align: center; width: 84px; }
.matrix th.c { font-size: 11.5px; }
.yes { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 700; }
.part { display: inline-block; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--c); background: linear-gradient(90deg, var(--c) 50%, transparent 50%); vertical-align: middle; }
</style>
