import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { DEF, COLORS } from '@/data.js';
import { ik } from '@/utils.js';

export const useAppStore = defineStore('app', () => {
  const currentUser   = ref(localStorage.getItem('kt_user') || null);
  const masterList    = ref([]);
  const predefinedBundles = ref([]);
  const productFreebies   = ref({});
  const settings      = ref({ dailyTarget: 3000, lowStockThreshold: 2, globalReorder: 1 });
  const inventory     = ref({});
  const saleRows      = ref([]);
  const pendingItems  = ref([]);
  const paymentLogs   = ref([]);
  const errorLogs     = ref([]);
  const currentSO     = ref(null);
  const soCounter     = ref(parseInt(localStorage.getItem('kt_so') || '0'));
  const selectedProduct = ref(null);
  const selectedAddon   = ref(null);
  const activeCat     = ref('Smart Phone');
  const searchQ       = ref('');
  const addonCat      = ref('All');
  const bundleCounter = ref(parseInt(localStorage.getItem('kt_pc') || '0'));
  const purchaseOrders = ref([]);
  const scriptUrl     = ref('');
  const editingPOId   = ref(null);
  const syncQueue     = ref([]);
  const units         = ref([]);
  const selectedIMEIs = ref([]);
  const receiveDraftItems = ref([]);
  const restockProduct    = ref(null);

  const PRODUCTS = computed(() => masterList.value.filter(p => !p.obsolete));

  function saveInv() {
    localStorage.setItem('kt_inv', JSON.stringify(inventory.value));
  }

  function saveSettings() {
    localStorage.setItem('kt_settings', JSON.stringify(settings.value));
  }

  function savePOs() {
    localStorage.setItem('kt_pos', JSON.stringify(purchaseOrders.value));
  }

  function savePaymentLogs() {
    localStorage.setItem('kt_paylogs', JSON.stringify(paymentLogs.value));
  }

  function saveErrorLogs() {
    localStorage.setItem('kt_errlogs', JSON.stringify(errorLogs.value));
  }

  function saveTodayRows() {
    localStorage.setItem('kt_today', JSON.stringify({
      date: new Date().toDateString(),
      rows: saleRows.value,
    }));
  }

  function clearTodayRows() {
    localStorage.removeItem('kt_today');
  }

  function initApp() {
    const savedML = localStorage.getItem('kt_ml');
    if (savedML) {
      masterList.value = JSON.parse(savedML);
    } else {
      masterList.value = DEF.map(p => ({
        ...p,
        obsolete: false,
        colors: (COLORS[p.category] || ['Black', 'White']).join(', '),
      }));
      localStorage.setItem('kt_ml', JSON.stringify(masterList.value));
    }

    const savedInv = localStorage.getItem('kt_inv');
    if (savedInv) {
      inventory.value = JSON.parse(savedInv);
    } else {
      masterList.value.forEach(p => { inventory.value[ik(p)] = { stock: 4, reorder: 1 }; });
      saveInv();
    }

    const savedSettings = localStorage.getItem('kt_settings');
    if (savedSettings) Object.assign(settings.value, JSON.parse(savedSettings));

    predefinedBundles.value = JSON.parse(localStorage.getItem('kt_bundles') || '[]');
    productFreebies.value   = JSON.parse(localStorage.getItem('kt_freebies') || '{}');
    purchaseOrders.value    = JSON.parse(localStorage.getItem('kt_pos') || '[]');
    scriptUrl.value         = localStorage.getItem('kt_url') || '';

    try { paymentLogs.value = JSON.parse(localStorage.getItem('kt_paylogs') || '[]'); } catch { paymentLogs.value = []; }
    try { errorLogs.value = JSON.parse(localStorage.getItem('kt_errlogs') || '[]'); } catch { errorLogs.value = []; }

    try { syncQueue.value = JSON.parse(localStorage.getItem('kt_queue') || '[]'); } catch { syncQueue.value = []; }

    // Restore today's confirmed sales from localStorage (survives page refresh)
    try {
      const saved = JSON.parse(localStorage.getItem('kt_today') || 'null');
      if (saved && saved.date === new Date().toDateString() && Array.isArray(saved.rows)) {
        saleRows.value = saved.rows;
      }
    } catch { /* ignore */ }

    // Load IMEI units and ensure dummy units exist for existing stock
    const IMEI_CATS = new Set(['Smart Phone', 'Bar Phone', 'Tablet']);
    try { units.value = JSON.parse(localStorage.getItem('kt_units') || '[]'); } catch { units.value = []; }
    let dummyAdded = 0;
    masterList.value.forEach(p => {
      if (!IMEI_CATS.has(p.category)) return;
      const key = ik(p);
      const stockCount = (inventory.value[key] || {}).stock || 0;
      const existing = units.value.filter(u => u.productKey === key && u.status === 'available').length;
      const colors = (p.colors || '').split(',').map(c => c.trim()).filter(Boolean);
      for (let i = 0; i < stockCount - existing; i++) {
        const n = units.value.filter(u => u.productKey === key).length + 1;
        units.value.push({
          imei: 'DUMMY-' + key.replace(/[^A-Za-z0-9]/g, '') + '-' + String(n).padStart(3, '0'),
          productKey: key, productName: p.name, color: colors[0] || '',
          status: 'available', drNumber: 'INITIAL',
          receivedDate: new Date().toLocaleDateString('en-PH'),
          soNumber: null, soldDate: null, isDummy: true,
        });
        dummyAdded++;
      }
    });
    if (dummyAdded) localStorage.setItem('kt_units', JSON.stringify(units.value));
  }

  return {
    currentUser, masterList, PRODUCTS, predefinedBundles, productFreebies,
    settings, inventory, saleRows, pendingItems, paymentLogs, errorLogs, currentSO, soCounter,
    selectedProduct, selectedAddon, activeCat, searchQ, addonCat,
    bundleCounter, purchaseOrders, scriptUrl, editingPOId, syncQueue,
    units, selectedIMEIs, receiveDraftItems, restockProduct,
    saveInv, saveSettings, savePOs, savePaymentLogs, saveErrorLogs, saveTodayRows, clearTodayRows, initApp,
  };
});
