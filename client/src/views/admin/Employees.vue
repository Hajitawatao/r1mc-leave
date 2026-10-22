<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Employees &amp; accounts</h1><div class="sub">Employee records, supervisors, system roles and logins. Accounts are created by HR only.</div></div>
      <div class="row"><router-link to="/admin/import" class="btn">Import from Excel</router-link><button class="btn primary" @click="edit(null)">+ Add employee</button></div>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="row">
        <input class="input" style="max-width:280px" v-model="q" placeholder="Search name, employee no., position" @keydown.enter="load" />
        <select class="input" style="width:auto" v-model="dept" @change="load"><option value="">All departments</option><option v-for="d in depts" :key="d.id" :value="d.id">{{ d.name }}</option></select>
        <label class="check"><input type="checkbox" v-model="showInactive" @change="load" /> Include inactive</label>
        <button class="btn" @click="load">Search</button>
        <span class="faint">{{ rows.length }} shown</span>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>Employee</th><th>Department</th><th>Supervisor</th><th>Roles</th><th>Login</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in rows" :key="e.id" :style="{ opacity: e.is_active ? 1 : .5 }">
            <td><strong>{{ e.last_name }}, {{ e.first_name }}</strong><div class="faint">{{ e.employee_no }} · {{ e.position }}</div></td>
            <td>{{ e.department_name }}</td>
            <td>{{ e.supervisor_name || '—' }}</td>
            <td><span v-for="r in (e.roles || '').split(',').filter(Boolean)" :key="r" class="tag" style="margin-right:3px">{{ r }}</span></td>
            <td><template v-if="e.username"><span class="mono">{{ e.username }}</span><div class="faint">{{ e.user_active ? (e.last_login_at ? 'last in ' + fmtDate(e.last_login_at) : 'never logged in') : 'disabled' }}</div></template><span v-else class="faint">no account</span></td>
            <td class="nowrap">
              <button class="btn sm" @click="edit(e)">Edit</button>
              <router-link class="btn sm" :to="`/leave-card/${e.id}`" style="margin-left:4px">Leave card</router-link>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty">No employees found.</div>
    </div>

    <Modal v-if="form" :title="form.id ? 'Edit employee' : 'Add employee'" wide @close="form = null">
      <div class="form-grid">
        <label class="field">Employee no.<input class="input" v-model="form.employee_no" required /></label>
        <label class="field">Employment status<input class="input" v-model="form.employment_status" placeholder="Permanent, Casual, Contractual…" /></label>
        <label class="field">Last name<input class="input" v-model="form.last_name" /></label>
        <label class="field">First name<input class="input" v-model="form.first_name" /></label>
        <label class="field">Middle name<input class="input" v-model="form.middle_name" /></label>
        <label class="field">Suffix<input class="input" v-model="form.suffix" placeholder="Jr., III" /></label>
        <label class="field">Sex<select class="input" v-model="form.sex"><option :value="null">—</option><option value="F">Female</option><option value="M">Male</option></select></label>
        <label class="field">Date hired<input class="input" type="date" v-model="form.date_hired" /></label>
        <label class="field">Position<input class="input" v-model="form.position" /></label>
        <div class="form-grid" style="gap:10px">
          <label class="field">Salary grade<input class="input" v-model="form.salary_grade" /></label>
          <label class="field">Monthly salary<input class="input" type="number" step="0.01" v-model="form.monthly_salary" /></label>
        </div>
        <label class="field">Department<select class="input" v-model="form.department_id"><option :value="null">—</option><option v-for="d in depts" :key="d.id" :value="d.id">{{ d.name }}</option></select></label>
        <label class="field">Immediate supervisor<EmployeePicker v-model="form.supervisor_id" :label="form.supervisor_name || ''" /></label>
        <label class="field span-2">Email <span class="help">Optional. Used for email notifications if the server has email set up.</span><input class="input" type="email" v-model="form.email" /></label>
        <div class="field span-2">System roles <span class="help">Everyone can file leave. Supervisors are set by the “Immediate supervisor” field and department heads, not by a role.</span>
          <div class="row" style="font-weight:400">
            <label v-for="r in roleOptions" :key="r.v" class="check"><input type="checkbox" :value="r.v" v-model="form.roles" :disabled="r.v === 'ADMIN' && !hasRole('ADMIN')" /> {{ r.l }}</label>
          </div>
        </div>
        <label v-if="form.id" class="check span-2"><input type="checkbox" v-model="form.is_active" /> Active employee (unticking also disables the login)</label>
      </div>
      <div v-if="error" class="alert error" style="margin-top:12px">{{ error }}</div>
      <div v-if="created" class="alert ok" style="margin-top:12px">Account created. Username <strong class="mono">{{ created.username }}</strong>, initial password <strong class="mono">{{ created.initial_password }}</strong>. The employee must change it at first login.</div>
      <template #foot>
        <template v-if="form.id">
          <button v-if="form.user_id" class="btn warn" @click="resetPw">Reset password</button>
          <button v-else class="btn" @click="createAccount">Create login</button>
        </template>
        <span style="flex:1"></span>
        <button class="btn" @click="form = null">Close</button>
        <button class="btn primary" @click="save">Save</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api, qs } from '../../api';
