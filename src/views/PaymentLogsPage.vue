<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { fmt } from '@/utils.js';
import { usePaymentLogs, BISEN_METHODS, ITEL_METHODS } from '@/composables/usePaymentLogs.js';

const store   = useAppStore();
const isAdmin = computed(() => store.currentUser === 'Admin');
const { addBisenLog, editLog, markCredited, revertPending, removeLog, pullPaymentLogs, pushAllPaymentLogs } = usePaymentLogs();

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
const statusOptions = ['All', 'Pending', 'Credited'];

const filteredLogs = computed(() => {
  const q = searchQ.value.toLowerCase();
  return store.paymentLogs.filter(l => {
    const matchSearch = !q ||
      (l.reference || '').toLowerCase().includes(q) ||
      (l.method || '').toLowerCase().includes(q) ||
      (l.staff || '').toLowerCase().includes(q) ||
      (l.notes || '').toLowerCase().includes(q);
    const matchStore  = filterStore.value === 'All' || l.store === filterStore.value;
    const matchStatus = filterStatus.value === 'All' || l.status === filterStatus.value.toLowerCase();
    return matchSearch && matchStore && matchStatus;
  });
});

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
// Accounts Payable (Bisen) — Maya terminal proceeds ITEL is holding for Bisen until paid out.
const arAp = computed(() => {
  const itel  = store.paymentLogs.filter(l => l.store === 'ITEL');
  const bisen = store.paymentLogs.filter(l => l.store === 'Bisen');
  return {
    arPending:  itel.filter(l => l.status === 'pending').reduce((s, l) => s + l.amount, 0),
    arReceived: itel.filter(l => l.status === 'credited').reduce((s, l) => s + l.amount, 0),
    apPending:  bisen.filter(l => l.status === 'pending').reduce((s, l) => s + l.amount, 0),
    apSettled:  bisen.filter(l => l.status === 'credited').reduce((s, l) => s + l.amount, 0),
  };
});

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
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

    <!-- Accounts Receivable (ITEL) / Accounts Payable (Bisen) — Admin only -->
    <div v-if="isAdmin" class="g2" style="margin-bottom:16px;">
      <div class="sc" style="border-left:4px solid var(--accent);">
        <div class="sl">Accounts Receivable — ITEL</div>
        <div class="sv">{{ fmt(arAp.arPending) }}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">Received to date: <strong style="color:var(--green);">{{ fmt(arAp.arReceived) }}</strong></div>
      </div>
      <div class="sc" style="border-left:4px solid #7e22ce;">
        <div class="sl">Accounts Payable — Bisen</div>
        <div class="sv" style="color:#7e22ce;">{{ fmt(arAp.apPending) }}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">Settled to date: <strong style="color:var(--green);">{{ fmt(arAp.apSettled) }}</strong></div>
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
        <input v-model="searchQ" type="text" placeholder="Search reference, method, staff…" />
      </div>
      <button @click="filterOpen = true"
        :style="(filterStore !== 'All' || filterStatus !== 'All') ? 'background:var(--accent);border-color:var(--accent);color:#fff;' : 'color:var(--text);'"
        style="flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;"
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
      <div v-if="filterOpen" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;" @click.self="filterOpen = false">
        <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:20px 20px 32px;">
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

    <div v-for="log in filteredLogs" :key="log.id" class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span
              style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;"
              :style="log.store === 'ITEL' ? 'background:var(--accent-light);color:var(--accent);' : 'background:#f3e8ff;color:#7e22ce;'"
            >{{ log.store }}</span>
            <span style="font-size:13px;font-weight:700;">{{ log.method }}</span>
            <span v-if="log.origin === 'auto'" style="font-size:11px;color:var(--muted);">(auto-logged)</span>
          </div>
          <div style="font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--text);margin-bottom:6px;">{{ fmt(log.amount) }}</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.8;">
            <strong style="color:var(--text);">Date:</strong> {{ fmtDate(log.date) }}<br>
            <strong style="color:var(--text);">Reference:</strong> {{ log.reference || '—' }}<br>
            <strong style="color:var(--text);">Logged by:</strong> {{ log.staff }}
            <template v-if="log.notes"><br><strong style="color:var(--text);">Notes:</strong> {{ log.notes }}</template>
            <template v-if="log.status === 'credited'"><br><strong style="color:var(--text);">Credited:</strong> {{ fmtDate(log.creditedDate) }} by {{ log.creditedBy }}</template>
          </div>
        </div>
        <span
          :style="{ background: log.status === 'credited' ? '#dcfce7' : '#fef3c7', color: log.status === 'credited' ? '#16a34a' : '#d97706' }"
          style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;"
        >
          <svg v-if="log.status === 'credited'" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
          <svg v-else style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-clock"/></svg>
          {{ log.status === 'credited' ? 'Credited' : 'Pending' }}
        </span>
      </div>

      <!-- Actions: Edit/Delete available to all staff; credited toggle is Admin-only -->
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:4px;" @click="openEdit(log)">
          <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-edit"/></svg>
          Edit
        </button>
        <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red);display:inline-flex;align-items:center;gap:4px;" @click="confirmRemove(log)">
          <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-trash"/></svg>
          Delete
        </button>
        <template v-if="isAdmin">
          <button v-if="log.status === 'pending'" class="btn btn-success btn-sm" @click="markCredited(log.id)">✓ Mark as Credited</button>
          <button v-else class="btn btn-outline btn-sm" @click="revertPending(log.id)">Revert to Pending</button>
        </template>
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

          <label class="form-label">Reference / Terminal Txn ID (optional)</label>
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

          <label class="form-label">Reference (optional)</label>
          <input v-model="editRefVal" type="text" placeholder="SO number / terminal reference" class="form-control" style="margin-bottom:14px;" />

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
