<template>
  <router-view v-if="bare" />
  <div v-else class="shell">
    <aside class="sidebar" :class="{ open: menuOpen }" @click="onNavClick">
      <div class="brand">
        <div class="brand-mark">
          <svg viewBox="0 0 20 20"><path d="M7.5 2h5v5.5H18v5h-5.5V18h-5v-5.5H2v-5h5.5z" fill="#0f5e4f" /></svg>
        </div>
        <div>
          <div class="brand-title">{{ store.settings.org_short || 'R1MC' }} Leave System</div>
          <div class="brand-sub">HRIS · Leave Enrollment</div>
        </div>
      </div>
      <nav class="nav">
        <router-link to="/">Dashboard</router-link>
        <router-link to="/file">File a leave</router-link>
        <router-link to="/my-requests">My applications</router-link>
        <router-link to="/leave-card">My leave card</router-link>
        <router-link to="/notifications">Notifications <span v-if="store.unread" class="count">{{ store.unread }}</span></router-link>

        <template v-if="isApprover">
          <div class="nav-label">Approvals</div>
          <router-link to="/approvals">For my action <span v-if="store.inbox" class="count">{{ store.inbox }}</span></router-link>
          <router-link to="/delegations">Delegate approval</router-link>
        </template>

        <template v-if="u.org_wide || u.is_supervisor">
          <div class="nav-label">{{ u.org_wide ? 'Monitoring' : 'My team' }}</div>
          <router-link to="/all-requests">{{ u.org_wide ? 'All applications' : 'Team applications' }}</router-link>
          <router-link to="/reports">Reports</router-link>
        </template>

        <template v-if="hasRole('HR')">
          <div class="nav-label">HR administration</div>
          <router-link to="/admin/employees">Employees &amp; accounts</router-link>
          <router-link to="/admin/credits">Leave credits</router-link>
          <router-link to="/admin/import">Import from Excel</router-link>
          <router-link to="/admin/leave-types">Leave types &amp; approvals</router-link>
          <router-link to="/admin/departments">Departments</router-link>
          <router-link to="/admin/holidays">Holidays</router-link>
        </template>
        <template v-if="hasRole('ADMIN')">
          <div class="nav-label">System</div>
          <router-link to="/admin/settings">Settings</router-link>
          <router-link to="/admin/audit">Audit trail</router-link>
        </template>
      </nav>
      <div class="sidebar-foot" v-if="store.user">
        <div class="who">{{ u.first_name }} {{ u.last_name }}</div>
        <div>{{ u.position || u.employee_no }}</div>
        <div class="row" style="gap:6px">
          <button @click="$router.push('/change-password')">Password</button>
          <button @click="logout">Log out</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <button aria-label="Menu" @click.stop="menuOpen = !menuOpen">☰</button>
        <strong>{{ store.settings.org_short || 'R1MC' }} Leave System</strong>
      </div>
      <router-view :key="$route.fullPath" />
    </div>
  </div>
  <div class="toasts">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.message }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { store, hasRole, refreshCounts, loadSettings } from './store';
import { api } from './api';

const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const bare = computed(() => route.meta.public || route.meta.bare || route.name === 'change-password' || !store.user);
const u = computed(() => store.user || { roles: [] });
const isApprover = computed(() => u.value.is_supervisor || u.value.acting_for > 0 || u.value.roles.some((r) => r !== 'EMPLOYEE' && r !== 'MANAGEMENT'));

function onNavClick(e) { if (e.target.closest('a')) menuOpen.value = false; }

async function logout() {
  await api.post('/auth/logout');
  store.user = null;
  router.push({ name: 'login' });
}

let timer;
watch(() => store.user && store.user.id, (id) => { if (id) { refreshCounts(); loadSettings(); } }, { immediate: true });
watch(() => route.fullPath, () => refreshCounts());
onMounted(() => { timer = setInterval(refreshCounts, 60000); });
onUnmounted(() => clearInterval(timer));
</script>
