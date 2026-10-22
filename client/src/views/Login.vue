<template>
  <div class="login-wrap">
    <div class="login-art">
      <div>
        <div class="brand-mark" style="width:44px;height:44px">
          <svg viewBox="0 0 20 20" style="width:26px;height:26px"><path d="M7.5 2h5v5.5H18v5h-5.5V18h-5v-5.5H2v-5h5.5z" fill="#0f5e4f" /></svg>
        </div>
        <h1>Leave Enrollment and Approval</h1>
        <p>Region 1 Medical Center · Human Resource Management Office</p>
      </div>
      <p style="font-size:12.5px">File leave, track approval and check your leave credits from any computer on the hospital network.</p>
    </div>
    <div class="login-form">
      <form @submit.prevent="submit">
        <div>
          <h1>Sign in</h1>
          <p class="muted" style="margin-top:4px">Use the account issued by HRMO.</p>
        </div>
        <div v-if="error" class="alert error">{{ error }}</div>
        <label class="field">Username
          <input class="input" v-model.trim="username" autocomplete="username" autofocus required />
        </label>
        <label class="field">Password
          <input class="input" v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="btn primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        <p class="faint">Forgot your password? Ask HRMO or MIS to reset it.</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { loadMe } from '../store';

const route = useRoute();
const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const r = await api.post('/auth/login', { username: username.value, password: password.value });
    await loadMe();
    if (r.must_change_password) router.push({ name: 'change-password' });
    else router.push(route.query.next || '/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
