<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';

const store = useAppStore();
const { toast } = useToast();

const scanQ = ref('');

const productKey = computed(() => store.selectedProduct ? ik(store.selectedProduct) : null);

const allUnits = computed(() => {
  if (!productKey.value) return [];
  return store.units.filter(u =>
    u.productKey === productKey.value && (u.status === 'available' || isSelected(u))
  );
});

function isSelected(unit) {
  return store.selectedIMEIs.some(u => u.imei === unit.imei);
}

function toggleUnit(unit) {
  const idx = store.selectedIMEIs.findIndex(u => u.imei === unit.imei);
  if (idx >= 0) {
    store.selectedIMEIs.splice(idx, 1);
  } else {
    store.selectedIMEIs.push(unit);
  }
}

function onScan() {
  const q = scanQ.value.trim();
  if (!q) return;
  const unit = allUnits.value.find(u => u.imei === q)
    || allUnits.value.find(u => u.imei.includes(q) || q.includes(u.imei));
  if (unit) {
    toggleUnit(unit);
    scanQ.value = '';
  } else if (store.units.find(u => u.imei === q && u.productKey === productKey.value && u.status === 'sold')) {
    toast('This unit has already been sold', 'error');
    scanQ.value = '';
  } else {
    toast('IMEI not found — receive this stock first', 'error');
    scanQ.value = '';
  }
}
</script>

<template>
  <div>
    <!-- Scan input -->
    <div class="sw" style="margin-bottom:10px;">
      <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-scan"/></svg></span>
      <input
        v-model="scanQ"
        type="text"
        placeholder="Scan or type IMEI to select…"
        style="font-family:'JetBrains Mono',monospace;font-size:13px;"
        @keydown.enter.prevent="onScan"
      />
    </div>

    <!-- Unit grid -->
    <div v-if="allUnits.length" class="imei-grid">
      <div
        v-for="(u, i) in allUnits"
        :key="u.imei"
        :class="['imei-card', isSelected(u) && 'sel']"
        @click="toggleUnit(u)"
      >
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:600;color:var(--muted);">Unit {{ i + 1 }}</span>
          <svg v-if="isSelected(u)" class="ic" style="width:14px;height:14px;color:var(--accent);flex-shrink:0;" aria-hidden="true"><use href="#ic-check"/></svg>
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text);word-break:break-all;line-height:1.4;">
          {{ u.imei }}<span v-if="u.isDummy" style="font-weight:400;color:var(--muted);">*</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">{{ u.color }}</div>
      </div>
    </div>
    <div v-else style="padding:24px;text-align:center;color:var(--muted);font-size:13px;border:1.5px dashed var(--border);border-radius:8px;margin-top:10px;">
      No units available. Receive stock first.
    </div>
  </div>
</template>
