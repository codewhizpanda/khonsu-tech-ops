<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { fmt } from '@/utils.js';
import { usePaymentLogs, BISEN_METHODS, ITEL_METHODS } from '@/composables/usePaymentLogs.js';

const store   = useAppStore();
const isAdmin = computed(() => store.currentUser === 'Admin');
const { addBisenLog, editLog, markCredited, revertPending, settlePayment, revertToCredited, removeLog, pullPaymentLogs, pushAllPaymentLogs } = usePaymentLogs();

onMounted(() => { pullPaymentLogs(); });

const pushing = ref(false);
async function handlePushAll() {
  pushing.value = true;
  await pushAllPaymentLogs();
  pushing.value = false;
}

const searchQ       = ref('');
const filterStore   = ref('All');
const filterStatus  = ref('All');
const filterOpen    = ref(false);
const storeOptions  = ['All', 'ITEL', 'Bisen'];
const statusOptions = ['All', 'Pending', 'Credited', 'Settled'];

const filteredLogs = computed(() => {
  const q = searchQ.value.toLowerCase();
  return store.paymentLogs.filter(l => {
    const matchSearch = !q ||
      (l.reference || '').toLowerCase().includes(q) ||
      (l.soNumber || '').toLowerCase().includes(q) ||
      (l.method || '').toLowerCase().includes(q) ||
      (l.staff || '').toLowerCase().includes(q) ||
      (l.notes || '').toLowerCase().includes(q);
    const matchStore  = filterStore.value === 'All' || l.store === filterStore.value;
    const matchStatus = filterStatus.value === 'All' || l.status === filterStatus.value.toLowerCase();
    return matchSearch && matchStore && matchStatus;
  });
});

// Pagination — this log only grows over time, so a plain table + page size
// keeps the DOM small instead of rendering every entry ever logged.
const pageSizeOptions = [10, 25, 50, 100];
const pageSize    = ref(10);
const currentPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / pageSize.value)));

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredLogs.value.slice(start, start + pageSize.value);
});

// Any change to what's being shown should snap back to page 1, otherwise a
// user can land on an empty page (e.g. viewing page 4 of "All", then
// filtering down to a shorter list that only has 1 page).
watch([searchQ, filterStore, filterStatus, pageSize], () => { currentPage.value = 1; });

const totals = computed(() => {
  const pending  = store.paymentLogs.filter(l => l.status === 'pending');
  const credited = store.paymentLogs.filter(l => l.status === 'credited');
  return {
    pendingCount:  pending.length,
    pendingSum:    pending.reduce((s, l) => s + l.amount, 0),
    creditedSum:   credited.reduce((s, l) => s + l.amount, 0),
  };
});

// Accounts Receivable (ITEL) — non-cash sale proceeds owed to ITEL until credited.
// Accounts Payable (Bisen) — Maya terminal proceeds ITEL is holding for Bisen until settled.
// Bisen entries move pending -> credited (Admin confirms the funds really landed) ->
// settled (Admin has actually paid Bisen out) — AP only drops once truly settled;
// "credited" alone still counts as outstanding/owed.
const arAp = computed(() => {
  const itel  = store.paymentLogs.filter(l => l.store === 'ITEL');
  const bisen = store.paymentLogs.filter(l => l.store === 'Bisen');
  return {
    arPending:     itel.filter(l => l.status === 'pending').reduce((s, l) => s + l.amount, 0),
    arReceived:    itel.filter(l => l.status === 'credited').reduce((s, l) => s + l.amount, 0),
    apOutstanding: bisen.filter(l => l.status !== 'settled').reduce((s, l) => s + l.amount, 0),
    apSettled:     bisen.filter(l => l.status === 'settled').reduce((s, l) => s + l.amount, 0),
  };
});

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

// Status options available in the row dropdown: ITEL only ever needs
// pending/credited; Bisen adds the settled step. The dropdown can set any of
// these directly (each branch below reuses the same guarded composable
// functions the old per-transition buttons called), so an invalid jump (e.g.
// straight to Settled from Pending) is still rejected by settlePayment()'s
// own check — the <select> will simply snap back to the real status on the
// next render since it's bound via :value, not v-model.
function statusOptionsFor(log) {
  return log.store === 'Bisen' ? ['pending', 'credited', 'settled'] : ['pending', 'credited'];
}

function onStatusChange(log, target) {
  if (!target || target === log.status) return;
  if (target === 'pending') revertPending(log.id);
  else if (target === 'credited') {
    if (log.status === 'pending') markCredited(log.id);
    else if (log.status === 'settled') revertToCredited(log.id);
  } else if (target === 'settled') settlePayment(log.id);
}

// One-click "undo" for the common case — steps back exactly one stage
// (settled -> credited, credited -> pending) without opening the dropdown.
function revertOneStep(log) {
  if (log.status === 'settled') revertToCredited(log.id);
  else if (log.status === 'credited') revertPending(log.id);
}

