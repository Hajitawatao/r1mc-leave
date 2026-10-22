<template>
  <div class="page">
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Printed on CSC Form 6 and used across the system.</div></div></div>
    <form class="card card-pad stack" style="max-width:720px" @submit.prevent="save">
      <div class="form-grid">
        <label class="field span-2">Agency name<input class="input" v-model="s.org_name" /></label>
        <label class="field">Short name<input class="input" v-model="s.org_short" /></label>
        <label class="field">Address<input class="input" v-model="s.org_address" /></label>
        <label class="field">HR certifying officer (7.A)<input class="input" v-model="s.hr_certifying_officer" /><span class="help">Used only if the HR step was not acted on in the system.</span></label>
        <label class="field">Position<input class="input" v-model="s.hr_certifying_position" /></label>
        <label class="field">Approving official (7.C)<input class="input" v-model="s.approving_officer" /></label>
        <label class="field">Position<input class="input" v-model="s.approving_position" /></label>
      </div>
      <button class="btn primary" style="align-self:flex-start">Save settings</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../api';
import { toast, loadSettings } from '../../store';

const s = ref({});
async function save() { await api.put('/admin/settings', s.value); await loadSettings(); toast('Settings saved'); }
onMounted(async () => { s.value = await api.get('/admin/settings'); });
</script>