import { toast, hasRole } from '../../store';
import { fmtDate } from '../../format';
import Modal from '../../components/Modal.vue';
import EmployeePicker from '../../components/EmployeePicker.vue';

const rows = ref([]);
const depts = ref([]);
const q = ref('');
const dept = ref('');
const showInactive = ref(false);
const form = ref(null);
const error = ref('');
const created = ref(null);
const roleOptions = [{ v: 'HR', l: 'HR (HRMO)' }, { v: 'ACCOUNTING', l: 'Accounting' }, { v: 'OSH', l: 'OSH' }, { v: 'CAO', l: 'Chief Admin Officer' }, { v: 'MANAGEMENT', l: 'Management (reports)' }, { v: 'ADMIN', l: 'System admin' }];

async function load() { rows.value = await api.get('/admin/employees' + qs({ q: q.value, department_id: dept.value, active: showInactive.value ? 'all' : '' })); }

function edit(e) {
  error.value = '';
  created.value = null;
  form.value = e
    ? { ...e, roles: (e.roles || '').split(',').filter(Boolean), is_active: !!e.is_active }
    : { employee_no: '', last_name: '', first_name: '', middle_name: '', suffix: '', sex: null, position: '', salary_grade: '', monthly_salary: '', department_id: null, supervisor_id: null, employment_status: 'Permanent', date_hired: '', email: '', roles: [], is_active: true };
}

async function save() {
  error.value = '';
  try {
    if (form.value.id) {
      await api.put(`/admin/employees/${form.value.id}`, form.value);
      toast('Employee saved');
      form.value = null;
    } else {
      const r = await api.post('/admin/employees', form.value);
      created.value = r;
      form.value.id = r.id;
      toast('Employee added');
    }
    await load();
    if (form.value && form.value.id) { const fresh = rows.value.find((x) => x.id === form.value.id); if (fresh) form.value.user_id = fresh.user_id; }
  } catch (e) { error.value = e.message; }
}

async function resetPw() {
  if (!window.confirm('Reset this password to the employee number? The employee must change it at next login.')) return;
  const r = await api.post(`/admin/employees/${form.value.id}/reset-password`);
  created.value = { username: form.value.username, initial_password: r.initial_password };
  toast('Password reset');
}
async function createAccount() {
  try { const r = await api.post(`/admin/employees/${form.value.id}/account`); created.value = r; await load(); form.value.user_id = rows.value.find((x) => x.id === form.value.id)?.user_id; } catch (e) { error.value = e.message; }
}

onMounted(async () => { depts.value = await api.get('/admin/departments'); await load(); });
</script>