// Add Bisen Maya terminal entry
const addModal  = ref(false);
const newMethod = ref(BISEN_METHODS[0]);
const newAmount = ref(null);
const newRef    = ref('');
const newNotes  = ref('');

function openAdd() {
  newMethod.value = BISEN_METHODS[0];
  newAmount.value = null;
  newRef.value    = '';
  newNotes.value  = '';
  addModal.value  = true;
}

function submitAdd() {
  const ok = addBisenLog({ method: newMethod.value, amount: newAmount.value, reference: newRef.value.trim(), notes: newNotes.value.trim() });
  if (ok) addModal.value = false;
}

function confirmRemove(log) {
  if (confirm('Delete this payment log entry?')) removeLog(log.id);
}

// Edit an existing entry (auto or manual)
const editModal     = ref(false);
const editId        = ref(null);
const editStoreVal  = ref('ITEL');
const editMethodVal = ref('');
const editAmountVal = ref(null);
const editRefVal    = ref('');
const editNotesVal  = ref('');

const editMethodOptions = computed(() => editStoreVal.value === 'Bisen' ? BISEN_METHODS : ITEL_METHODS);

watch(editStoreVal, () => {
  if (!editMethodOptions.value.includes(editMethodVal.value)) editMethodVal.value = editMethodOptions.value[0];
});

function openEdit(log) {
  editId.value        = log.id;
  editStoreVal.value  = log.store;
  editMethodVal.value = log.method;
  editAmountVal.value = log.amount;
  editRefVal.value    = log.reference || '';
  editNotesVal.value  = log.notes || '';
  editModal.value     = true;
}

