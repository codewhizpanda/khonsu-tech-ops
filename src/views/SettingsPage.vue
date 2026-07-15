<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/state.js';
import { ik, vl } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush, pullFromSheets } from '@/composables/useSync.js';
import SetupPage from '@/views/SetupPage.vue';

const store  = useAppStore();
const route  = useRoute();
const router = useRouter();
const { toast } = useToast();

// Setup (Google Sheets sync) was merged in as a tab here, since it's the same
// "admin configures how the app behaves" concern as the settings below —
// one less item in the nav for something staff never touch anyway.
const validTabs = ['general', 'sync', 'viber'];
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'general');
function selectTab(tab) {
  activeTab.value = tab;
  router.replace({ path: '/settings', query: tab === 'general' ? {} : { tab } });
}

// Viber supplier updates: an LLM chat session can't reach script.google.com
// directly (outbound domain restrictions in that kind of sandboxed tool
// environment), but this page — running as a normal browser page, same as
// the rest of the app — can. So the round trip is: fetch+copy the live list
// here, paste it plus the Viber message into the chat, paste its merged
// answer back here, push. See docs/ARCHITECTURE.md §10.7 for the endpoint.
const viberFetchedJson  = ref('');
const viberFetchStatus  = ref('');
const viberFetchOk      = ref(false);
const viberFetching     = ref(false);
const viberPushJson     = ref('');
const viberPushStatus   = ref('');
const viberPushOk       = ref(false);
const viberPushing      = ref(false);

async function fetchCurrentMasterList() {
  if (!store.scriptUrl) { toast('Connect Google Sheets first (Sync tab)', 'error'); return; }
  viberFetching.value = true;
  viberFetchStatus.value = 'Fetching current Master List…';
  try {
    const res  = await fetch(store.scriptUrl + '?action=getMasterList');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const rows = (data.rows || []).map(r => ({
      key:       r.key || '',
      category:  r.category || '',
      model:     r.model || '',
      ram:       r.ram || '',
      storage:   r.storage || '',
      colors:    r.colors || '',
      unitPrice: Number(r['unit price']) || 0,
      srp:       Number(r.srp) || 0,
      status:    r.status || 'Active',
    }));
    viberFetchedJson.value = JSON.stringify(rows, null, 2);
    viberFetchOk.value = true;
    viberFetchStatus.value = `Fetched ${rows.length} item(s) — copy below and paste into your Claude chat along with the Viber update.`;
  } catch (err) {
    viberFetchOk.value = false;
    viberFetchStatus.value = 'Fetch failed: ' + (err.message || 'could not reach the script URL.');
  } finally {
    viberFetching.value = false;
  }
}

async function copyFetchedMasterList() {
  try {
    await navigator.clipboard.writeText(viberFetchedJson.value);
    toast('Copied to clipboard!', 'success');
  } catch {
    toast('Could not copy automatically — select the text and copy manually.', 'error');
  }
}

async function pushViberUpdate() {
  if (!store.scriptUrl) { toast('Connect Google Sheets first (Sync tab)', 'error'); return; }
  let rows;
  try {
    rows = JSON.parse(viberPushJson.value);
    if (!Array.isArray(rows)) throw new Error('Expected a JSON array of items.');
  } catch (err) {
    viberPushOk.value = false;
    viberPushStatus.value = 'Could not parse JSON: ' + err.message;
    return;
  }
  if (!confirm(`This replaces the entire Master List with ${rows.length} item(s). Continue?`)) return;

  viberPushing.value = true;
  viberPushStatus.value = 'Pushing to Google Sheets…';
  try {
    const res = await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'updateMasterList', rows }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    viberPushStatus.value = `Pushed ${data.count} item(s). Pulling latest into this device…`;
    await pullFromSheets();
    viberPushOk.value = true;
    viberPushStatus.value = `Done! Master List updated (${data.count} item(s)) and synced to this device.`;
    toast('Master List updated from Viber data!', 'success');
    viberPushJson.value = '';
    viberFetchedJson.value = '';
  } catch (err) {
    viberPushOk.value = false;
    viberPushStatus.value = 'Push failed: ' + (err.message || 'could not reach the script URL.');
    toast('Push failed — check your connection', 'error');
  } finally {
    viberPushing.value = false;
  }
}

// Local settings form (don't mutate store directly until save)
const target        = ref(store.settings.dailyTarget);
const lowStock      = ref(store.settings.lowStockThreshold);
const globalReo     = ref(store.settings.globalReorder);
const pasaCapEnabled = ref(store.settings.pasaCapEnabled !== false);

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
  store.settings.pasaCapEnabled   = !!pasaCapEnabled.value;

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
      PasaCapEnabled:    store.settings.pasaCapEnabled,
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

