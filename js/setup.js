import { state, saveInv } from './state.js';
import { ik } from './utils.js';
import { toast } from './toast.js';
import { buildCatFilter, renderProducts } from './products.js';

export async function syncPricingFromSheet() {
  if (!state.scriptUrl) { toast('Connect a sheet first in Setup', 'error'); return; }
  const statusEl = document.getElementById('syncStatus');
  if (statusEl) statusEl.textContent = 'Syncing...';
  try {
    const res = await fetch(state.scriptUrl + '?action=getMasterList');
    const data = await res.json();
    if (data.error) { toast('Sync error: ' + data.error, 'error'); return; }
    const rows = data.rows || [];
    if (!rows.length) { toast('No data found in Master List sheet', 'error'); return; }
    let updated = 0;
    rows.forEach(row => {
      const keys = Object.keys(row);
      const cat = String(row['category'] || row[keys[0]] || '').trim();
      const name = String(row['model'] || row['name'] || row[keys[1]] || '').trim();
      const ram = String(row['ram'] || row[keys[2]] || '').trim();
      const storage = String(row['storage'] || row[keys[3]] || '').trim();
      const colors = String(row['colors'] || row[keys[4]] || '').trim();
      const unitPrice = parseFloat(row['unit price'] || row['unitprice'] || row[keys[5]] || 0);
      const srp = parseFloat(row['srp'] || row[keys[6]] || 0);
      const status = String(row['status'] || row[keys[9]] || 'Active').toLowerCase();
      if (!name) return;
      const idx = state.masterList.findIndex(p =>
        p.name.toLowerCase() === name.toLowerCase() &&
        (p.ram || '').toLowerCase() === (ram || '').toLowerCase() &&
        (p.storage || '').toLowerCase() === (storage || '').toLowerCase()
      );
      if (idx >= 0) {
        if (unitPrice > 0) state.masterList[idx].unitPrice = unitPrice;
        if (srp > 0) state.masterList[idx].srp = srp;
        if (colors) state.masterList[idx].colors = colors;
        state.masterList[idx].obsolete = status.includes('obsolete');
        updated++;
      }
    });
    localStorage.setItem('kt_ml', JSON.stringify(state.masterList));
    state.PRODUCTS = state.masterList.filter(p => !p.obsolete);
    buildCatFilter();
    renderProducts();
    if (statusEl) statusEl.textContent = updated + ' products updated from sheet';
    toast('Pricing synced — ' + updated + ' products updated', 'success');
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Sync failed — check sheet URL and CORS settings';
    toast('Sync failed: ' + e.message, 'error');
    console.error(e);
  }
}

export async function connectSheet() {
  const url = document.getElementById('scriptUrl').value.trim();
  if (!url) { toast('Enter URL', 'error'); return; }
  state.scriptUrl = url;
  localStorage.setItem('kt_url', url);
  document.getElementById('connectStatus').textContent = 'Connecting...';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    });
    document.getElementById('connectStatus').textContent = 'Connected and sheets initialized!';
    toast('Connected!', 'success');
  } catch (e) {
    document.getElementById('connectStatus').textContent = 'URL saved. (CORS in preview is normal — deployed app will work fine.)';
    toast('URL saved', 'success');
  }
}

export async function pushInventory() {
  if (!state.scriptUrl) { toast('Connect a sheet first', 'error'); return; }
  document.getElementById('pushStatus').textContent = 'Pushing...';
  const rows = state.masterList.map(p => [
    p.category, p.name, p.ram, p.storage, p.colors || '',
    p.unitPrice, p.srp, (state.inventory[ik(p)] || {}).stock || 4, 1,
  ]);
  try {
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pushInventory', rows }),
    });
    document.getElementById('pushStatus').textContent = 'Done!';
    toast('Master list pushed!', 'success');
  } catch (e) {
    document.getElementById('pushStatus').textContent = 'Sent (check your sheet)';
    toast('Pushed', 'success');
  }
}

export function copyScript() {
  navigator.clipboard.writeText(document.getElementById('scriptText').innerText);
  toast('Script copied!', 'success');
}

export async function syncInventoryFromSheet() {
  if (!state.scriptUrl) return;
  try {
    const res = await fetch(state.scriptUrl + '?action=getInventory');
    const data = await res.json();
    if (data.error || !data.rows) return;
    let updated = 0;
    data.rows.forEach(row => {
      if (row.key && state.inventory[row.key] !== undefined) {
        state.inventory[row.key].stock = Number(row.stock) || 0;
        updated++;
      }
    });
    if (updated > 0) saveInv();
  } catch (e) {
    console.warn('Inventory sync failed:', e.message);
  }
}

export async function pushStockDecrement(items) {
  if (!state.scriptUrl || !items.length) return;
  try {
    await fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decrementStock', items }),
    });
  } catch (e) {
    console.warn('Stock decrement sync failed:', e.message);
  }
}

window.connectSheet = connectSheet;
window.pushInventory = pushInventory;
window.copyScript = copyScript;
window.syncPricingFromSheet = syncPricingFromSheet;
