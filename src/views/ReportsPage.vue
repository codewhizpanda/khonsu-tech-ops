<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { fmt, sameDay, parseSheetDate, fmtSheetDate } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { useSyncState } from '@/composables/useSync.js';

const store      = useAppStore();
const { toast }  = useToast();
const { syncing, syncMsg } = useSyncState();

const period   = ref('today');
const rows     = ref([]);
const loading  = ref(false);
const loaded   = ref(false);
const noSheets = ref(false);

function startOf(unit) {
  const d = new Date();
  if (unit === 'week')  d.setDate(d.getDate() - d.getDay());
  if (unit === 'month') d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function load(p) {
  period.value  = p;
  loading.value = true;
  noSheets.value = false;

  let fetched = null;

  if (store.scriptUrl) {
    syncMsg.value  = 'Loading report data…';
    syncing.value  = true;
    try {
      const res  = await fetch(store.scriptUrl + '?action=getSales');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      fetched = json.sales || [];
    } catch {
      toast('Could not load from Sheets — showing local data', 'error');
    } finally {
      syncing.value = false;
    }
  }

  // Fall back to local only for today
  if (!fetched) {
    noSheets.value = true;
    if (p !== 'today') {
      rows.value  = [];
      loading.value = false;
      loaded.value  = true;
      return;
    }
    fetched = store.saleRows.map(r => ({
      Date: new Date().toISOString(),
      SO: r.so, ItemName: r.itemName, Variant: r.variant || '',
      Color: r.color || '', Qty: r.qty,
      SoldPrice: r.soldPrice * r.qty,
      NetSales: r.netSales, Payment: r.payment, Staff: r.staff,
    }));
  }

  const cutoff = (p === 'today') ? null : startOf(p === 'week' ? 'week' : 'month');
  rows.value = fetched.filter(r => {
    if (p === 'today') return sameDay(r.Date);
    const d = parseSheetDate(r.Date);
    return d && d >= cutoff;
  });

  loading.value = false;
  loaded.value  = true;
}

const totals = computed(() => {
  let totalSold = 0, totalNet = 0;
  rows.value.forEach(r => {
    totalSold += Number(r.SoldPrice) || 0;
    totalNet  += Number(r.NetSales)  || 0;
  });
  return { totalSold, totalNet, count: rows.value.length };
});

// Load today on mount
load('today');
</script>

<template>
  <div>
    <h2 style="font-size:20px;font-weight:800;margin-bottom:16px;">Reports</h2>

    <!-- Period selector -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button
        v-for="p in ['today', 'week', 'month']"
        :key="p"
        :class="['btn btn-sm', period === p ? 'btn-primary' : 'btn-outline']"
        style="text-transform:capitalize;"
        @click="load(p)"
      >{{ p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month' }}</button>
    </div>

    <!-- Sheets warning -->
    <div v-if="noSheets && loaded && period !== 'today'" style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
      <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-info"/></svg>
      Connect Google Sheets in Setup to view historical reports.
    </div>

    <!-- Summary cards -->
    <div class="g3" style="margin-bottom:16px;">
      <div class="sc">
        <div class="sl">Transactions</div>
        <div class="sv">{{ totals.count }}</div>
      </div>
      <div class="sc">
        <div class="sl">Gross Sales</div>
        <div class="sv">{{ fmt(totals.totalSold) }}</div>
      </div>
      <div class="sc">
        <div class="sl">Net Sales</div>
        <div class="sv" style="color:var(--green);">{{ fmt(totals.totalNet) }}</div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" style="text-align:center;padding:48px;color:var(--muted);font-size:14px;">Loading…</div>

    <!-- No data -->
    <div
      v-else-if="!rows.length && loaded"
      style="text-align:center;padding:48px;color:var(--muted);font-size:14px;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;"
    >No transactions for this period.</div>

    <!-- Transactions table -->
    <div v-else-if="rows.length" style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--accent);color:#fff;">
              <th style="padding:9px 12px;text-align:left;white-space:nowrap;">Date</th>
              <th style="padding:9px 12px;text-align:left;white-space:nowrap;">SO</th>
              <th style="padding:9px 12px;text-align:left;white-space:nowrap;">Item</th>
              <th style="padding:9px 12px;text-align:left;white-space:nowrap;">Variant</th>
              <th style="padding:9px 12px;text-align:left;white-space:nowrap;">Color</th>
              <th style="padding:9px 12px;text-align:right;white-space:nowrap;">Qty</th>
              <th style="padding:9px 12px;text-align:right;white-space:nowrap;">Sold</th>
              <th style="padding:9px 12px;text-align:right;white-space:nowrap;">Net</th>
              <th style="padding:9px 12px;white-space:nowrap;">Payment</th>
              <th style="padding:9px 12px;white-space:nowrap;">Staff</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i" style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 12px;color:var(--muted);white-space:nowrap;">{{ fmtSheetDate(r.Date) }}</td>
              <td style="padding:8px 12px;font-family:monospace;font-size:11px;white-space:nowrap;">{{ r.SO || '—' }}</td>
              <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">{{ r.ItemName || '—' }}</td>
              <td style="padding:8px 12px;color:var(--muted);white-space:nowrap;">{{ r.Variant || '—' }}</td>
              <td style="padding:8px 12px;white-space:nowrap;">{{ r.Color || '—' }}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;">{{ r.Qty || 0 }}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;">₱{{ (Number(r.SoldPrice) || 0).toLocaleString() }}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;color:var(--green);">₱{{ (Number(r.NetSales) || 0).toLocaleString() }}</td>
              <td style="padding:8px 12px;white-space:nowrap;">{{ r.Payment || '—' }}</td>
              <td style="padding:8px 12px;white-space:nowrap;">{{ r.Staff || '—' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2);font-weight:700;">
              <td colspan="6" style="padding:9px 12px;font-size:12px;">Total</td>
              <td style="padding:9px 12px;text-align:right;font-family:monospace;font-size:12px;">₱{{ totals.totalSold.toLocaleString() }}</td>
              <td style="padding:9px 12px;text-align:right;font-family:monospace;font-size:12px;color:var(--green);">₱{{ totals.totalNet.toLocaleString() }}</td>
              <td colspan="2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>
