<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import Scanner from '@/components/Scanner.vue';

const store = useAppStore();
const { toast } = useToast();

const scanQ = ref('');
const scannerOpen = ref(false);

const productKey = computed(() => store.selectedProduct ? ik(store.selectedProduct) : null);

// Units still pickable for this product — available, or already selected (so a
// chosen unit doesn't disappear from view once picked).
const allUnits = computed(() => {
  if (!productKey.value) return [];
  return store.units.filter(u =>
    u.productKey === productKey.value && (u.status === 'available' || isSelected(u))
  );
});

const selectedUnits = computed(() => store.selectedIMEIs);

// Showing every serial number for a product by default is unnecessary clutter
// for what's usually a 1-2 unit sale — the grid only appears once the staff
// has actually typed something or scanned a barcode.
const searchResults = computed(() => {
  const q = scanQ.value.trim().toLowerCase();
  if (!q) return [];
  return allUnits.value.filter(u => !isSelected(u) && u.imei.toLowerCase().includes(q));
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

function onScanDetected(val) {
  scanQ.value = val;
  scannerOpen.value = false;
  onScan();
}
</script>

<template>
  <div>
    <!-- Scan input -->
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <div class="sw" style="margin-bottom:0;flex:1;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-scan"/></svg></span>
        <input
          v-model="scanQ"
          type="text"
          placeholder="Scan or type IMEI to select…"
          style="font-family:'JetBrains Mono',monospace;font-size:13px;"
          @keydown.enter.prevent="onScan"
        />
      </div>
      <button class="btn btn-outline btn-sm" style="padding:0 12px;" title="Scan barcode" @click="scannerOpen = true">
        <svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-scan"/></svg>
      </button>
    </div>

    <!-- Selected units stay visible even once the search box is cleared -->
    <div v-if="selectedUnits.length" style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Selected ({{ selectedUnits.length }})</div>
      <div class="imei-grid">
        <div v-for="(u, i) in selectedUnits" :key="u.imei" class="imei-card sel" @click="toggleUnit(u)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:600;color:var(--muted);">Unit {{ i + 1 }}</span>
            <svg class="ic" style="width:14px;height:14px;color:var(--accent);flex-shrink:0;" aria-hidden="true"><use href="#ic-check"/></svg>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text);word-break:break-all;line-height:1.4;">
            {{ u.imei }}<span v-if="u.isDummy" style="font-weight:400;color:var(--muted);">*</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">{{ u.color }}</div>
        </div>
      </div>
    </div>

    <!-- Search results — only surfaced once the user has typed or scanned something -->
    <template v-if="scanQ.trim()">
      <div v-if="searchResults.length" class="imei-grid">
        <div
          v-for="(u, i) in searchResults"
          :key="u.imei"
          class="imei-card"
          @click="toggleUnit(u)"
        >
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:600;color:var(--muted);">Unit {{ i + 1 }}</span>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text);word-break:break-all;line-height:1.4;">
            {{ u.imei }}<span v-if="u.isDummy" style="font-weight:400;color:var(--muted);">*</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">{{ u.color }}</div>
        </div>
      </div>
      <div v-else style="padding:16px;text-align:center;color:var(--muted);font-size:13px;border:1.5px dashed var(--border);border-radius:8px;">
        No matching unit found.
      </div>
    </template>
    <div v-else-if="!selectedUnits.length" style="padding:24px;text-align:center;color:var(--muted);font-size:13px;border:1.5px dashed var(--border);border-radius:8px;">
      {{ allUnits.length ? 'Type an IMEI or scan a barcode to find a unit.' : 'No units available. Receive stock first.' }}
    </div>

    <Scanner :show="scannerOpen" @detected="onScanDetected" @close="scannerOpen = false" />
  </div>
</template>
