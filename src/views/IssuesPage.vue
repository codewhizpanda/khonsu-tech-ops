<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { useErrorLog } from '@/composables/useErrorLog.js';

const store = useAppStore();
const { markResolved, markUnresolved, pushAllIssueLogs, pullIssueLogs } = useErrorLog();

onMounted(() => { pullIssueLogs(); });

const pushing = ref(false);
async function handlePushAll() {
  pushing.value = true;
  await pushAllIssueLogs();
  pushing.value = false;
}

const searchQ      = ref('');
const filterType    = ref('All');
const filterStatus  = ref('All');
const filterOpen    = ref(false);
const typeOptions   = ['All', 'Sync', 'Runtime'];
const statusOptions = ['All', 'Open', 'Resolved'];

const filteredIssues = computed(() => {
  const q = searchQ.value.toLowerCase();
  return store.errorLogs.filter(e => {
    const matchSearch = !q ||
      (e.message || '').toLowerCase().includes(q) ||
      (e.action || '').toLowerCase().includes(q) ||
      (e.context || '').toLowerCase().includes(q);
    const matchType   = filterType.value === 'All' || e.type === filterType.value.toLowerCase();
    const matchStatus = filterStatus.value === 'All' || e.status === filterStatus.value.toLowerCase();
    return matchSearch && matchType && matchStatus;
  });
});

const totals = computed(() => {
  const open     = store.errorLogs.filter(e => e.status === 'open');
  const resolved = store.errorLogs.filter(e => e.status === 'resolved');
  return {
    openCount: open.length,
    openSync:  open.filter(e => e.type === 'sync').length,
    openRuntime: open.filter(e => e.type === 'runtime').length,
    resolvedCount: resolved.length,
  };
});

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Sync &amp; Error Issues</h2>
      <button class="btn btn-outline btn-sm" :disabled="pushing" style="display:inline-flex;align-items:center;gap:5px;" @click="handlePushAll" title="Force-overwrite the Issue Log sheet with everything stored locally">
        <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-upload"/></svg>
        {{ pushing ? 'Pushing…' : 'Push All to Sheets' }}
      </button>
    </div>

    <p style="font-size:13px;color:var(--muted);margin:-8px 0 16px;line-height:1.6;">
      Every sync failure (a save that couldn't reach Google Sheets) and unexpected app error is logged here automatically, so nothing silently disappears. Mark an issue resolved once you've confirmed the underlying data is correct in Sheets.
    </p>

    <!-- Summary cards -->
    <div class="g3" style="margin-bottom:16px;">
      <div class="sc">
        <div class="sl">Open Issues</div>
        <div class="sv" style="color:var(--yellow);">{{ totals.openCount }}</div>
      </div>
      <div class="sc">
        <div class="sl">Open — Sync / Runtime</div>
        <div class="sv" style="font-size:18px;">{{ totals.openSync }} / {{ totals.openRuntime }}</div>
      </div>
      <div class="sc">
        <div class="sl">Resolved</div>
        <div class="sv" style="color:var(--green);">{{ totals.resolvedCount }}</div>
      </div>
    </div>

    <!-- Search + Filter -->
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
      <div class="sw" style="margin-bottom:0;flex:1;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
        <input v-model="searchQ" type="text" placeholder="Search message, action, context…" />
      </div>
      <button @click="filterOpen = true"
        style="flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;color:var(--text);"
        title="Filter">
        <svg class="ic" aria-hidden="true"><use href="#ic-filter"/></svg>
      </button>
    </div>
    <div v-if="filterType !== 'All' || filterStatus !== 'All'" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <span style="font-size:12px;color:var(--muted);">Showing:</span>
      <span v-if="filterType !== 'All'" style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ filterType }}</span>
      <span v-if="filterStatus !== 'All'" style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ filterStatus }}</span>
      <button @click="filterType = 'All'; filterStatus = 'All'" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;">✕ Clear</button>
    </div>

    <Teleport to="body">
      <div v-if="filterOpen" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;" @click.self="filterOpen = false">
        <div style="background:var(--surface);border-radius:20px;width:100%;max-width:480px;padding:20px;max-height:calc(100vh - 32px);overflow-y:auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <span style="font-size:15px;font-weight:700;">Filter</span>
            <button @click="filterOpen = false" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1;">&times;</button>
          </div>
          <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Type</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;">
            <button v-for="f in typeOptions" :key="f" @click="filterType = f"
              style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-family:inherit;text-align:left;"
              :style="filterType === f ? 'background:var(--accent);color:#fff;font-weight:600;' : 'background:var(--surface2);color:var(--text);'">
              {{ f }}
              <svg v-if="filterType === f" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
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

    <div v-if="!filteredIssues.length" style="text-align:center;padding:60px;color:var(--muted);">
      {{ store.errorLogs.length ? 'No results match your filter.' : 'No issues logged — sync is healthy.' }}
    </div>

    <div v-for="issue in filteredIssues" :key="issue.id" class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span
              style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;"
              :style="issue.type === 'sync' ? 'background:var(--accent-light);color:var(--accent);' : 'background:#fee2e2;color:#b91c1c;'"
            >{{ issue.type === 'sync' ? 'Sync' : 'Runtime' }}</span>
            <span v-if="issue.action" style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;">{{ issue.action }}</span>
            <span v-if="issue.attempts > 1" style="font-size:11px;color:var(--muted);">({{ issue.attempts }} attempts)</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;word-break:break-word;">{{ issue.message }}</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.8;">
            <strong style="color:var(--text);">First seen:</strong> {{ fmtDate(issue.date) }}<br>
            <strong style="color:var(--text);">Last seen:</strong> {{ fmtDate(issue.lastSeen) }}
            <template v-if="issue.context"><br><strong style="color:var(--text);">Context:</strong> <span style="word-break:break-all;">{{ issue.context }}</span></template>
            <template v-if="issue.status === 'resolved'"><br><strong style="color:var(--text);">Resolved:</strong> {{ fmtDate(issue.resolvedDate) }} by {{ issue.resolvedBy }}</template>
          </div>
        </div>
        <span
          :style="{ background: issue.status === 'resolved' ? '#dcfce7' : '#fef3c7', color: issue.status === 'resolved' ? '#16a34a' : '#d97706' }"
          style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;"
        >
          <svg v-if="issue.status === 'resolved'" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
          <svg v-else style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-clock"/></svg>
          {{ issue.status === 'resolved' ? 'Resolved' : 'Open' }}
        </span>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button v-if="issue.status === 'open'" class="btn btn-success btn-sm" @click="markResolved(issue.id)">✓ Mark as Resolved</button>
        <button v-else class="btn btn-outline btn-sm" @click="markUnresolved(issue.id)">Reopen</button>
      </div>
    </div>
  </div>
</template>
