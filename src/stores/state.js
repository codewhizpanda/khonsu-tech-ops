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

    try { syncQueue.value = JSON.parse(localStorage.getItem('kt_queue') || '[]'); } catch { syncQueue.value = []; }
  }

  return {
    currentUser, masterList, PRODUCTS, predefinedBundles, productFreebies,
    settings, inventory, saleRows, pendingItems, currentSO, soCounter,
    selectedProduct, selectedAddon, activeCat, searchQ, addonCat,
    bundleCounter, purchaseOrders, scriptUrl, editingPOId, syncQueue,
    units, selectedIMEIs, receiveDraftItems, restockProduct,
    saveInv, saveSettings, savePOs, initApp,
  };
});
