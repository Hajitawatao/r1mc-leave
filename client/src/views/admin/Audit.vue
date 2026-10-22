<template>
  <div class="page">
    <div class="page-head"><div><h1>Audit trail</h1><div class="sub">Logins, leave actions, credit changes and configuration changes. Latest 500 entries matching the filter.</div></div></div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="row">
        <input class="input" style="max-width:220px" v-model="f.action" placeholder="Action (e.g. CREDIT, LOGIN)" @keydown.enter="load" />
        <label class="faint">From <input class="input" type="date" v-model="f.from" style="width:auto" /></label>
        <label class="faint">To <input class="input" type="date" v-model="f.to" style="width:auto" /></label>
        <button class="btn primary" @click="load">Filter</button>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>
          <tr v-for="a in rows" :key="a.id">
            <td class="nowrap faint">{{ fmtDateTime(a.created_at) }}</td>
            <td>{{ a.user_name || '—' }}<div class="faint mono">{{ a.username }}</div></td>
            <td><span class="tag">{{ a.action }}</span></td>
            <td class="faint">{{ a.entity }} {{ a.entity_id }}</td>
            <td class="mono" style="max-width:380px;word-break:break-word;font-size:11.5px">{{ a.details }}</td>
            <td class="faint mono">{{ a.ip }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty">No entries.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api, qs } from '../../api';
import { fmtDateTime } from '../../format';

const rows = ref([]);
const f = reactive({ action: '', from: '', to: '' });
async function load() { rows.value = await api.get('/admin/audit' + qs(f)); }
onMounted(load);
</script>
