<template>
  <div class="login-form" style="min-height:100vh">
    <form @submit.prevent="submit" class="card card-pad" style="width:min(400px,100%)">
      <h1>Change password</h1>
      <p v-if="store.user && store.user.must_change_password" class="alert info">You are using an initial password. Set your own password to continue.</p>
      <div v-if="error" class="alert error">{{ error }}</div>
      <label class="field">Current password<input class="input" type="password" v-model="current" autocomplete="current-password" required /></label>
      <label class="field">New password
        <input class="input" type="password" v-model="next" autocomplete="new-password" required />
        <span class="help">At least 8 characters, with letters and numbers.</span>
      </label>
      <label class="field">Confirm new password<input class="input" type="password" v-model="confirm" autocomplete="new-password" required /></label>
      <div class="row">
        <button class="btn primary" :disabled="busy">Save password</button>
        <button v-if="store.user && !store.user.must_change_password" type="button" class="btn" @click="$router.back()">Cancel</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { store, loadMe, toast } from '../store';

const router = useRouter();
const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (next.value !== confirm.value) { error.value = 'The new passwords do not match'; return; }
  busy.value = true;
  try {
    await api.post('/auth/change-password', { current_password: current.value, new_password: next.value });
    await loadMe();
    toast('Password changed');
    router.push('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
form { display: flex; flex-direction: column; gap: 14px; }
</style>
