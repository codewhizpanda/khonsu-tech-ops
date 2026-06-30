<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';

const store = useAppStore();
const { toast } = useToast();

const searchQ = ref('');
const showDrop = ref(false);

const productKey = computed(() => store.selectedProduct ? ik(store.selectedProduct) : null);

const availableUnits = computed(() => {
  if (!productKey.value) return [];
  const sel = new Set(store.selectedIMEIs.map(u => u.imei));
  return store.units.filter(u => u.productKey === productKey.value && u.status === 'available' && !sel.has(u.imei));
});

const filteredUnits = computed(() => {
  const q = searchQ.value.toLowerCase();
  const list = q
    ? availableUnits.value.filter(u => u.imei.toLowerCase().includes(q) || u.color.toLowerCase().includes(q))
    : availableUnits.value;
  return list.slice(0, 8);
});

function selectUnit(unit) {
  store.selectedIMEIs = [unit];
  searchQ.value = '';
  showDrop.value = false;
}

function removeUnit(i) {
  store.selectedIMEIs.splice(i, 1);
}

function onInput() {
  showDrop.value = searchQ.value.length > 0;
}

function onEnter() {
  const q = searchQ.value.trim();
  if (!q) return;
  const unit = availableUnits.value.find(u => u.imei === q)
    || availableUnits.value.find(u => u.imei.includes(q) || q.includes(u.imei));
  if (unit) {
    selectUnit(unit);
  } else if (store.units.find(u => u.imei === q && u.productKey === productKey.value && u.status === 'sold')) {
    toast('This unit has already been sold', 'error');
    searchQ.value = '';
  } else {
    toast('IMEI not found — receive this stock first', 'error');
    searchQ.value = '';
  }
}
</script>

<template>
  <div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">
      {{ availableUnits.length }} unit{{ availableUnits.length !== 1 ? 's' : '' }} available
    </div>

    <!-- Selected units -->
    <div v-if="store.selectedIMEIs.length" style="margin-bottom:10px;">
      <div
        v-for="(u, i) in store.selectedIMEIs"
        :key="u.imei"
        style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--accent-light);border-radius:8px;margin-bottom:6px;border:1.5px solid var(--accent);"
      >
        <div style="flex:1;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;">
            {{ u.imei }}<span v-if="u.isDummy" style="font-size:10px;color:var(--muted);font-weight:400;"> (placeholder)</span>
          </div>
          <div style="font-size:11px;color:var(--muted);">{{ u.color }}</div>
        </div>
        <span @click="removeUnit(i)" style="cursor:pointer;color:var(--muted);font-size:20px;line-height:1;padding:0 4px;">&times;</span>
      </div>
    </div>
    <div v-else style="font-size:12px;color:var(--muted);padding:4px 0;margin-bottom:8px;">No units selected yet.</div>

    <!-- Search input -->
    <div style="position:relative;">
      <input
        v-model="searchQ"
        type="text"
        placeholder="Scan or type IMEI…"
        class="form-control"
        style="font-family:'JetBrains Mono',monospace;font-size:13px;"
        @input="onInput"
        @keydown.enter.prevent="onEnter"
        @blur="setTimeout(() => showDrop = false, 200)"
      />
      <!-- Dropdown -->
      <div
        v-if="showDrop && filteredUnits.length"
        style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;z-index:50;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1);"
      >
        <div
          v-for="u in filteredUnits"
          :key="u.imei"
          style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;"
          @mousedown.prevent="selectUnit(u)"
        >
          <div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--accent);">{{ u.imei }}</div>
            <div style="font-size:11px;color:var(--muted);">{{ u.color }}{{ u.isDummy ? ' · placeholder' : '' }}</div>
          </div>
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--muted);flex-shrink:0;" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
  </div>
</template>
