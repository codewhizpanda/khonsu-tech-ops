<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { useTimeLog } from '@/composables/useTimeLog.js';

const store = useAppStore();
const { addManualEntry, editEntry, removeEntry, pullTimeLogs, pushAllTimeLogs } = useTimeLog();

onMounted(() => { pullTimeLogs(); });

const pushing = ref(false);
async function handlePushAll() {
  pushing.value = true;
  await pushAllTimeLogs();
  pushing.value = false;
}

const USERS = ['Sam', 'Joyce', 'Admin'];

const searchQ    = ref('');
const filterUser = ref('All');
const fromDate   = ref('');
const toDate     = ref('');

const filteredLogs = computed(() => {
  const q = searchQ.value.toLowerCase();
  return store.timeLogs.filter(l => {
    const matchSearch = !q ||
      (l.user || '').toLowerCase().includes(q) ||
      (l.notes || '').toLowerCase().includes(q);
    const matchUser = filterUser.value === 'All' || l.user === filterUser.value;
    const d = new Date(l.clockIn);
    const matchFrom = !fromDate.value || d >= new Date(fromDate.value + 'T00:00:00');
    const matchTo   = !toDate.value   || d <= new Date(toDate.value + 'T23:59:59');
    return matchSearch && matchUser && matchFrom && matchTo;
  });
});

// Pagination — same pattern as Payment Logs: this list only grows over time.
const pageSizeOptions = [10, 25, 50, 100];
const pageSize    = ref(10);
const currentPage = ref(1);
const totalPages  = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / pageSize.value)));
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredLogs.value.slice(start, start + pageSize.value);
});
watch([searchQ, filterUser, fromDate, toDate, pageSize], () => { currentPage.value = 1; });

function durationMs(l) {
  const start = new Date(l.clockIn);
  const end   = l.clockOut ? new Date(l.clockOut) : new Date();
  return Math.max(0, end - start);
}
function fmtDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  return Math.floor(totalMin / 60) + 'h ' + (totalMin % 60) + 'm';
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

// Total hours per staff for whatever's currently filtered/displayed.
const totals = computed(() => {
  const byUser = {};
  filteredLogs.value.forEach(l => { byUser[l.user] = (byUser[l.user] || 0) + durationMs(l); });
  return byUser;
});

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// Add manual entry
const addModal    = ref(false);
const newUser     = ref(USERS[0]);
const newClockIn  = ref('');
const newClockOut = ref('');
const newNotes    = ref('');

function openAdd() {
  newUser.value = USERS[0]; newClockIn.value = ''; newClockOut.value = ''; newNotes.value = '';
  addModal.value = true;
}
function submitAdd() {
  const ok = addManualEntry({ user: newUser.value, clockIn: newClockIn.value, clockOut: newClockOut.value, notes: newNotes.value.trim() });
  if (ok) addModal.value = false;
}

// Edit (or correct) an existing entry — any entry, auto or manual.
const editModal     = ref(false);
const editId        = ref(null);
const editClockIn   = ref('');
const editClockOut  = ref('');
const editNotes     = ref('');

