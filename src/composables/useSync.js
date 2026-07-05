import { ref } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { sameDay } from '@/utils.js';

const QUEUE_KEY = 'kt_queue';

// Shared overlay state (module-level singleton)
const syncing  = ref(false);
const syncMsg  = ref('Syncing…');
let _shownAt   = 0;

export function useSyncState() {
  return { syncing, syncMsg };
}

function showOverlay(msg) {
  syncMsg.value  = msg || 'Syncing…';
  syncing.value  = true;
  _shownAt       = Date.now();
}

function hideOverlay() {
  const delay = Math.max(0, 600 - (Date.now() - _shownAt));
  setTimeout(() => { syncing.value = false; }, delay);
}

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  const store = useAppStore();
  store.syncQueue = q;
}

export function enqueue(action, payload) {
  const q = getQueue();
  q.push({
    id: 'q' + Date.now() + Math.random().toString(36).slice(2, 6),
    action, payload,
    addedAt: new Date().toISOString(),
    attempts: 0,
  });
  saveQueue(q);
}

export async function tryPush(action, payload) {
  const store = useAppStore();
  if (!store.scriptUrl) { enqueue(action, payload); return; }
  try {
    const res  = await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
  } catch {
    enqueue(action, payload);
  }
}

export async function processQueue() {
  const store        = useAppStore();
  const { toast }    = useToast();
  const q            = getQueue();
  if (!q.length)         { toast('Nothing to sync', 'success'); return; }
  if (!store.scriptUrl)  { toast('Connect Google Sheets first in Setup', 'error'); return; }

  showOverlay('Syncing to Google Sheets…');
  const failed = [];

  for (const item of q) {
    try {
      const res  = await fetch(store.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: item.action, ...item.payload }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
    } catch {
      item.attempts = (item.attempts || 0) + 1;
      failed.push(item);
    }
  }

  saveQueue(failed);
  hideOverlay();

  if (!failed.length) {
    toast('All data synced to Google Sheets', 'success');
  } else {
    toast(failed.length + ' item(s) failed — will retry when online', 'error');
  }
}

export async function pullFromSheets() {
  const store     = useAppStore();
  const { toast } = useToast();
  if (!store.scriptUrl) return;

  showOverlay('Loading data from Sheets…');
  try {
    const res  = await fetch(store.scriptUrl + '?action=getAllData');
    const data = await res.json();
    if (data.error) return;

    if (data.products?.length) {
      store.masterList = data.products.map(r => ({
        category:  String(r.Category || ''),
        name:      String(r.Name || ''),
        ram:       String(r.RAM || ''),
        storage:   String(r.Storage || ''),
        colors:    String(r.Colors || ''),
        unitPrice: Number(r.UnitPrice) || 0,
        srp:       Number(r.SRP) || 0,
        obsolete:  String(r.Status || '').toLowerCase() === 'obsolete',
      }));
      localStorage.setItem('kt_ml', JSON.stringify(store.masterList));
    }

    if (data.inventory?.length) {
      data.inventory.forEach(r => {
        if (r.ProductKey) {
          store.inventory[String(r.ProductKey)] = {
            stock:   Number(r.Stock) || 0,
            reorder: Number(r.ReorderPoint) || 1,
          };
        }
      });
      store.saveInv();
    }

    if (data.promotions?.length) {
      store.predefinedBundles = data.promotions.map(r => ({
        id:          String(r.BundleID || ''),
        name:        String(r.Name || ''),
        price:       Number(r.Price) || 0,
        mainKey:     String(r.MainProductKey || ''),
        mainName:    String(r.MainProductName || ''),
        addonKey:    String(r.AddonProductKey || ''),
        addonName:   String(r.AddonProductName || ''),
      }));
      localStorage.setItem('kt_bundles', JSON.stringify(store.predefinedBundles));
    }

    if (data.freebies?.length) {
      const fb = {};
      data.freebies.forEach(r => { if (r.MainProductKey) fb[String(r.MainProductKey)] = String(r.FreebieProductKey); });
      store.productFreebies = fb;
      localStorage.setItem('kt_freebies', JSON.stringify(fb));
    }

    if (data.settings && Object.keys(data.settings).length) {
      if (data.settings.DailyTarget)      store.settings.dailyTarget      = Number(data.settings.DailyTarget);
      if (data.settings.LowStockThreshold) store.settings.lowStockThreshold = Number(data.settings.LowStockThreshold);
      if (data.settings.GlobalReorder)    store.settings.globalReorder    = Number(data.settings.GlobalReorder);
      localStorage.setItem('kt_settings', JSON.stringify(store.settings));
    }

    if (data.purchaseOrders?.length) {
      store.purchaseOrders = data.purchaseOrders.map(r => ({
        id:       String(r.POID || ''),
        date:     String(r.Date || ''),
        supplier: String(r.Supplier || ''),
        approver: String(r.Approver || ''),
        status:   String(r.Status || 'pending').toLowerCase(),
        items:    Array.isArray(r.items) ? r.items : [],
      }));
      localStorage.setItem('kt_pos', JSON.stringify(store.purchaseOrders));
    }

    toast('Data synced from Google Sheets', 'success');
  } catch (e) {
    console.warn('Pull from Sheets failed:', e.message);
  } finally {
    hideOverlay();
  }
}

function sheetRowToSaleRow(r) {
  return {
    id:          Number(r.SaleID) || Date.now() + Math.random(),
    so:          String(r.SO || ''),
    bundle:      String(r.BundleCode || ''),
    itemName:    String(r.ItemName || ''),
    variant:     String(r.Variant || ''),
    color:       String(r.Color || ''),
    qty:         Number(r.Qty) || 1,
    unitPrice:   Number(r.UnitPrice) || 0,
    srp:         Number(r.SRP) || 0,
    soldPrice:   Number(r.SoldPrice) || 0,
    pasaPrice:   Number(r.PasaPrice) || 0,
    discount:    Number(r.Discount) || 0,
    netSales:    Number(r.NetSales) || 0,
    payment:     String(r.Payment || 'Cash'),
    soldType:    String(r.SoldType || 'Walk-in'),
    promoter:    String(r.Promoter || ''),
    staff:       String(r.Staff || ''),
    isAddon:     r.IsAddon === 'true' || r.IsAddon === true,
    isPromotion: r.IsPromotion === 'true' || r.IsPromotion === true,
    productKey:  '',
    customer:    (r.CustomerName || r.CustomerContact)
      ? { name: String(r.CustomerName || ''), contact: String(r.CustomerContact || ''), email: String(r.CustomerEmail || '') }
      : null,
    imeis: r.IMEI ? String(r.IMEI).split(',').map(s => s.trim()).filter(Boolean) : [],
  };
}

export async function restoreTodaySales() {
  const store = useAppStore();
  if (!store.scriptUrl) return;
  try {
    const res  = await fetch(store.scriptUrl + '?action=getSales');
    const json = await res.json();
    if (json.error || !json.sales) return;
    const today = json.sales.filter(r => sameDay(r.Date));
    if (today.length) store.saleRows = today.map(sheetRowToSaleRow);
  } catch { /* non-critical */ }
}

window.addEventListener('online', () => {
  const store = useAppStore();
  if (getQueue().length > 0 && store.scriptUrl) processQueue();
});
