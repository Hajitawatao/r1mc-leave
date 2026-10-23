<template>
  <router-view v-if="bare" />
  <div v-else class="shell" :class="{ 'is-collapsed': collapsed }" :style="{ '--ws': ws.accent }">
    <aside class="drawer" :class="{ collapsed: railMode, open: mobileOpen }">
      <div class="drawer-top">
        <button class="hamburger" :aria-label="railMode ? 'Expand menu' : 'Collapse menu'" :title="railMode ? 'Expand menu' : 'Collapse menu'" @click="toggleDrawer">
          <Icon :name="mobileOpen ? 'close' : 'menu'" :size="22" />
        </button>
        <img src="/r1mc-logo.png" alt="" class="drawer-logo" />
        <div class="drawer-brand">
          <div class="t">{{ store.settings.org_short || 'R1MC' }} Leave System</div>
          <div class="s">HRIS · Leave Enrollment</div>
        </div>
      </div>

      <div class="ws" v-if="workspaces.length">
        <button class="ws-btn" :disabled="workspaces.length < 2" :title="`Workspace: ${ws.label}`" @click="wsOpen = !wsOpen">
          <span class="ws-icon"><Icon :name="ws.icon" :size="18" /></span>
          <span class="ws-text"><span class="ws-cap">Workspace</span><span class="ws-name">{{ ws.label }}</span></span>
          <Icon v-if="workspaces.length > 1" name="chevron" :size="16" class="ws-chev" />
        </button>
        <div v-if="wsOpen" class="ws-menu" @mouseleave="wsOpen = false">
          <button v-for="w in workspaces" :key="w.key" class="ws-item" :class="{ on: w.key === store.workspace }" :style="{ '--c': w.accent }" @click="switchTo(w.key)">
            <span class="dot"></span>{{ w.label }}
          </button>
        </div>
      </div>

      <nav class="drawer-nav" @click="onNavClick">
        <template v-for="(item, i) in ws.nav" :key="i">
          <div v-if="item.section" class="nav-section">{{ item.section }}</div>
          <router-link v-else :to="item.to" class="nav-item" :class="{ active: isActive(item.to) }" :title="item.label">
            <Icon :name="item.icon" :size="20" />
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="badge(item)" class="nav-badge">{{ badge(item) }}</span>
          </router-link>
        </template>
      </nav>

      <div class="drawer-foot">
        <router-link to="/account" class="acct" title="My account" @click="mobileOpen = false">
          <span class="avatar">{{ initials }}</span>
          <span class="acct-text">
            <span class="acct-name">{{ u.first_name }} {{ u.last_name }}</span>
            <span class="acct-role">{{ u.position || u.employee_no }}</span>
          </span>
        </router-link>
        <div class="foot-actions">
          <router-link to="/account" class="foot-btn" title="Account" @click="mobileOpen = false"><Icon name="user" :size="18" /><span>Account</span></router-link>
          <button class="foot-btn" title="Sign out" @click="logout"><Icon name="logout" :size="18" /><span>Sign out</span></button>
        </div>
      </div>
    </aside>
    <div v-if="mobileOpen" class="drawer-backdrop" @click="mobileOpen = false"></div>
    <main class="main">
      <router-view :key="$route.fullPath" />
    </main>
  </div>
  <div class="toasts">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.message }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { store, refreshCounts, loadSettings, setWorkspace, currentWorkspace } from './store';
import { availableWorkspaces } from './workspaces';
import { api } from './api';
import Icon from './components/Icon.vue';

const route = useRoute();
const router = useRouter();
const bare = computed(() => route.meta.public || route.meta.bare || route.name === 'change-password' || !store.user);
const u = computed(() => store.user || { roles: [] });
const ws = computed(() => currentWorkspace());
const workspaces = computed(() => availableWorkspaces(store.user));
const initials = computed(() => `${(u.value.first_name || '?')[0]}${(u.value.last_name || '')[0] || ''}`.toUpperCase());

const isMobile = ref(window.innerWidth <= 900);
let saved = false;
try { saved = localStorage.getItem('lv_drawer_collapsed') === '1'; } catch (e) { /* storage unavailable */ }
const collapsed = ref(saved);
const mobileOpen = ref(false);
const wsOpen = ref(false);
const railMode = computed(() => (isMobile.value ? !mobileOpen.value : collapsed.value));

function toggleDrawer() {
  wsOpen.value = false;
  if (isMobile.value) { mobileOpen.value = !mobileOpen.value; return; }
  collapsed.value = !collapsed.value;
  try { localStorage.setItem('lv_drawer_collapsed', collapsed.value ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}
function onNavClick(e) { if (e.target.closest('a')) mobileOpen.value = false; }
function switchTo(key) {
  setWorkspace(key);
  wsOpen.value = false;
  mobileOpen.value = false;
  router.push(currentWorkspace().home);
}
function isActive(to) {
  const [path, q] = to.split('?');
  if (path === '/') return route.path === '/';
  if (q) return route.path === path && route.fullPath.includes(q);
  return route.path === path || (route.path.startsWith(path + '/') && path !== '/reports');
}
function badge(item) {
  if (item.badge === 'inbox') return store.inbox || '';
  if (item.badge === 'unread') return store.unread || '';
  return '';
}
async function logout() {
  await api.post('/auth/logout');
  store.user = null;
  mobileOpen.value = false;
  router.push({ name: 'login' });
}

function onResize() { isMobile.value = window.innerWidth <= 900; if (!isMobile.value) mobileOpen.value = false; }
let timer;
watch(() => store.user && store.user.id, (id) => { if (id) { refreshCounts(); loadSettings(); } }, { immediate: true });
watch(() => route.fullPath, () => { refreshCounts(); wsOpen.value = false; });
onMounted(() => { timer = setInterval(refreshCounts, 60000); window.addEventListener('resize', onResize); });
onUnmounted(() => { clearInterval(timer); window.removeEventListener('resize', onResize); });
</script>
