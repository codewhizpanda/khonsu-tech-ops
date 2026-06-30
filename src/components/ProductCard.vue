<script setup>
import { computed } from 'vue';
import { vl, fmt } from '@/utils.js';

const props = defineProps({
  product: { type: Object, required: true },
  inv:     { type: Object, default: () => ({ stock: 0, reorder: 1 }) },
  lowThreshold: { type: Number, default: 2 },
});

const isOut = computed(() => props.inv.stock <= 0);
const isLow = computed(() => !isOut.value && props.inv.stock <= props.lowThreshold);
const stockClass = computed(() => isOut.value ? 'sout' : isLow.value ? 'slow' : 'sok');
const stockLabel = computed(() =>
  isOut.value ? 'OUT' : isLow.value ? 'LOW:' + props.inv.stock : props.inv.stock + ' left'
);
</script>

<template>
  <div :class="['pc', isOut && 'oos']">
    <div :class="['sb', stockClass]">{{ stockLabel }}</div>
    <div class="cl">{{ product.category }}</div>
    <div class="pn">{{ product.name }}</div>
    <div class="pv">{{ vl(product) || '—' }}</div>
    <div class="pp">{{ fmt(product.srp) }}</div>
  </div>
</template>