function openEdit(l) {
  editId.value       = l.id;
  editClockIn.value  = toLocalInput(l.clockIn);
  editClockOut.value = toLocalInput(l.clockOut);
  editNotes.value    = l.notes || '';
  editModal.value    = true;
}
function submitEdit() {
  const ok = editEntry(editId.value, { clockIn: editClockIn.value, clockOut: editClockOut.value, notes: editNotes.value.trim() });
  if (ok) editModal.value = false;
}
function confirmRemove(l) {
  if (confirm('Delete this time entry?')) removeEntry(l.id);
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Time Log</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" :disabled="pushing" style="display:inline-flex;align-items:center;gap:5px;" @click="handlePushAll" title="Force-overwrite the Time Log sheet with everything stored locally">
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-upload"/></svg>
          {{ pushing ? 'Pushing…' : 'Push All to Sheets' }}
        </button>
        <button class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:5px;" @click="openAdd">
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-plus"/></svg>
          Add Manual Entry
        </button>
      </div>
    </div>

    <p style="font-size:13px;color:var(--muted);margin:-8px 0 16px;line-height:1.6;">
      Logged automatically when staff log in/out. Any entry can be corrected here (e.g. a forgotten clock-out) — corrections are recorded, not silent.
    </p>

    <!-- Totals by staff, for whatever's currently filtered -->
    <div class="g3" style="margin-bottom:16px;">
      <div v-for="u in USERS" :key="u" class="sc">
        <div class="sl">{{ u }}</div>
        <div class="sv">{{ fmtDuration(totals[u] || 0) }}</div>
      </div>
    </div>

    <!-- Search + filters -->
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
      <div class="sw" style="margin-bottom:0;flex:1;min-width:180px;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
        <input v-model="searchQ" type="text" placeholder="Search staff, notes…" />
      </div>
      <select v-model="filterUser" style="padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px;">
        <option value="All">All Staff</option>
        <option v-for="u in USERS" :key="u" :value="u">{{ u }}</option>
      </select>
      <input v-model="fromDate" type="date" style="padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px;" />
      <span style="color:var(--muted);font-size:12px;">to</span>
      <input v-model="toDate" type="date" style="padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px;" />
    </div>

    <div v-if="!filteredLogs.length" style="text-align:center;padding:60px;color:var(--muted);">
      {{ store.timeLogs.length ? 'No results match your filter.' : 'No time log entries yet.' }}
    </div>

    <div v-else style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--accent);color:#fff;">
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Staff</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Clock In</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Clock Out</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Duration</th>
              <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Origin</th>
              <th style="padding:10px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in paginatedLogs" :key="l.id" style="border-bottom:1px solid var(--border);">
              <td style="padding:9px 12px;white-space:nowrap;font-weight:600;">{{ l.user }}</td>
              <td style="padding:9px 12px;white-space:nowrap;color:var(--muted);">{{ fmtDate(l.clockIn) }}</td>
              <td style="padding:9px 12px;white-space:nowrap;">
                <span v-if="l.clockOut" style="color:var(--muted);">{{ fmtDate(l.clockOut) }}</span>
                <span v-else style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fef3c7;color:#d97706;">Still clocked in</span>
              </td>
              <td style="padding:9px 12px;text-align:left;font-family:'JetBrains Mono',monospace;font-weight:700;white-space:nowrap;">{{ fmtDuration(durationMs(l)) }}</td>
              <td style="padding:9px 12px;white-space:nowrap;">
                {{ l.origin === 'manual' ? 'Manual' : 'Auto' }}
                <div v-if="l.correctedBy" style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">corrected by {{ l.correctedBy }} · {{ fmtDate(l.correctedAt) }}</div>
                <div v-if="l.notes" style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">{{ l.notes }}</div>
              </td>
              <td style="padding:9px 12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                  <button class="btn btn-outline btn-sm" style="padding:5px 9px;" @click="openEdit(l)" title="Edit">
                    <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-edit"/></svg>
                  </button>
                  <button class="btn btn-outline btn-sm" style="padding:5px 9px;color:var(--red);border-color:var(--red);" @click="confirmRemove(l)" title="Delete">
                    <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-trash"/></svg>
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

    <!-- Add manual entry modal -->
    <Teleport to="body">
      <div v-if="addModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;" @click.self="addModal = false">
        <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:440px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <h3 style="font-size:16px;font-weight:800;margin:0;">Add Manual Time Entry</h3>
            <span @click="addModal = false" style="cursor:pointer;font-size:22px;color:var(--muted);">&times;</span>
          </div>

          <label class="form-label">Staff</label>
          <select v-model="newUser" class="form-control" style="margin-bottom:14px;">
            <option v-for="u in USERS" :key="u">{{ u }}</option>
          </select>

          <label class="form-label">Clock In</label>
          <input v-model="newClockIn" type="datetime-local" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Clock Out (optional)</label>
          <input v-model="newClockOut" type="datetime-local" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Notes (optional)</label>
          <textarea v-model="newNotes" rows="2" class="form-control" style="margin-bottom:18px;resize:vertical;"></textarea>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-outline" @click="addModal = false">Cancel</button>
            <button class="btn btn-primary" @click="submitAdd">Add Entry</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit / correct entry modal -->
    <Teleport to="body">
      <div v-if="editModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;" @click.self="editModal = false">
        <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:440px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <h3 style="font-size:16px;font-weight:800;margin:0;">Correct Time Entry</h3>
            <span @click="editModal = false" style="cursor:pointer;font-size:22px;color:var(--muted);">&times;</span>
          </div>

          <label class="form-label">Clock In</label>
          <input v-model="editClockIn" type="datetime-local" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Clock Out (leave blank if still clocked in)</label>
          <input v-model="editClockOut" type="datetime-local" class="form-control" style="margin-bottom:14px;" />

          <label class="form-label">Notes (optional)</label>
          <textarea v-model="editNotes" rows="2" class="form-control" style="margin-bottom:18px;resize:vertical;" placeholder="e.g. forgot to clock out, confirmed with staff"></textarea>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-outline" @click="editModal = false">Cancel</button>
            <button class="btn btn-primary" @click="submitEdit">Save Correction</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
