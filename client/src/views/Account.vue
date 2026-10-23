<template>
  <div class="page">
    <div class="page-head"><div><h1>My account</h1><div class="sub">Your profile, roles and sign-in.</div></div></div>
    <div class="grid-main">
      <div class="card">
        <div class="card-body" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <span class="avatar" style="width:64px;height:64px;font-size:22px">{{ initials }}</span>
          <div>
            <h2 style="font-size:20px">{{ u.first_name }} {{ u.middle_name ? u.middle_name[0] + '.' : '' }} {{ u.last_name }}</h2>
            <div class="muted">{{ u.position }}<span v-if="u.department_name"> · {{ u.department_name }}</span></div>
          </div>
        </div>
        <div class="card-body" style="border-top:1px solid var(--border)">
          <dl class="kv">
            <dt>Employee no.</dt><dd class="mono">{{ u.employee_no }}</dd>
            <dt>Username</dt><dd class="mono">{{ u.username }}</dd>
            <dt>Roles</dt>
            <dd><span v-for="w in workspaces" :key="w.key" class="tag" :style="{ marginRight: '4px', background: w.accent, color: '#fff' }">{{ w.label }}</span></dd>
          </dl>
          <p class="faint" style="margin-top:12px">Wrong name, position or department? HRMO updates your employee record.</p>
        </div>
      </div>
      <div class="stack">
        <div class="card card-pad stack" style="gap:10px">
          <h2>Password</h2>
          <p class="muted" style="margin:0">At least 5 characters with a letter and a number.</p>
          <router-link to="/change-password" class="btn primary" style="align-self:flex-start">Change password</router-link>
        </div>
        <div class="card card-pad stack" style="gap:10px" v-if="workspaces.length > 1">
          <h2>Workspaces</h2>
          <p class="muted" style="margin:0">You have more than one role. Switch workspace to see that role's menu and dashboard.</p>
          <div class="row">
            <button v-for="w in workspaces" :key="w.key" class="btn sm" :style="w.key === store.workspace ? { background: w.accent, borderColor: w.accent, color: '#fff' } : {}" @click="go(w.key)">{{ w.label }}</button>
          </div>
        </div>
        <div class="card card-pad stack" style="gap:10px">
          <h2>Sign out</h2>
          <p class="muted" style="margin:0">Always sign out on shared computers.</p>
          <button class="btn danger" style="align-self:flex-start" @click="logout">Sign out</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { store, setWorkspace, currentWorkspace } from '../store';
import { availableWorkspaces } from '../workspaces';

const router = useRouter();
const u = computed(() => store.user);
const workspaces = computed(() => availableWorkspaces(store.user));
const initials = computed(() => `${u.value.first_name[0]}${u.value.last_name[0]}`.toUpperCase());
function go(key) { setWorkspace(key); router.push(currentWorkspace().home); }
async function logout() { await api.post('/auth/logout'); store.user = null; router.push({ name: 'login' }); }
</script>
