<template>
  <div class="modal-back" @mousedown.self="$emit('close')">
    <div class="modal" :class="{ wide }" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>{{ title }}</h2>
        <button class="btn link" aria-label="Close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body"><slot /></div>
      <div v-if="$slots.foot" class="modal-foot"><slot name="foot" /></div>
    </div>
  </div>
</template>

<script setup>
defineProps({ title: String, wide: Boolean });
defineEmits(['close']);
</script>
