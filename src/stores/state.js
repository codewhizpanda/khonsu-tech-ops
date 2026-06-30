import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

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
  const purchaseOrders = ref(JSON.parse(localStorage.getItem('kt_pos') || '[]'));
  const scriptUrl     = ref(localStorage.getItem('kt_url') || '');
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

  return {
    currentUser, masterList, PRODUCTS, predefinedBundles, productFreebies,
    settings, inventory, saleRows, pendingItems, currentSO, soCounter,
    selectedProduct, selectedAddon, activeCat, searchQ, addonCat,
    bundleCounter, purchaseOrders, scriptUrl, editingPOId, syncQueue,
    units, selectedIMEIs, receiveDraftItems, restockProduct,
    saveInv, saveSettings, savePOs,
  };
});
