<script setup>
import { ref, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush } from '@/composables/useSync.js';

const store = useAppStore();
const { toast } = useToast();

// Local settings form (don't mutate store directly until save)
const target     = ref(store.settings.dailyTarget);
const lowStock   = ref(store.settings.lowStockThreshold);
const globalReo  = ref(store.settings.globalReorder);

// Per-product reorder overrides (keyed by productKey)
const reorderMap = ref({});

onMounted(() => {
  store.masterList.forEach(p => {
    const key = ik(p);
    reorderMap.value[key] = (store.inventory[key] || {}).reorder ?? store.settings.globalReorder;
  });
});

function applyGlobal() {
  const g = parseInt(globalReo.value) || 1;
  store.masterList.forEach(p => {
    const key = ik(p);
    if (store.inventory[key]) store.inventory[key].reorder = g;
    reorderMap.value[key] = g;
  });
  store.saveInv();
  toast('Global reorder point applied to all items', 'success');
}

function saveSettings() {
  store.settings.dailyTarget      = parseInt(target.value)   || 3000;
  store.settings.lowStockThreshold= parseInt(lowStock.value) || 2;
  store.settings.globalReorder    = parseInt(globalReo.value)|| 1;

  // Apply per-product reorder edits to inventory
  Object.entries(reorderMap.value).forEach(([key, val]) => {
    if (store.inventory[key]) store.inventory[key].reorder = parseInt(val) || 1;
  });

  store.saveSettings();
  store.saveInv();

  tryPush('saveSettings', {
    settings: {
      DailyTarget:       store.settings.dailyTarget,
      LowStockThreshold: store.settings.lowStockThreshold,
      GlobalReorder:     store.settings.globalReorder,
    },
  });
  toast('Settings saved!', 'success');
}

// Admin PIN change
const pinCurrent = ref('');
const pinNew     = ref('');
const pinConfirm = ref('');
const pinStatus  = ref('');
const pinStatusOk= ref(false);

async function changePin() {
  pinStatusOk.value = false;
  if (!pinCurrent.value || !pinNew.value || !pinConfirm.value) {
    pinStatus.value = 'All fields are required.'; return;
  }
  if (pinNew.value.length < 4) {
    pinStatus.value = 'New PIN must be at least 4 digits.'; return;
  }
  if (pinNew.value !== pinConfirm.value) {
    pinStatus.value = 'New PIN and confirmation do not match.'; return;
  }
  if (!store.scriptUrl) {
    pinStatus.value = 'Connect Google Sheets first (Setup tab) to manage the Admin PIN.'; return;
  }
  try {
    const res = await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setPin', current: pinCurrent.value, next: pinNew.value }),
    });
    const data = await res.json();
    if (data.error) { pinStatus.value = data.error; return; }
    pinCurrent.value = ''; pinNew.value = ''; pinConfirm.value = '';
    pinStatusOk.value = true;
    pinStatus.value = 'PIN updated successfully.';
    toast('Admin PIN updated!', 'success');
  } catch {
    pinStatus.value = 'Could not reach server. Check your connection.';
  }
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Settings</h2>
      <button class="btn btn-primary" @click="saveSettings">Save Settings</button>
    </div>

    <!-- Global settings -->
    <div class="card" style="margin-bottom:20px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Sales Targets</h3>
      <div class="g3" style="gap:16px;">
        <div>
          <label class="form-label">Daily Target (₱)</label>
          <input v-model.number="target" type="number" min="0" class="form-control" />
        </div>
        <div>
          <label class="form-label">Low Stock Alert (units)</label>
          <input v-model.number="lowStock" type="number" min="0" class="form-control" />
        </div>
        <div>
          <label class="form-label">Default Reorder Point</label>
          <div style="display:flex;gap:8px;">
            <input v-model.number="globalReo" type="number" min="0" class="form-control" />
            <button class="btn btn-outline btn-sm" style="white-space:nowrap;" @click="applyGlobal">Apply to All</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Per-product reorder table -->
    <div class="card" style="margin-bottom:20px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:14px;">Per-Product Reorder Points</h3>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--accent);color:#fff;">
              <th style="padding:9px 12px;text-align:left;">Product</th>
              <th style="padding:9px 12px;text-align:left;">Variant</th>
              <th style="padding:9px 12px;text-align:right;">Stock</th>
              <th style="padding:9px 12px;text-align:right;">Reorder At</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in store.masterList"
              :key="ik(p)"
              style="border-bottom:1px solid var(--border);"
            >
              <td style="padding:8px 12px;font-weight:600;">{{ p.name }}</td>
              <td style="padding:8px 12px;color:var(--muted);font-size:12px;">{{ vl(p) || '—' }}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;">{{ (store.inventory[ik(p)] || {}).stock ?? 0 }}</td>
              <td style="padding:8px 12px;text-align:right;">
                <input
                  v-model.number="reorderMap[ik(p)]"
                  type="number"
                  min="0"
                  style="width:70px;padding:5px 8px;font-size:12px;border:1.5px solid var(--border);border-radius:6px;text-align:right;background:var(--bg);outline:none;"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Admin PIN change -->
    <div class="card">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Change Admin PIN</h3>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:360px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">Current PIN</label>
          <input v-model="pinCurrent" type="password" placeholder="Current PIN" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">New PIN</label>
          <input v-model="pinNew" type="password" placeholder="New PIN (min. 4 digits)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">Confirm New PIN</label>
          <input v-model="pinConfirm" type="password" placeholder="Repeat new PIN" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
        </div>
        <p v-if="pinStatus" :style="{ color: pinStatusOk ? 'var(--green)' : 'var(--red)', fontSize: '13px', margin: 0 }">{{ pinStatus }}</p>
        <button class="btn btn-primary" style="align-self:flex-start;" @click="changePin">Update PIN</button>
      </div>
    </div>
  </div>
</template>
