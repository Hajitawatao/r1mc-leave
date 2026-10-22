<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Departments</h1><div class="sub">The department head approves for staff with no immediate supervisor, and for “Department head” approval steps.</div></div>
      <button class="btn primary" @click="form = { code: '', name: '', head_employee_id: null, is_active: true }">+ Add department</button>
    </div>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>Code</th><th>Name</th><th>Head</th><th class="num">Employees</th><th></th></tr></thead>
        <tbody>
          <tr v-for="d in rows" :key="d.id" :style="{ opacity: d.is_active ? 1 : .5 }">
            <td class="mono">{{ d.code }}</td><td>{{ d.name }}</td><td>{{ d.head_name || '—' }}</td><td class="num">{{ d.employee_count }}</td>
            <td><button class="btn sm" @click="form = { ...d, is_active: !!d.is_active }">Edit</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty">No departments yet. They are also created automatically by the Excel import.</div>
    </div>
    <Modal v-if="form" :title="form.id ? 'Edit department' : 'Add department'" @close="form = null">
      <div class="stack" style="gap:12px">
        <label class="field">Code<input class="input" v-model="form.code" /></label>
        <label class="field">Name<input class="input" v-model="form.name" /></label>
        <label class="field">Department head<EmployeePicker v-model="form.head_employee_id" :label="form.head_name || ''" /></label>
        <label v-if="form.id" class="check"><input type="checkbox" v-model="form.is_active" /> Active</label>
        <div v-if="error" class="alert error">{{ error }}</div>
      </div>
      <template #foot><button class="btn" @click="form = null">Cancel</button><button class="btn primary" @click="save">Save</button></template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../api';
import { toast } from '../../store';
import Modal from '../../components/Modal.vue';
import EmployeePicker from '../../components/EmployeePicker.vue';

const rows = ref([]);
const form = ref(null);
const error = ref('');
async function load() { rows.value = await api.get('/admin/departments'); }
async function save() {
  error.value = '';
  try {
    if (form.value.id) await api.put(`/admin/departments/${form.value.id}`, form.value); else await api.post('/admin/departments', form.value);
    toast('Department saved'); form.value = null; await load();
  } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>
