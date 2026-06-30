<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { fmt, sameDay, parseSheetDate } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { useSyncState } from '@/composables/useSync.js';

const store     = useAppStore();
const { toast } = useToast();
const { syncing, syncMsg } = useSyncState();

// ── Raw data ──────────────────────────────────────────────────────────────────
const rows    = ref([]);   // sales rows from Sheets or local
const loaded  = ref(false);
const noSheets= ref(false);

function startOf(unit) {
  const d = new Date();
  if (unit === 'week')  d.setDate(d.getDate() - d.getDay());
  if (unit === 'month') d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadData() {
  if (!store.scriptUrl) {
    // Fall back to local today's sales
    noSheets.value = true;
    rows.value = store.saleRows.map(r => ({
      Date: new Date().toISOString(),
      SO: r.so, ItemName: r.itemName,
      Qty: r.qty, NetSales: r.netSales,
      Payment: r.payment, Staff: r.staff,
    }));
    loaded.value = true;
    return;
  }
  syncMsg.value = 'Loading dashboard data…';
  syncing.value = true;
  try {
    const res  = await fetch(store.scriptUrl + '?action=getSales');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    rows.value  = json.sales || [];
    noSheets.value = false;
  } catch (e) {
    toast('Could not load dashboard: ' + e.message, 'error');
    noSheets.value = true;
    rows.value = store.saleRows.map(r => ({
      Date: new Date().toISOString(),
      SO: r.so, ItemName: r.itemName,
      Qty: r.qty, NetSales: r.netSales,
      Payment: r.payment, Staff: r.staff,
    }));
  } finally {
    syncing.value = false;
    loaded.value  = true;
  }
}

onMounted(loadData);

// ── Aggregates ────────────────────────────────────────────────────────────────
const stats = computed(() => {
  const weekStart  = startOf('week');
  const monthStart = startOf('month');
  let todayNet = 0, weekNet = 0, monthNet = 0, todayUnits = 0;
  let cash = 0, card = 0, hc = 0;
  const staffMap = {};

  rows.value.forEach(r => {
    const net  = Number(r.NetSales) || 0;
    const qty  = Number(r.Qty) || 0;
    const d    = parseSheetDate(r.Date);
    if (!d) return;
    if (sameDay(r.Date)) { todayNet += net; todayUnits += qty; }
    if (d >= weekStart)  weekNet  += net;
    if (d >= monthStart) monthNet += net;
    const pmt = String(r.Payment || '');
    if (pmt === 'Cash')         cash += net;
    else if (pmt === 'Card')    card += net;
    else if (pmt === 'Home Credit') hc += net;
    const staff = String(r.Staff || 'Unknown');
    staffMap[staff] = (staffMap[staff] || 0) + net;
  });

  const target  = store.settings.dailyTarget || 3000;
  const metPct  = Math.min((todayNet / target) * 100, 100).toFixed(1);
  const staffEntries = Object.entries(staffMap).sort((a, b) => b[1] - a[1]);
  const staffMax = staffEntries[0]?.[1] || 1;

  return {
    todayNet, weekNet, monthNet, todayUnits, target,
    metPct, metTarget: todayNet >= target,
    cash, card, hc, staffEntries, staffMax,
  };
});

// ── 7-day bar chart ───────────────────────────────────────────────────────────
const barDays = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d, label: d.toLocaleDateString('en-PH', { weekday: 'short' }), net: 0, isToday: i === 0 });
  }
  rows.value.forEach(r => {
    const net = Number(r.NetSales) || 0;
    const rd  = parseSheetDate(r.Date);
    if (!rd) return;
    const day = days.find(d => sameDay(r.Date, d.date));
    if (day) day.net += net;
  });
  const max = Math.max(...days.map(d => d.net), 1);
  return days.map(d => ({ ...d, pct: Math.max((d.net / max) * 100, d.net > 0 ? 4 : 0) }));
});