function submitEdit() {
  const ok = editLog(editId.value, {
    storeName: editStoreVal.value,
    method: editMethodVal.value,
    amount: editAmountVal.value,
    reference: editRefVal.value.trim(),
    notes: editNotesVal.value.trim(),
  });
  if (ok) editModal.value = false;
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Payment Logs</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button v-if="isAdmin" class="btn btn-outline btn-sm" :disabled="pushing" style="display:inline-flex;align-items:center;gap:5px;" @click="handlePushAll" title="Force-overwrite the Payment Logs sheet with everything stored locally — use this if entries never made it to Sheets">
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-upload"/></svg>
          {{ pushing ? 'Pushing…' : 'Push All to Sheets' }}
        </button>
        <button class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:5px;" @click="openAdd">
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-plus"/></svg>
          Log Bisen Maya Payment
        </button>
      </div>
    </div>

    <p style="font-size:13px;color:var(--muted);margin:-8px 0 16px;line-height:1.6;">
      ITEL's non-cash sales (Card / Home Credit) are logged here automatically when a sale is confirmed.
      Use the button above to log Bisen's Maya terminal transactions (Card / QRPh) by hand.
    </p>

    <!-- Accounts Receivable (ITEL) is Admin-only; Accounts Payable (Bisen) is visible to
         all staff so they can track what's still owed to Bisen vs. already paid out. -->
    <div :class="isAdmin ? 'g2' : ''" style="margin-bottom:16px;">
      <div v-if="isAdmin" class="sc" style="border-left:4px solid var(--accent);">
        <div class="sl">Accounts Receivable — ITEL</div>
        <div class="sv">{{ fmt(arAp.arPending) }}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">Received to date: <strong style="color:var(--green);">{{ fmt(arAp.arReceived) }}</strong></div>
      </div>
      <div class="sc" style="border-left:4px solid #7e22ce;">
        <div class="sl">Accounts Payable — Bisen</div>
        <div class="sv" style="color:#7e22ce;">{{ fmt(arAp.apOutstanding) }}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">Still owed to Bisen · Settled to date: <strong style="color:var(--green);">{{ fmt(arAp.apSettled) }}</strong></div>
      </div>
    </div>

    <!-- Summary cards -->
    <div class="g3" style="margin-bottom:16px;">
      <div class="sc">
        <div class="sl">Pending</div>
        <div class="sv" style="color:var(--yellow);">{{ totals.pendingCount }}</div>
      </div>
      <div class="sc">
        <div class="sl">Pending Amount</div>
        <div class="sv">{{ fmt(totals.pendingSum) }}</div>
      </div>
      <div class="sc">
        <div class="sl">Credited Amount</div>
        <div class="sv" style="color:var(--green);">{{ fmt(totals.creditedSum) }}</div>
      </div>
    </div>

    <!-- Search + Filter -->
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
      <div class="sw" style="margin-bottom:0;flex:1;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
        <input v-model="searchQ" type="text" placeholder="Search SO number, reference, method, staff…" />
      </div>
      <button @click="filterOpen = true"
        style="flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;color:var(--text);"
        title="Filter">
        <svg class="ic" aria-hidden="true"><use href="#ic-filter"/></svg>
      </button>
    </div>
    <div v-if="filterStore !== 'All' || filterStatus !== 'All'" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <span style="font-size:12px;color:var(--muted);">Showing:</span>
      <span v-if="filterStore !== 'All'" style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ filterStore }}</span>
      <span v-if="filterStatus !== 'All'" style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ filterStatus }}</span>
      <button @click="filterStore = 'All'; filterStatus = 'All'" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;">✕ Clear</button>
    </div>

    <Teleport to="body">
      <div v-if="filterOpen" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;" @click.self="filterOpen = false">
        <div style="background:var(--surface);border-radius:20px;width:100%;max-width:480px;padding:20px;max-height:calc(100vh - 32px);overflow-y:auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <span style="font-size:15px;font-weight:700;">Filter</span>
            <button @click="filterOpen = false" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1;">&times;</button>
          </div>
          <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Store</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;">
            <button v-for="f in storeOptions" :key="f" @click="filterStore = f"
              style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-family:inherit;text-align:left;"
              :style="filterStore === f ? 'background:var(--accent);color:#fff;font-weight:600;' : 'background:var(--surface2);color:var(--text);'">
              {{ f }}
              <svg v-if="filterStore === f" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
            </button>
          </div>
          <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Status</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button v-for="f in statusOptions" :key="f" @click="filterStatus = f; filterOpen = false"
              style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-family:inherit;text-align:left;"
              :style="filterStatus === f ? 'background:var(--accent);color:#fff;font-weight:600;' : 'background:var(--surface2);color:var(--text);'">
              {{ f }}
              <svg v-if="filterStatus === f" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="!filteredLogs.length" style="text-align:center;padding:60px;color:var(--muted);">
      {{ store.paymentLogs.length ? 'No results match your filter.' : 'No payment logs yet.' }}
    </div>

    <div v-else style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--accent);color:#fff;">
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Date</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Store / Method</th>
              <th style="padding:10px 12px;text-align:right;white-space:nowrap;">Amount</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">SO Number</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Reference</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Staff</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Status</th>
              <th style="padding:10px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in paginatedLogs" :key="log.id" style="border-bottom:1px solid var(--border);">
              <td style="padding:9px 12px;white-space:nowrap;color:var(--muted);">{{ fmtDate(log.date) }}</td>
              <td style="padding:9px 12px;white-space:nowrap;">
                <span
                  style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-right:6px;"
                  :style="log.store === 'ITEL' ? 'background:var(--accent-light);color:var(--accent);' : 'background:#f3e8ff;color:#7e22ce;'"
                >{{ log.store }}</span>
                <span style="font-weight:600;">{{ log.method }}</span>
                <span v-if="log.origin === 'auto'" style="font-size:11px;color:var(--muted);"> (auto)</span>
              </td>
              <td style="padding:9px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;white-space:nowrap;">{{ fmt(log.amount) }}</td>
              <td style="padding:9px 12px;white-space:nowrap;font-family:'JetBrains Mono',monospace;">{{ log.soNumber || '—' }}</td>
              <td style="padding:9px 12px;">
                {{ log.reference || '—' }}
                <div v-if="log.notes" style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">{{ log.notes }}</div>
              </td>
              <td style="padding:9px 12px;white-space:nowrap;">{{ log.staff }}</td>
              <td style="padding:9px 12px;white-space:nowrap;">
                <!-- Admin: status is a plain editable dropdown. Everyone else: read-only badge. -->
                <select
                  v-if="isAdmin"
                  :value="log.status"
                  @change="onStatusChange(log, $event.target.value)"
                  :title="log.status === 'settled'
                    ? 'Credited ' + fmtDate(log.creditedDate) + ' by ' + log.creditedBy + ' · Settled to Bisen ' + fmtDate(log.settledDate) + ' by ' + log.settledBy
                    : log.status === 'credited' ? 'Credited ' + fmtDate(log.creditedDate) + ' by ' + log.creditedBy : ''"
                  :style="{
                    background: log.status === 'settled' ? '#dcfce7' : log.status === 'credited' ? '#dbeafe' : '#fef3c7',
                    color: log.status === 'settled' ? '#16a34a' : log.status === 'credited' ? '#2563eb' : '#d97706',
                  }"
                  style="border:none;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;"
                >
                  <option v-for="s in statusOptionsFor(log)" :key="s" :value="s">{{ s.charAt(0).toUpperCase() + s.slice(1) }}</option>
                </select>
                <span
                  v-else
                  :style="{
                    background: log.status === 'settled' ? '#dcfce7' : log.status === 'credited' ? '#dbeafe' : '#fef3c7',
                    color: log.status === 'settled' ? '#16a34a' : log.status === 'credited' ? '#2563eb' : '#d97706',
                  }"
                  style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;"
                  :title="log.status === 'settled'
                    ? 'Credited ' + fmtDate(log.creditedDate) + ' by ' + log.creditedBy + ' · Settled to Bisen ' + fmtDate(log.settledDate) + ' by ' + log.settledBy
                    : log.status === 'credited' ? 'Credited ' + fmtDate(log.creditedDate) + ' by ' + log.creditedBy : ''"
                >
                  <svg v-if="log.status === 'settled' || log.status === 'credited'" style="width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
                  <svg v-else style="width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-clock"/></svg>
                  {{ log.status === 'settled' ? 'Settled' : log.status === 'credited' ? 'Credited' : 'Pending' }}
                </span>
              </td>
              <!-- Actions: Edit/Delete only on manually-created entries, available to all staff; Revert (Admin-only) undoes one status stage -->
              <td style="padding:9px 12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                  <template v-if="log.origin === 'manual'">
                    <button class="btn btn-outline btn-sm" style="padding:5px 9px;" @click="openEdit(log)" title="Edit">
                      <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-edit"/></svg>
                    </button>
                    <button class="btn btn-outline btn-sm" style="padding:5px 9px;color:var(--red);border-color:var(--red);" @click="confirmRemove(log)" title="Delete">
                      <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-trash"/></svg>
                    </button>
                  </template>
                  <button v-if="isAdmin && log.status !== 'pending'" class="btn btn-outline btn-sm" style="padding:5px 9px;" @click="revertOneStep(log)" title="Revert to previous status">
                    <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-arrow-left"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);">
          <span>Rows per page:</span>
          <select v-model.number="pageSize" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div style="font-size:12px;color:var(--muted);">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredLogs.length) }} of {{ filteredLogs.length }}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="btn btn-outline btn-sm" :disabled="currentPage <= 1" @click="currentPage--">Prev</button>
          <span style="font-size:12px;color:var(--text);white-space:nowrap;">Page {{ currentPage }} of {{ totalPages }}</span>
          <button class="btn btn-outline btn-sm" :disabled="currentPage >= totalPages" @click="currentPage++">Next</button>
        </div>
      </div>
    </div>

    <!-- Add Bisen payment modal -->
    <Teleport to="body">
      <div v-if="addModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;" @click.self="addModal = false">
        <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:440px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <h3 style="font-size:16px;font-weight:800;margin:0;">Log Bisen Maya Payment</h3>
            <span @click="addModal = false" style="cursor:pointer;font-size:22px;color:var(--muted);">&times;</span>
          </div>

          <label class="form-label">Payment Method</label>
          <select v-model="newMethod" class="form-control" style="margin-bottom:14px;">
            <option v-for="m in BISEN_METHODS" :key="m">{{ m }}</option>
          </select>

          <label class="form-label">Amount (₱)</label>
          <input v-model.number="newAmount" type="number" min="0" step="0.01" placeholder="0.00" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Reference / Terminal Txn ID</label>
          <input v-model="newRef" type="text" placeholder="e.g. Maya terminal reference number" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Notes (optional)</label>
          <textarea v-model="newNotes" rows="2" class="form-control" style="margin-bottom:18px;resize:vertical;"></textarea>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-outline" @click="addModal = false">Cancel</button>
            <button class="btn btn-primary" @click="submitAdd">Log Payment</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit payment log modal -->
    <Teleport to="body">
      <div v-if="editModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;" @click.self="editModal = false">
        <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:440px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <h3 style="font-size:16px;font-weight:800;margin:0;">Edit Payment Log</h3>
            <span @click="editModal = false" style="cursor:pointer;font-size:22px;color:var(--muted);">&times;</span>
          </div>

          <label class="form-label">Store</label>
          <select v-model="editStoreVal" class="form-control" style="margin-bottom:14px;">
            <option value="ITEL">ITEL</option>
            <option value="Bisen">Bisen</option>
          </select>

          <label class="form-label">Payment Method</label>
          <select v-model="editMethodVal" class="form-control" style="margin-bottom:14px;">
            <option v-for="m in editMethodOptions" :key="m">{{ m }}</option>
          </select>

          <label class="form-label">Amount (₱)</label>
          <input v-model.number="editAmountVal" type="number" min="0" step="0.01" placeholder="0.00" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Reference / Terminal Txn ID{{ editStoreVal === 'Bisen' ? '' : ' (optional)' }}</label>
          <input v-model="editRefVal" type="text" placeholder="Terminal reference number" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Notes (optional)</label>
          <textarea v-model="editNotesVal" rows="2" class="form-control" style="margin-bottom:18px;resize:vertical;"></textarea>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-outline" @click="editModal = false">Cancel</button>
            <button class="btn btn-primary" @click="submitEdit">Save Changes</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
