<script setup>
import { useToast } from '@/composables/useToast.js';
const { msg, type, visible } = useToast();
</script>

<template>
  <div class="toast" :class="[type, { show: visible }]">{{ msg }}</div>
</template>
