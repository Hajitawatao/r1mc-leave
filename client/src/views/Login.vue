<template>
  <div class="auth-bg">
    <div class="auth-card">
      <div class="auth-head">
        <img src="/r1mc-logo.png" alt="Region I Medical Center" class="auth-logo" />
        <h1>Leave Enrollment &amp; Approval</h1>
        <p>Region I Medical Center · HRMO</p>
      </div>

      <form v-if="mode === 'login'" @submit.prevent="submit" class="auth-form">
        <div v-if="error" class="alert error">{{ error }}</div>
        <label class="field">Username
          <input class="input" v-model.trim="username" autocomplete="username" placeholder="Employee number" autofocus required />
        </label>
        <label class="field">Password
          <div class="pw">
            <input class="input" v-model="password" :type="showPw ? 'text' : 'password'" autocomplete="current-password" required />
            <button type="button" class="pw-toggle" @click="showPw = !showPw" :aria-label="showPw ? 'Hide password' : 'Show password'">{{ showPw ? 'Hide' : 'Show' }}</button>
          </div>
        </label>
        <button class="btn primary auth-btn" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        <button type="button" class="btn link auth-link" @click="toForgot">Forgot password?</button>
      </form>

      <form v-else @submit.prevent="requestReset" class="auth-form">
        <template v-if="!sent">
          <div>
            <h2>Forgot your password?</h2>
            <p class="muted" style="margin-top:4px">Enter your username or employee number. HRMO will be notified and will reset it for you.</p>
          </div>
          <div v-if="error" class="alert error">{{ error }}</div>
          <label class="field">Username or employee number
            <input class="input" v-model.trim="username" autofocus required />
          </label>
          <button class="btn primary auth-btn" :disabled="busy">{{ busy ? 'Sending…' : 'Send reset request to HRMO' }}</button>
        </template>
        <div v-else class="alert ok">
          <strong>Request sent.</strong> If the account exists, HRMO has been notified. They will give you a temporary password, which you must change when you next sign in. For urgent help, contact HRMO or MIS directly.
        </div>
        <button type="button" class="btn link auth-link" @click="toLogin">← Back to sign in</button>
      </form>

      <div class="auth-foot">Management Information Service · For authorized R1MC personnel only</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { loadMe, currentWorkspace } from '../store';

const route = useRoute();
const router = useRouter();
const mode = ref('login');
const username = ref('');
const password = ref('');
const showPw = ref(false);
const error = ref('');
const busy = ref(false);
const sent = ref(false);

function toForgot() { mode.value = 'forgot'; error.value = ''; sent.value = false; }
function toLogin() { mode.value = 'login'; error.value = ''; }

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const r = await api.post('/auth/login', { username: username.value, password: password.value });
    await loadMe();
    if (r.must_change_password) router.push({ name: 'change-password' });
    else router.push(route.query.next || currentWorkspace().home);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function requestReset() {
  error.value = '';
  busy.value = true;
  try {
    await api.post('/auth/forgot-password', { username: username.value });
    sent.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-bg {
  min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(255, 255, 255, .10), transparent 60%),
    linear-gradient(160deg, #123f8a 0%, #0d2f6b 55%, #0a2454 100%);
}
.auth-card {
  width: min(400px, 100%); background: #fff; border-radius: 16px; padding: 32px 30px 20px;
  box-shadow: 0 24px 60px rgba(5, 20, 50, .35), 0 2px 6px rgba(5, 20, 50, .15);
}
.auth-head { text-align: center; margin-bottom: 22px; }
.auth-logo { width: 96px; height: 96px; display: block; margin: 0 auto 14px; }
.auth-head h1 { font-size: 20px; color: #0f2a5c; }
.auth-head p { color: var(--text-2); margin: 4px 0 0; font-size: 13px; }
.auth-form { display: flex; flex-direction: column; gap: 14px; }
.auth-form h2 { font-size: 17px; color: #0f2a5c; }
.auth-btn { width: 100%; min-height: 42px; font-size: 15px; background: #1a3f8f; border-color: #1a3f8f; }
.auth-btn:hover { background: #12306f; }
.auth-link { align-self: center; color: #1a3f8f; font-weight: 600; }
.pw { position: relative; }
.pw .input { padding-right: 64px; }
.pw-toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: none; color: #1a3f8f; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 8px; }
.input:focus { outline-color: rgba(26, 63, 143, .25); border-color: #1a3f8f; }
.auth-foot { text-align: center; color: var(--text-3); font-size: 11.5px; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
</style>