// ── Donut ─────────────────────────────────────────────────────────────────────
const donutSegments = computed(() => {
  const { cash, card, hc } = stats.value;
  const total = cash + card + hc || 1;
  const R = 15.9, circ = 2 * Math.PI * R;
  const raw = [
    { label: 'Cash', value: cash, color: '#16a34a' },
    { label: 'Card', value: card, color: '#1b2e6b' },
    { label: 'HC',   value: hc,   color: '#d97706' },
  ].filter(s => s.value > 0);

  let offset = 0;
  return raw.map(s => {
    const dash = (s.value / total) * circ;
    const seg  = { ...s, pct: s.value / total, dash, circ, offset };
    offset += dash;
    return seg;
  });
});
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:20px;font-weight:800;margin:0;">Dashboard</h2>
      <button class="btn btn-outline btn-sm" @click="loadData">
        <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-upload"/></svg>
        Refresh
      </button>
    </div>

    <!-- Sheets warning -->
    <div v-if="noSheets && loaded" style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
      <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-info"/></svg>
      Showing today's local data only. Connect Google Sheets in Setup for full history.
    </div>

    <!-- Stat cards -->
    <div class="g3" style="margin-bottom:16px;">
      <div class="sc">
        <div class="sl">Today's Net</div>
        <div class="sv" :style="{ color: stats.metTarget ? 'var(--green)' : 'var(--accent)' }">{{ fmt(stats.todayNet) }}</div>
      </div>
      <div class="sc">
        <div class="sl">This Week</div>
        <div class="sv">{{ fmt(stats.weekNet) }}</div>
      </div>
      <div class="sc">
        <div class="sl">This Month</div>
        <div class="sv">{{ fmt(stats.monthNet) }}</div>
      </div>
    </div>

    <!-- Target progress -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--accent);" aria-hidden="true"><use href="#ic-target"/></svg>
          <span style="font-size:13px;font-weight:600;">Daily Target</span>
        </div>
        <span style="font-size:13px;font-weight:700;font-family:monospace;" :style="{ color: stats.metTarget ? 'var(--green)' : 'var(--red)' }">
          {{ fmt(stats.todayNet) }} / ₱{{ (stats.target || 0).toLocaleString() }}
        </span>
      </div>
      <div style="height:10px;border-radius:6px;background:var(--border);overflow:hidden;">
        <div
          :style="{ width: stats.metPct + '%', background: stats.metTarget ? 'var(--green)' : 'var(--accent)', height: '100%', borderRadius: '6px', transition: 'width .4s' }"
        />
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px;">
        <span>{{ stats.todayUnits }} unit{{ stats.todayUnits !== 1 ? 's' : '' }} sold today</span>
        <span>{{ stats.metPct }}%</span>
      </div>
    </div>

    <div class="g2" style="margin-bottom:16px;">
      <!-- 7-day bar chart -->
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
          <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--accent);" aria-hidden="true"><use href="#ic-chart"/></svg>
          7-Day Trend
        </div>
        <div style="height:120px;display:flex;align-items:flex-end;gap:5px;padding:0 2px;">
          <div
            v-for="day in barDays"
            :key="day.label"
            style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;"
          >
            <span v-if="day.net > 0" style="font-size:9px;color:var(--muted);font-family:'JetBrains Mono',monospace;white-space:nowrap;">
              {{ '₱' + Math.round(day.net / 1000) + 'k' }}
            </span>
            <div
              :style="{
                width: '100%',
                borderRadius: '4px 4px 0 0',
                height: day.pct + '%',
                minHeight: day.net > 0 ? '4px' : '0',
                background: day.isToday ? 'var(--accent)' : 'var(--accent-light)',
                transition: 'height .3s',
              }"
            />
          </div>
        </div>
        <div style="display:flex;gap:5px;padding:0 2px;margin-top:5px;">
          <div
            v-for="day in barDays"
            :key="day.label"
            style="flex:1;text-align:center;font-size:9px;overflow:hidden;"
            :style="{ color: day.isToday ? 'var(--accent)' : 'var(--muted)', fontWeight: day.isToday ? '700' : '400' }"
          >{{ day.label }}</div>
        </div>
      </div>

      <!-- Payment breakdown donut -->
      <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;width:100%;">Payment Mix</div>
        <svg viewBox="0 0 42 42" style="width:100px;height:100px;flex-shrink:0;overflow:visible;">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--border)" stroke-width="8"/>
          <circle
            v-for="seg in donutSegments"
            :key="seg.label"
            cx="21" cy="21" r="15.9"
            fill="none"
            :stroke="seg.color"
            stroke-width="8"
            :stroke-dasharray="`${seg.dash} ${seg.circ - seg.dash}`"
            :stroke-dashoffset="-seg.offset"
            transform="rotate(-90 21 21)"
          />
          <text v-if="!donutSegments.length" x="21" y="24" text-anchor="middle" font-size="5" fill="var(--muted)">No data</text>
        </svg>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px;width:100%;">
          <div v-if="!donutSegments.length" style="font-size:12px;color:var(--muted);text-align:center;">No payment data</div>
          <div v-for="seg in donutSegments" :key="seg.label" style="display:flex;align-items:center;gap:8px;font-size:12px;">
            <span :style="{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color, flexShrink: 0 }" />
            <span>{{ seg.label }}: <strong style="font-family:monospace;">₱{{ seg.value.toLocaleString() }}</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Staff performance -->
    <div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;">Staff Performance</div>
      <div v-if="!stats.staffEntries.length" style="font-size:13px;color:var(--muted);">No data</div>
      <div v-for="[name, val] in stats.staffEntries" :key="name" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span>{{ name }}</span>
          <span style="font-family:monospace;font-weight:700;">{{ fmt(val) }}</span>
        </div>
        <div style="height:6px;border-radius:4px;background:var(--border);overflow:hidden;">
          <div :style="{ width: (val / stats.staffMax * 100).toFixed(1) + '%', height: '100%', background: 'var(--accent)', borderRadius: '4px', transition: 'width .4s' }" />
        </div>
      </div>
    </div>
  </div>
</template>
