<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { useTimeLog } from '@/composables/useTimeLog.js';

const store  = useAppStore();
const router = useRouter();
const route  = useRoute();
const { toast } = useToast();

const isAdmin    = computed(() => store.currentUser === 'Admin');
const isStaff    = computed(() => !!store.currentUser && store.currentUser !== 'Admin');
const drawerOpen = ref(false);
const openIssueCount = computed(() => store.errorLogs.filter(e => e.status === 'open').length);

// Grouped in the order staff actually use them day to day: daily operations first,
// then (Admin-only) a quick read of how the business is doing, then catalog/stock
// management, then system-level configuration. Setup was merged into Settings
// (as its "Sync" tab) since both are admin configuration screens — one less nav item.
const sectionLabels = {
  ops:      'Daily Operations',
  insights: 'Insights',
  catalog:  'Catalog & Stock',
  system:   'System',
};

const navItems = computed(() => {
  const items = [
    { path: '/sales',         icon: 'ic-cart',         label: 'Log Sale',        section: 'ops' },
    { path: '/restock',       icon: 'ic-truck',        label: 'Receive Stock',   section: 'ops' },
    { path: '/payment-logs',  icon: 'ic-credit-card',  label: 'Payment Logs',    section: 'ops' },
  ];
  if (isAdmin.value) {
    items.push(
      { path: '/dashboard',  icon: 'ic-chart',     label: 'Dashboard',        section: 'insights' },
      { path: '/reports',    icon: 'ic-calendar',  label: 'Reports',          section: 'insights' },
      { path: '/time-log',   icon: 'ic-clock',     label: 'Time Log',         section: 'insights' },
      { path: '/inventory',  icon: 'ic-box',       label: 'Inventory',        section: 'catalog' },
      { path: '/masterlist', icon: 'ic-list',      label: 'Master List',     section: 'catalog' },
      { path: '/po',         icon: 'ic-clipboard', label: 'Purchase Orders', section: 'catalog' },
      { path: '/settings',   icon: 'ic-settings',  label: 'Settings',         section: 'system' },
      { path: '/issues',     icon: 'ic-alert',     label: 'Sync Issues',      section: 'system' },
    );
  }
  return items;
});

function go(path) {
  router.push(path);
  drawerOpen.value = false;
}

function isActive(path) { return route.path === path; }

function logout() {
  if (store.currentUser) useTimeLog().clockOut(store.currentUser);
  store.currentUser = null;
  localStorage.removeItem('kt_user');
  router.push('/sales');
  drawerOpen.value = false;
}

// Self-service PIN change for Sam/Joyce — Admin already has one in Settings.
const changePinModal = ref(false);
const cpCurrent = ref('');
const cpNew     = ref('');
const cpConfirm = ref('');
const cpStatus  = ref('');
const cpOk      = ref(false);
const cpBusy    = ref(false);

function openChangePin() {
  changePinModal.value = true;
  cpCurrent.value = ''; cpNew.value = ''; cpConfirm.value = '';
  cpStatus.value  = ''; cpOk.value  = false;
  drawerOpen.value = false;
}

function closeChangePin() {
  changePinModal.value = false;
}

async function submitChangePin() {
  cpOk.value = false;
  if (!cpCurrent.value || !cpNew.value || !cpConfirm.value) { cpStatus.value = 'All fields are required.'; return; }
  if (cpNew.value.length < 4) { cpStatus.value = 'New PIN must be at least 4 digits.'; return; }
  if (cpNew.value !== cpConfirm.value) { cpStatus.value = 'New PIN and confirmation do not match.'; return; }
  if (!store.scriptUrl) { cpStatus.value = 'Connect Google Sheets first to manage your PIN.'; return; }
  cpBusy.value = true;
  try {
    const res = await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setUserPin', user: store.currentUser, current: cpCurrent.value, next: cpNew.value }),
    });
    const data = await res.json();
    if (data.error) { cpStatus.value = data.error; return; }
    cpCurrent.value = ''; cpNew.value = ''; cpConfirm.value = '';
    cpOk.value = true;
    cpStatus.value = 'PIN updated successfully.';
    toast('PIN updated!', 'success');
  } catch {
    cpStatus.value = 'Could not reach server. Check your connection.';
  } finally {
    cpBusy.value = false;
  }
}
</script>

