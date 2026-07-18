<script setup>
import { ref } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useSales } from '@/composables/useSales.js';
import { useToast } from '@/composables/useToast.js';
import ProductGrid  from '@/components/ProductGrid.vue';
import SaleForm     from '@/components/SaleForm.vue';
import ReviewSale   from '@/components/ReviewSale.vue';
import TodayReport  from '@/components/TodayReport.vue';

const store = useAppStore();
const { toast } = useToast();
const sales = useSales();

// 'picker' | 'detail' | 'review' | 'report'
const screen = ref('picker');

// Pre-populate data for SaleForm — null = new item, object = editing or bundle/promo
const initialData = ref(null);

// Key forces SaleForm to re-mount when selectedProduct changes
const formKey = ref(0);

function goDetail(key, init = null) {
  const p = store.PRODUCTS.find(x => ik(x) === key);
  if (!p) { toast('Product not found', 'error'); return; }
  store.selectedProduct = p;
  store.selectedAddon = null;
  store.selectedIMEIs = [];
  initialData.value = init;
  formKey.value++;
  screen.value = 'detail';
}

function openBundle(bundle) {
  const mainP  = store.PRODUCTS.find(p => ik(p) === bundle.mainKey);
  const addonP = store.PRODUCTS.find(p => ik(p) === bundle.addonKey);
  if (!mainP || !addonP) { toast('Promotion items not found in active products', 'error'); return; }
  const code = sales.makeBundleCode('PRO');
  goDetail(bundle.mainKey, {
    bundleCode:    code,
    bundlePrice:   bundle.price,
    bundleName:    bundle.name,
    promoAddonKey:    bundle.addonKey,
    promoAddonName:   addonP.name,
  });
}

function handleAddAnother(formData) {
  if (sales.addAnotherItem(formData)) {
    initialData.value = null;
    screen.value = 'picker';
  }
}

function handleGoReview(formData) {
  if (sales.goToReview(formData)) {
    initialData.value = null;
    screen.value = 'review';
  }
}

function handleBackFromDetail() {
  store.selectedProduct = null;
  store.selectedAddon = null;
  store.selectedIMEIs = [];
  screen.value = 'picker';
}

function handleEdit(idx) {
  const item = sales.editPendingItem(idx);
  formKey.value++;
  initialData.value = {
    qty:             item.qty,
    colors:          item.colors,
    soldType:        item.soldType,
    promoter:        item.promoter,
    pasa:            item.pasa,
    payment:         item.payment,
    bundleCode:      item.bundleCode,
    bundlePrice:     item.isPromo ? item.sp : 0,
    bundleName:      item.bundleName || '',
    promoAddonKey:   item.promoAddon?.key   || '',
    promoAddonName:  item.promoAddon?.name  || '',
    addon:           item.addon,
  };
  screen.value = 'detail';
}

function handleRemove(idx) {
  sales.removePendingItem(idx);
  if (!store.pendingItems.length) screen.value = 'picker';
}

function handleConfirm(cardRef) {
  if (sales.confirmSale(cardRef)) screen.value = 'picker';
}

function handleCloseDay() {
  screen.value = 'picker';
}

function clearSO() {
  if ((store.saleRows.length || store.pendingItems.length) &&
      !confirm('Start new Sales Order? Pending items will be discarded.')) return;
  store.currentSO = null;
  store.pendingItems = [];
  toast('Ready for new Sales Order', 'success');
}
</script>

<template>
  <div>
    <!-- SO banner (shown when an SO is open) -->
    <div
      v-if="store.currentSO"
      style="display:flex;align-items:center;justify-content:space-between;background:var(--accent-light);border:1.5px solid var(--accent);border-radius:10px;padding:8px 14px;margin-bottom:14px;"
    >
      <div style="display:flex;align-items:center;gap:10px;">
        <svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--accent);" aria-hidden="true"><use href="#ic-clipboard"/></svg>
        <span style="font-size:12px;color:var(--muted);">Active SO</span>
        <span style="font-family:monospace;font-size:14px;font-weight:700;color:var(--accent);">{{ store.currentSO }}</span>
      </div>
      <button class="btn btn-outline btn-sm" style="font-size:11px;" @click="clearSO">✕ Clear</button>
    </div>

    <!-- Screens -->
    <ProductGrid
      v-if="screen === 'picker'"
      @open-detail="key => goDetail(key)"
      @open-bundle="openBundle"
    />

    <SaleForm
      v-else-if="screen === 'detail'"
      :key="formKey"
      :initial-data="initialData"
      @add-another="handleAddAnother"
      @go-review="handleGoReview"
      @back="handleBackFromDetail"
    />

    <ReviewSale
      v-else-if="screen === 'review'"
      @confirm="handleConfirm"
      @add-item="screen = 'picker'"
      @edit="handleEdit"
      @remove="handleRemove"
    />

    <TodayReport
      v-else-if="screen === 'report'"
      @close-day="handleCloseDay"
      @back="screen = 'picker'"
    />

    <!-- Floating action button (picker screen only) -->
    <div
      v-if="screen === 'picker' && (store.pendingItems.length > 0 || store.saleRows.length > 0)"
      style="position:fixed;bottom:24px;right:24px;z-index:100;"
    >
      <button
        v-if="store.pendingItems.length > 0"
        class="btn btn-primary btn-lg"
        style="box-shadow:0 4px 16px rgba(28,37,65,.3);display:inline-flex;align-items:center;gap:8px;"
        @click="screen = 'review'"
      >
        <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-cart"/></svg>
        Review ({{ store.pendingItems.length }} item{{ store.pendingItems.length !== 1 ? 's' : '' }})
      </button>
      <button
        v-else
        class="btn btn-outline btn-lg"
        style="box-shadow:0 4px 16px rgba(28,37,65,.15);display:inline-flex;align-items:center;gap:8px;background:var(--surface);"
        @click="screen = 'report'"
      >
        <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-clipboard"/></svg>
        View Report ({{ store.saleRows.length }})
      </button>
    </div>
  </div>
</template>
