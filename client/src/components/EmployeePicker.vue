<template>
  <div style="position:relative">
    <input class="input" :placeholder="placeholder" v-model="q" @input="search" @focus="open = results.length > 0" @blur="close" />
    <div v-if="open && results.length" class="card" style="position:absolute;left:0;right:0;top:100%;z-index:20;max-height:240px;overflow:auto;margin-top:2px">
      <div v-for="r in results" :key="r[idKey]" @mousedown.prevent="pick(r)" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)">
        <div style="font-weight:600">{{ r.last_name }}, {{ r.first_name }}</div>
        <div class="faint">{{ r.employee_no }} · {{ r.position || '' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { api, qs } from '../api';

const props = defineProps({
  modelValue: [Number, String, null],
  label: { type: String, default: '' },
  endpoint: { type: String, default: '/admin/employees/lookup' },
  idKey: { type: String, default: 'id' },
  placeholder: { type: String, default: 'Search name or employee no.' },
});
const emit = defineEmits(['update:modelValue', 'picked']);
const q = ref(props.label || '');
const results = ref([]);
const open = ref(false);
let t;

watch(() => props.label, (v) => { q.value = v || ''; });

function search() {
  clearTimeout(t);
  if (!q.value.trim()) { emit('update:modelValue', null); results.value = []; return; }
  t = setTimeout(async () => {
    results.value = await api.get(props.endpoint + qs({ q: q.value }));
    open.value = true;
  }, 200);
}
function pick(r) {
  q.value = `${r.last_name}, ${r.first_name}`;
  emit('update:modelValue', r[props.idKey]);
  emit('picked', r);
  open.value = false;
}
function close() { setTimeout(() => { open.value = false; }, 150); }
</script>
