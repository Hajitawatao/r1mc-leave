<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Holidays</h1><div class="sub">Holidays are skipped when counting working days of leave. Add special non-working days as they are proclaimed.</div></div>
    </div>
    <div class="grid-main">
      <div class="card table-wrap">
        <div class="card-head"><h2>Holidays</h2>
          <select class="input" style="width:auto" v-model="year" @change="load"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select>
        </div>
        <table class="table" v-if="shown.length">
          <thead><tr><th>Date</th><th>Day</th><th>Name</th><th></th></tr></thead>
          <tbody>
            <tr v-for="h in shown" :key="h.id"><td class="nowrap">{{ fmtDate(h.holiday_date) }}</td><td class="faint">{{ dow(h.holiday_date) }}</td><td>{{ h.name }}</td><td><button class="btn sm danger" @click="remove(h)">Remove</button></td></tr>
          </tbody>
        </table>
        <div v-else class="empty">No holidays recorded for {{ year }}.</div>
      </div>
      <form class="card card-pad stack" @submit.prevent="add">
        <h2>Add holiday</h2>
        <label class="field">Date<input class="input" type="date" v-model="f.holiday_date" required /></label>
        <label class="field">Name<input class="input" v-model="f.name" required placeholder="e.g. Pangasinan Day" /></label>
        <div v-if="error" class="alert error">{{ error }}</div>
        <button class="btn primary">Add</button>
        <p class="faint">Changing holidays affects new applications only. Days already applied for are not recounted.</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, qs } from '../../api';
import { toast } from '../../store';
import { fmtDate } from '../../format';

const now = new Date().getFullYear();
const years = [now - 1, now, now + 1];
const year = ref(now);
const rows = ref([]);
const error = ref('');
const f = reactive({ holiday_date: '', name: '' });
const shown = computed(() => rows.value.filter((h) => String(h.holiday_date).startsWith(String(year.value))));
const dow = (s) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(s + 'T00:00:00').getDay()];
async function load() { rows.value = await api.get('/holidays' + qs({ year: year.value })); }
async function add() {
  error.value = '';
  try { await api.post('/admin/holidays', f); toast('Holiday saved'); f.name = ''; await load(); } catch (e) { error.value = e.message; }
}
async function remove(h) { if (!window.confirm(`Remove ${h.name}?`)) return; await api.del(`/admin/holidays/${h.id}`); await load(); }
onMounted(load);
</script>
