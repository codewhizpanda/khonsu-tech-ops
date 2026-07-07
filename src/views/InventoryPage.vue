<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl, fmt, compareProducts } from '@/utils.js';

const store = useAppStore();

const searchQ     = ref('');
const filterStatus = ref('All');
const filterOpen  = ref(false);
const filterOptions = ['All', 'OK', 'Low Stock', 'Out of Stock'];

const allRows = computed(() =>
  store.masterList
    .map(p => {
      const inv = store.inventory[ik(p)] || { stock: 0, reorder: 1 };
      const isOut = inv.stock <= 0;
      const isLow = !isOut && inv.stock <= inv.reorder;
      return { p, inv, isOut, isLow };
    })
    .sort((a, b) => compareProducts(a.p, b.p))
);

const rows = computed(() => {
  const q = searchQ.value.toLowerCase();
  return allRows.value.filter(({ p, isOut, isLow }) => {
    const matchSearch = !q || (p.name + ' ' + vl(p) + ' ' + p.category).toLowerCase().includes(q);
    const matchFilter =
      filterStatus.value === 'All' ||
      (filterStatus.value === 'Out of Stock' && isOut) ||
      (filterStatus.value === 'Low Stock'    && isLow) ||
      (filterStatus.value === 'OK'           && !isOut && !isLow);
    return matchSearch && matchFilter;
  });
});

const stats = computed(() => ({
  total: allRows.value.length,
  out:   allRows.value.filter(r => r.isOut).length,
  low:   allRows.value.filter(r => r.isLow).length,
  ok:    allRows.value.filter(r => !r.isOut && !r.isLow).length,
}));
</script>

<template>
  <div>
    <h2 style="font-size:20px;font-weight:800;margin-bottom:16px;">Inventory</h2>

    <!-- Search + Filter -->
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">
      <div class="sw" style="margin-bottom:0;flex:1;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
        <input v-model="searchQ" type="text" placeholder="Search inventory…" />
      </div>
      <button @click="filterOpen = true"
        :style="[
          'flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;',
          filterStatus !== 'All' ? 'background:var(--accent);border-color:var(--accent);color:#fff;' : 'color:var(--text);',
        ]"
        :title="filterStatus">
        <svg class="ic" aria-hidden="true"><use href="#ic-filter"/></svg>
      </button>
    </div>
    <div v-if="filterStatus !== 'All'" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
      <span style="font-size:12px;color:var(--muted);">Showing:</span>
      <span style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ filterStatus }}</span>
      <button @click="filterStatus = 'All'" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;">✕ Clear</button>
    </div>
    <Teleport to="body">
      <div v-if="filterOpen" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;" @click.self="filterOpen = false">
        <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:20px 20px 32px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <span style="font-size:15px;font-weight:700;">Filter by Status</span>
            <button @click="filterOpen = false" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1;">&times;</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button v-for="f in filterOptions" :key="f" @click="filterStatus = f; filterOpen = false"
              style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-family:inherit;text-align:left;"
              :style="filterStatus === f ? 'background:var(--accent);color:#fff;font-weight:600;' : 'background:var(--surface2);color:var(--text);'">
              {{ f }}
              <svg v-if="filterStatus === f" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Summary stats -->
    <div class="g3" style="margin-bottom:18px;">
      <div class="sc">
        <div class="sl">Total SKUs</div>
        <div class="sv">{{ stats.total }}</div>
      </div>
      <div class="sc" style="border-color:var(--red);">
        <div class="sl">Out of Stock</div>
        <div class="sv" style="color:var(--red);">{{ stats.out }}</div>
      </div>
      <div class="sc" style="border-color:var(--yellow);">
        <div class="sl">Low Stock</div>
        <div class="sv" style="color:var(--yellow);">{{ stats.low }}</div>
      </div>
    </div>

    <!-- Table -->
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--accent);color:#fff;">
              <th style="padding:10px 14px;text-align:left;white-space:nowrap;">Category</th>
              <th style="padding:10px 14px;text-align:left;white-space:nowrap;">Name</th>
              <th style="padding:10px 14px;text-align:left;white-space:nowrap;">Variant</th>
              <th style="padding:10px 14px;text-align:left;white-space:nowrap;">Colors</th>
              <th style="padding:10px 14px;text-align:right;white-space:nowrap;">SRP</th>
              <th style="padding:10px 14px;text-align:right;white-space:nowrap;">Stock</th>
              <th style="padding:10px 14px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ p, inv, isOut, isLow } in rows"
              :key="ik(p)"
              style="border-bottom:1px solid var(--border);"
              :style="{ opacity: p.obsolete ? '0.5' : '1' }"
            >
              <td style="padding:9px 14px;color:var(--muted);font-size:12px;">{{ p.category }}</td>
              <td style="padding:9px 14px;font-weight:600;">
                {{ p.name }}
                <span v-if="p.obsolete" style="font-size:10px;background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;margin-left:6px;">Obsolete</span>
              </td>
              <td style="padding:9px 14px;color:var(--muted);font-size:12px;">{{ vl(p) || '—' }}</td>
              <td style="padding:9px 14px;font-size:12px;color:var(--muted);max-width:180px;">{{ p.colors || '—' }}</td>
              <td style="padding:9px 14px;text-align:right;font-family:monospace;">{{ fmt(p.srp) }}</td>
              <td style="padding:9px 14px;text-align:right;font-family:monospace;font-weight:700;">{{ inv.stock }}</td>
              <td style="padding:9px 14px;text-align:center;">
                <span
                  :class="['sb', isOut ? 'sout' : isLow ? 'slow' : 'sok']"
                  style="position:static;display:inline-flex;"
                >{{ isOut ? 'OUT' : isLow ? 'LOW' : 'OK' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