// Staff PIN reset — Admin doesn't need to know a staff member's current PIN,
// just resets it back to the shared default so they can set a new one themselves.
const resettingStaff = ref('');
async function resetStaffPin(user) {
  if (!store.scriptUrl) { toast('Connect Google Sheets first (Sync tab)', 'error'); return; }
  if (!confirm(`Reset ${user}'s PIN to the default (1234)?`)) return;
  resettingStaff.value = user;
  try {
    const res = await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'resetStaffPin', user }),
    });
    const data = await res.json();
    if (data.error) { toast(data.error, 'error'); return; }
    toast(user + "'s PIN reset to default", 'success');
  } catch {
    toast('Could not reach server. Check your connection.', 'error');
  } finally {
    resettingStaff.value = '';
  }
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Settings</h2>
      <button v-if="activeTab === 'general'" class="btn btn-primary" @click="saveSettings">Save Settings</button>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1.5px solid var(--border);">
      <button
        class="tab" :class="{ active: activeTab === 'general' }"
        style="border-radius:8px 8px 0 0;"
        @click="selectTab('general')"
      >General</button>
      <button
        class="tab" :class="{ active: activeTab === 'sync' }"
        style="border-radius:8px 8px 0 0;"
        @click="selectTab('sync')"
      >
        <svg class="ic" aria-hidden="true"><use href="#ic-zap"/></svg>
        Google Sheets Sync
      </button>
      <button
        class="tab" :class="{ active: activeTab === 'viber' }"
        style="border-radius:8px 8px 0 0;"
        @click="selectTab('viber')"
      >
        <svg class="ic" aria-hidden="true"><use href="#ic-phone"/></svg>
        Viber Update
      </button>
    </div>

    <template v-if="activeTab === 'general'">
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

      <!-- Pasa amount cap -->
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;">Pasa Amount Cap</h3>
        <p style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.7;">
          When enabled, the Pasa markup a staff member can add on top of SRP is capped at the item's own net sales amount
          (SRP − Unit Price) — so a promoter's commission can never exceed what ITEL earns on the sale. Turn this off to
          allow staff to enter any Pasa amount.
        </p>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;font-weight:600;">
          <input v-model="pasaCapEnabled" type="checkbox" style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer;" />
          Limit Pasa amount to the item's net sales amount
        </label>
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

      <!-- Staff PIN reset -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">Staff PINs</h3>
        <p style="font-size:12px;color:var(--muted);margin:0 0 16px;line-height:1.6;">
          Sam and Joyce each set their own PIN by logging in and using "Change PIN" — if either forgets it, reset it back to the default (<strong>1234</strong>) here so they can log in and set a new one.
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;max-width:360px;">
          <div v-for="name in ['Sam', 'Joyce']" :key="name" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;">
            <span style="font-size:14px;font-weight:600;">{{ name }}</span>
            <button class="btn btn-outline btn-sm" :disabled="resettingStaff === name" @click="resetStaffPin(name)">
              {{ resettingStaff === name ? 'Resetting…' : 'Reset to Default PIN' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="activeTab === 'viber'">
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;">1. Copy Current Master List</h3>
        <p style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.7;">
          Fetch the live Master List, then paste it into your Claude chat along with the new supplier Viber message so it
          can merge in price/stock changes against the real current catalog — never let it guess from memory.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn btn-outline btn-sm" @click="fetchCurrentMasterList" :disabled="viberFetching">
            {{ viberFetching ? 'Fetching…' : 'Fetch Current List' }}
          </button>
          <button v-if="viberFetchedJson" class="btn btn-outline btn-sm" @click="copyFetchedMasterList">
            <svg class="ic" aria-hidden="true"><use href="#ic-clipboard"/></svg>
            Copy to Clipboard
          </button>
        </div>
        <p v-if="viberFetchStatus" :style="{ color: viberFetchOk ? 'var(--green)' : 'var(--red)', fontSize: '13px', margin: '0 0 10px' }">{{ viberFetchStatus }}</p>
        <textarea
          v-if="viberFetchedJson"
          v-model="viberFetchedJson"
          readonly rows="8"
          style="width:100%;font-family:monospace;font-size:11px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);box-sizing:border-box;"
        ></textarea>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;">2. Push Updated Master List</h3>
        <p style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.7;">
          Paste the <strong>complete</strong> updated item list your Claude chat gives you back — this replaces the whole
          Master List tab, so a partial list would delete anything left out. Then push it to Google Sheets.
        </p>
        <textarea
          v-model="viberPushJson"
          rows="8"
          placeholder='[{"key":"...","category":"...","model":"...","ram":"","storage":"","colors":"...","unitPrice":0,"srp":0,"status":"Active"}, ...]'
          style="width:100%;font-family:monospace;font-size:11px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);box-sizing:border-box;margin-bottom:12px;"
        ></textarea>
        <button class="btn btn-primary" @click="pushViberUpdate" :disabled="viberPushing || !viberPushJson.trim()">
          {{ viberPushing ? 'Pushing…' : 'Push to Sheet' }}
        </button>
        <p v-if="viberPushStatus" :style="{ color: viberPushOk ? 'var(--green)' : 'var(--red)', fontSize: '13px', margin: '10px 0 0' }">{{ viberPushStatus }}</p>
      </div>
    </template>

    <SetupPage v-else-if="activeTab === 'sync'" />
  </div>
</template>
