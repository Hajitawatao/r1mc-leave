<template>
  <div class="page" v-if="a">
    <div class="page-head">
      <div>
        <div class="ws-banner">Admin (MIS) workspace</div>
        <h1>System administration</h1>
        <div class="sub">Full access to every module. Approvals you make outside your own role are recorded as “Admin override”.</div>
      </div>
      <div class="row">
        <router-link to="/admin/employees" class="btn primary">Accounts</router-link>
        <router-link to="/admin/roles" class="btn">Roles &amp; access</router-link>
        <router-link to="/admin/settings" class="btn">Settings</router-link>
      </div>
    </div>

    <div class="stats">
      <div class="stat primary"><div class="label">User accounts</div><div class="value">{{ a.users.active }}</div><div class="hint">active of {{ a.users.total }}</div></div>
      <div class="stat"><div class="label">Signed in today</div><div class="value">{{ a.users.today }}</div><div class="hint">{{ a.users.never }} never signed in</div></div>
      <div class="stat"><div class="label">Still on initial password</div><div class="value">{{ a.users.initial_pw }}</div><div class="hint">must change at next login</div></div>
      <div class="stat"><div class="label">Locked / failed logins</div><div class="value" :style="{ color: a.users.locked ? 'var(--bad)' : '' }">{{ a.users.locked }} / {{ a.failed_logins_24h }}</div><div class="hint">locked now / failed in 24h</div></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Accounts by role</h2><router-link to="/admin/roles">Details</router-link></div>
        <div class="card-body">
          <div v-for="r in roleRows" :key="r.key" class="bal"><span>{{ r.label }}</span><strong>{{ r.n }}</strong></div>
          <p class="faint" style="margin-top:8px">Every account is also an Employee. Supervisors come from the “Immediate supervisor” field, not a role.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Server</h2></div>
        <div class="card-body">
          <div class="bal"><span>Database</span><span class="mono">{{ a.server.db_version }}</span></div>
          <div class="bal"><span>Node.js</span><span class="mono">{{ a.server.node }}</span></div>
          <div class="bal"><span>Running for</span><span>{{ uptime }}</span></div>
          <div class="bal"><span>Email notifications</span><span>{{ a.server.email ? 'On (SMTP configured)' : 'Off (in-app only)' }}</span></div>
          <div class="bal"><span>Employees / departments</span><span>{{ a.counts.employees }} / {{ a.counts.departments }}</span></div>
          <div class="bal"><span>Applications / attachments</span><span>{{ a.counts.requests }} / {{ a.counts.attachments }}</span></div>
          <p class="faint" style="margin-top:8px">Back up regularly with <span class="mono">backup-db.bat</span> on the server.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api';
import { ROLE_LABEL } from '../../workspaces';

const a = ref(null);
const roleRows = computed(() => ['ADMIN', 'HR', 'ACCOUNTING', 'OSH', 'CAO', 'MANAGEMENT'].map((k) => ({ key: k, label: ROLE_LABEL[k], n: (a.value.roles.find((r) => r.role === k) || { n: 0 }).n })));
const uptime = computed(() => { const m = a.value.server.uptime_min; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; });
onMounted(async () => { a.value = await api.get('/reports/home/admin'); });
</script>
