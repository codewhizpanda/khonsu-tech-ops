import { state, saveInv } from './state.js';
import { ik, vl } from './utils.js';
import { toast } from './toast.js';
import { tryPush } from './sync.js';

export function renderSettings() {
  document.getElementById('set-target').value = state.settings.dailyTarget;
  document.getElementById('set-lowstock').value = state.settings.lowStockThreshold;
  document.getElementById('set-reorder').value = state.settings.globalReorder;
  const body = document.getElementById('reorderBody');
  body.innerHTML = state.masterList.map((p, i) => {
    const key = ik(p);
    const inv = state.inventory[key] || { stock: 4, reorder: state.settings.globalReorder };
    return `<tr>
      <td style="font-weight:600;">${p.name}</td>
      <td style="color:var(--muted);font-size:12px;">${vl(p) || '—'}</td>
      <td class="mono">${inv.stock}</td>
      <td>
        <input type="number" value="${inv.reorder || state.settings.globalReorder}" min="0"
          data-key="${encodeURIComponent(key)}"
          oninput="updateReorder(decodeURIComponent(this.dataset.key),this.value)"
          style="width:70px;padding:5px 8px;font-size:12px;border:1.5px solid var(--border);border-radius:6px;">
      </td>
    </tr>`;
  }).join('');
}

export function updateReorder(key, val) {
  if (state.inventory[key]) state.inventory[key].reorder = parseInt(val) || 1;
}

export function applyGlobalReorder() {
  const g = parseInt(document.getElementById('set-reorder').value) || 1;
  state.masterList.forEach(p => {
    if (state.inventory[ik(p)]) state.inventory[ik(p)].reorder = g;
  });
  saveInv();
  renderSettings();
  toast('Global reorder point applied to all items', 'success');
}

export function saveSettings() {
  state.settings.dailyTarget = parseInt(document.getElementById('set-target').value) || 3000;
  state.settings.lowStockThreshold = parseInt(document.getElementById('set-lowstock').value) || 2;
  state.settings.globalReorder = parseInt(document.getElementById('set-reorder').value) || 1;
  localStorage.setItem('kt_settings', JSON.stringify(state.settings));
  saveInv();
  tryPush('saveSettings', {
    settings: {
      DailyTarget: state.settings.dailyTarget,
      LowStockThreshold: state.settings.lowStockThreshold,
      GlobalReorder: state.settings.globalReorder,
    },
  });
  toast('Settings saved!', 'success');
}

window.updateReorder = updateReorder;
window.applyGlobalReorder = applyGlobalReorder;
window.saveSettings = saveSettings;
