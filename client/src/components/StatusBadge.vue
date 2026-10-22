<template>
  <span class="badge" :class="status">{{ STATUS_LABEL[status] || status }}</span>
  <span v-if="lwop && status === 'APPROVED'" class="badge lwop" style="margin-left:4px">LWOP</span>
</template>

<script setup>
import { STATUS_LABEL } from '../format';
defineProps({ status: String, lwop: [Boolean, Number] });
</script>
