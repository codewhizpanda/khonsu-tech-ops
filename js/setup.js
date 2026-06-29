import { state, saveInv } from './state.js';
import { ik } from './utils.js';
import { toast } from './toast.js';
import { buildCatFilter, renderProducts } from './products.js';
import { updateBanner } from './sync.js';

export async function connectSheet() {
  const url = document.getElementById('scriptUrl').value.trim();
  if (!url) { toast('Enter URL', 'error'); return; }
  state.scriptUrl = url;
  localStorage.setItem('kt_url', url);
  document.getElementById('connectStatus').textContent = 'Connecting…';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'init' }),
    });
    document.getElementById('connectStatus').textContent = 'Connected and sheets initialized!';
    toast('Connected!', 'success');
    updateBanner();
  } catch (e) {
    document.getElementById('connectStatus').textContent = 'URL saved. (CORS in preview is normal — deployed app will work fine.)';
    toast('URL saved', 'success');
  }
}

export async function pushInventory() {
  if (!state.scriptUrl) { toast('Connect a sheet first', 'error'); return; }
  document.getElementById('pushStatus').textContent = 'Pushing all data…';
  try {
    // Products
    const productRows = state.masterList.map(p => [
      ik(p), p.category, p.name, p.ram || '', p.storage || '',
      p.colors || '', p.unitPrice, p.srp, p.obsolete ? 'Obsolete' : 'Active',
    ]);
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveProducts', rows: productRows }),
    });

    // Inventory
    const inventoryRows = state.masterList.map(p => ({
      productKey: ik(p),
      stock: (state.inventory[ik(p)] || {}).stock || 0,
      reorder: (state.inventory[ik(p)] || {}).reorder || 1,
    }));
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveInventory', rows: inventoryRows }),
    });

    // Promotions
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'savePromotions', bundles: state.predefinedBundles }),
    });

    // Freebies
    const freebies = Object.entries(state.productFreebies).map(([mainKey, freebieKey]) => {
      const mainP = state.masterList.find(p => ik(p) === mainKey);
      const fbP = state.masterList.find(p => ik(p) === freebieKey);
      return { mainKey, freebieKey, mainName: mainP ? mainP.name : '', freebieName: fbP ? fbP.name : '' };
    });
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveFreebies', freebies }),
    });

    // Settings
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'saveSettings',
        settings: {
          DailyTarget: state.settings.dailyTarget,
          LowStockThreshold: state.settings.lowStockThreshold,
          GlobalReorder: state.settings.globalReorder,
        },
      }),
    });

    // IMEI Units (replaces all — safe since sheet is append-only log; this syncs local state)
    if (state.units && state.units.length) {
      await fetch(state.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'replaceUnits', units: state.units }),
      });
    }

    document.getElementById('pushStatus').textContent = 'All data pushed to Sheets!';
    toast('All data pushed to Google Sheets!', 'success');
  } catch (e) {
    document.getElementById('pushStatus').textContent = 'Push failed: ' + e.message;
    toast('Push failed — check console', 'error');
    console.error('Push all data error:', e);
  }
}

export function copyScript() {
  navigator.clipboard.writeText(document.getElementById('scriptText').innerText);
  toast('Script copied!', 'success');
}

window.connectSheet = connectSheet;
window.pushInventory = pushInventory;
window.copyScript = copyScript;