<template>
  <!-- Sticky top header -->
  <header style="background:var(--surface);border-bottom:1px solid var(--border);padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;position:sticky;top:0;z-index:100;">
    <div style="font-size:13px;font-weight:800;color:var(--accent);white-space:nowrap;letter-spacing:-.3px;">Khonsu Tech OPS</div>

    <!-- Desktop: user/switch -->
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <button v-if="isStaff" class="btn btn-outline btn-sm" style="font-size:12px;white-space:nowrap;padding:6px 8px;" title="Change PIN" @click="openChangePin">
        <svg class="ic" aria-hidden="true"><use href="#ic-key"/></svg>
      </button>
      <button class="btn btn-outline btn-sm nav-user-btn" style="font-size:12px;white-space:nowrap;" @click="logout">
        <svg class="ic" aria-hidden="true"><use href="#ic-user"/></svg>
        {{ store.currentUser }} — Switch
      </button>
    </div>

    <!-- Mobile: hamburger -->
    <button class="hamburger" @click="drawerOpen = true" aria-label="Open navigation">
      <svg style="width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-menu"/></svg>
    </button>
  </header>

  <!-- Desktop horizontal nav (hidden on mobile via CSS) -->
  <nav>
    <template v-for="(item, idx) in navItems" :key="item.path">
      <span v-if="idx > 0 && item.section !== navItems[idx - 1].section" class="nav-divider" aria-hidden="true"></span>
      <button
        class="tab"
        :class="{ active: isActive(item.path) }"
        @click="go(item.path)"
      >
        <svg class="ic" aria-hidden="true"><use :href="'#' + item.icon"/></svg>
        {{ item.label }}
        <span v-if="item.path === '/issues' && openIssueCount" style="background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:20px;padding:1px 6px;margin-left:4px;">{{ openIssueCount }}</span>
      </button>
    </template>
  </nav>

  <!-- Mobile drawer -->
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="drawerOpen" style="position:fixed;inset:0;z-index:300;" role="dialog" aria-modal="true" aria-label="Navigation">
        <!-- Backdrop -->
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.5);" @click="drawerOpen = false" />

        <!-- Panel -->
        <div class="drawer-panel">
          <!-- Drawer header -->
          <div style="padding:20px 20px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--accent);">Khonsu Tech OPS</div>
              <div style="font-size:12px;color:var(--muted);margin-top:3px;">
                Logged in as <strong style="color:var(--text);">{{ store.currentUser }}</strong>
              </div>
            </div>
            <button @click="drawerOpen = false" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:6px;border-radius:8px;display:flex;align-items:center;">
              <svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-x"/></svg>
            </button>
          </div>

          <!-- Nav items -->
          <div style="flex:1;padding:10px 10px;overflow-y:auto;">
            <template v-for="(item, idx) in navItems" :key="item.path">
              <div v-if="idx === 0 || item.section !== navItems[idx - 1].section" class="drawer-section-label">
                {{ sectionLabels[item.section] }}
              </div>
              <button
                class="drawer-item"
                :class="{ active: isActive(item.path) }"
                @click="go(item.path)"
              >
                <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use :href="'#' + item.icon"/></svg>
                {{ item.label }}
                <span v-if="item.path === '/issues' && openIssueCount" style="background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:20px;padding:1px 6px;margin-left:4px;">{{ openIssueCount }}</span>
              </button>
            </template>
          </div>

          <!-- Footer -->
          <div style="padding:16px;border-top:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;gap:8px;">
            <button v-if="isStaff" class="btn btn-outline btn-lg" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" @click="openChangePin">
              <svg class="ic" aria-hidden="true"><use href="#ic-key"/></svg>
              Change PIN
            </button>
            <button class="btn btn-outline btn-lg" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" @click="logout">
              <svg class="ic" aria-hidden="true"><use href="#ic-user"/></svg>
              Switch User
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Change PIN modal -->
  <Teleport to="body">
    <div v-if="changePinModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;padding:24px;" @click.self="closeChangePin">
      <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:360px;">
        <h3 style="font-size:16px;font-weight:800;margin:0 0 16px;">Change PIN</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">Current PIN</label>
            <input v-model="cpCurrent" type="password" placeholder="Current PIN" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">New PIN</label>
            <input v-model="cpNew" type="password" placeholder="New PIN (min. 4 digits)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block;">Confirm New PIN</label>
            <input v-model="cpConfirm" type="password" placeholder="Repeat new PIN" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;" />
          </div>
          <p v-if="cpStatus" :style="{ color: cpOk ? 'var(--green)' : 'var(--red)', fontSize: '13px', margin: 0 }">{{ cpStatus }}</p>
          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-outline" @click="closeChangePin">Cancel</button>
            <button class="btn btn-primary" :disabled="cpBusy" @click="submitChangePin">{{ cpBusy ? 'Saving…' : 'Update PIN' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
