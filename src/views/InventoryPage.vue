<script setup>
import { computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl } from '@/utils.js';

const store = useAppStore();

const rows = computed(() =>
  store.masterList.map(p => {
    const inv = store.inventory[ik(p)] || { stock: 0, reorder: 1 };
    const isOut = inv.stock <= 0;
    const isLow = !isOut && inv.stock <= inv.reorder;
    return { p, inv, isOut, isLow };
  })
);

const stats = computed(() => ({
  total: rows.value.length,
  out:   rows.value.filter(r => r.isOut).length,
  low:   rows.value.filter(r => r.isLow).length,
  ok:    rows.value.filter(r => !r.isOut && !r.isLow).length,
}));
</script>

<template>
  <div>
    <h2 style="font-size:20px;font-weight:800;margin-bottom:16px;">Inventory</h2>

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
              <td style="padding:9px 14px;text-align:right;font-family:monospace;">₱{{ (p.srp || 0).toLocaleString() }}</td>
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
