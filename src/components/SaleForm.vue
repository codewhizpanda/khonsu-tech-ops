<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl, fmt } from '@/utils.js';
import { COLORS, ADDON_CATS } from '@/data.js';
import { isImeiProduct, useSales } from '@/composables/useSales.js';
import IMEIPicker from '@/components/IMEIPicker.vue';
import AddonPicker from '@/components/AddonPicker.vue';
import CustomerForm from '@/components/CustomerForm.vue';

const props = defineProps({
  initialData: { type: Object, default: null },
});
const emit = defineEmits(['add-another', 'go-review', 'back']);

const store = useAppStore();
const { makeBundleCode } = useSales();

const product     = computed(() => store.selectedProduct);
const isImei      = computed(() => isImeiProduct(product.value));
const hasAddon    = computed(() => ADDON_CATS.includes(product.value?.category));
const colorOpts   = computed(() => COLORS[product.value?.category] || []);

// Form refs
const qty         = ref(1);
const colors      = ref(['']);
const soldType    = ref('Walk-in');
const promoter    = ref('');
const pasa        = ref(0);
const payment     = ref('Cash');
const bundleCode  = ref('');
const bundlePrice = ref(0);
const bundleName  = ref('');
const promoAddonKey  = ref('');
const promoAddonName = ref('');

const customerFormRef = ref(null);

// Freebie for this product (regular, not promo)
const freebieProduct = computed(() => {
  if (!product.value) return null;
  const key = store.productFreebies[ik(product.value)];
  return key ? store.masterList.find(x => ik(x) === key) : null;
});

const isPromoMode = computed(() => bundlePrice.value > 0 && !!promoAddonKey.value);
const isPasa      = computed(() => soldType.value === 'Pasa');

const effectiveQty = computed(() =>
  isImei.value ? store.selectedIMEIs.length : qty.value
);

const displayPrice = computed(() => {
  if (!product.value) return 0;
  if (bundlePrice.value > 0) return bundlePrice.value;
  return isPasa.value ? product.value.srp + pasa.value : product.value.srp;
});

const total = computed(() =>
  displayPrice.value * effectiveQty.value + (store.selectedAddon?.soldPrice || 0)
);

// Resize colors array when qty changes (non-IMEI)
watch(qty, n => {
  if (isImei.value) return;
  const cur = colors.value;
  if (n > cur.length) colors.value = [...cur, ...Array(n - cur.length).fill('')];
  else colors.value = cur.slice(0, n);
});

// Reset/restore form whenever selectedProduct changes (handled via key in SalesPage)
function resetForm(init) {
  const d = init || {};
  qty.value        = d.qty        ?? 1;
  colors.value     = d.colors     ? [...d.colors] : Array(d.qty || 1).fill('');
  soldType.value   = d.soldType   ?? 'Walk-in';
  promoter.value   = d.promoter   ?? '';
  pasa.value       = d.pasa       ?? 0;
  payment.value    = d.payment    ?? 'Cash';
  bundleCode.value  = d.bundleCode  ?? '';
  bundlePrice.value = d.bundlePrice ?? 0;
  bundleName.value  = d.bundleName  ?? '';
  promoAddonKey.value  = d.promoAddonKey  ?? '';
  promoAddonName.value = d.promoAddonName ?? '';
  if (d.addon) store.selectedAddon = d.addon;
}

onMounted(() => resetForm(props.initialData));

function onAddonSelect(prod) {
  store.selectedAddon = { product: prod, soldPrice: prod.srp };
  if (!bundleCode.value) bundleCode.value = makeBundleCode('BDL');
}

function onAddonRemove() {
  store.selectedAddon = null;
  bundleCode.value = '';
}

function getFormData() {
  return {
    qty:           qty.value,
    colors:        colors.value,
    soldType:      soldType.value,
    promoter:      promoter.value,
    pasa:          pasa.value,
    payment:       payment.value,
    bundleCode:    bundleCode.value,
    bundlePrice:   bundlePrice.value,
    bundleName:    bundleName.value,
    promoAddonKey:    promoAddonKey.value,
    promoAddonName:   promoAddonName.value,
    customer: customerFormRef.value?.getInfo() || null,
  };
}
</script>

<template>
  <div v-if="product">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <button class="btn btn-outline btn-sm" @click="emit('back')" style="padding:6px 12px;">
        <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;" aria-hidden="true"><use href="#ic-arrow-left"/></svg>
        Back
      </button>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">{{ product.name }}</div>
        <div style="font-size:12px;color:var(--muted);">{{ isPromoMode ? 'Promotion' : product.category }}{{ vl(product) ? ' — ' + vl(product) : '' }}</div>
      </div>
    </div>

    <!-- Price card -->
    <div style="background:var(--accent);border-radius:12px;padding:14px 18px;margin-bottom:14px;color:#fff;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1px;">{{ isPromoMode ? 'Promotion Price' : isPasa && pasa > 0 ? 'Customer Total (incl. Pasa)' : 'SRP' }}</div>
        <div style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;">₱{{ displayPrice.toLocaleString() }}</div>
      </div>
      <div v-if="bundleCode" style="text-align:right;">
        <div style="font-size:10px;opacity:.7;">{{ isPromoMode ? 'Promo' : 'Bundle' }} Code</div>
        <div style="font-family:monospace;font-size:13px;font-weight:700;">{{ bundleCode }}</div>
      </div>
    </div>

    <!-- Form card -->
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">

      <!-- Variant (read-only) -->
      <div v-if="vl(product)" style="margin-bottom:14px;">
        <label class="form-label">Variant</label>
        <input :value="vl(product)" readonly class="form-control" style="background:var(--bg);color:var(--muted);cursor:default;" />
      </div>

      <!-- IMEI picker (phones/tablets) -->
      <div v-if="isImei" style="margin-bottom:14px;">
        <label class="form-label">Select Unit (IMEI)</label>
        <IMEIPicker />
      </div>

      <!-- Qty + Colors (non-IMEI) -->
      <div v-if="!isImei" style="margin-bottom:14px;">
        <label class="form-label">Quantity</label>
        <input v-model.number="qty" type="number" min="1" class="form-control" style="width:100px;" />
      </div>

      <div v-if="!isImei" style="margin-bottom:14px;">
        <label class="form-label">Color{{ qty > 1 ? 's' : '' }}</label>
        <datalist id="colorOpts">
          <option v-for="c in colorOpts" :key="c" :value="c" />
        </datalist>
        <div v-if="qty <= 1">
          <input v-model="colors[0]" type="text" list="colorOpts" placeholder="e.g. Midnight Black" class="form-control" />
        </div>
        <div v-else>
          <div v-for="(_, i) in colors" :key="i" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:12px;color:var(--muted);min-width:52px;">Unit {{ i + 1 }}</span>
            <input v-model="colors[i]" type="text" list="colorOpts" placeholder="e.g. Midnight Black" class="form-control" style="flex:1;" />
          </div>
        </div>
      </div>

      <!-- Sold Type -->
      <div style="margin-bottom:14px;">
        <label class="form-label">Sold Type</label>
        <select v-model="soldType" class="form-control">
          <option>Walk-in</option>
          <option>Pasa</option>
        </select>
      </div>

      <!-- Promoter (Pasa only) -->
      <div v-if="isPasa" style="margin-bottom:14px;">
        <label class="form-label">Promoter Name</label>
        <input v-model="promoter" type="text" placeholder="Promoter / referral name" class="form-control" />
      </div>

      <!-- Pasa markup (Pasa only) — intentionally outside qty/color section -->
      <div v-if="isPasa" style="margin-bottom:14px;">
        <label class="form-label">Pasa Price (₱ added to SRP)</label>
        <input v-model.number="pasa" type="number" min="0" placeholder="0" class="form-control" />
      </div>

      <!-- Payment -->
      <div style="margin-bottom:14px;">
        <label class="form-label">Payment Method</label>
        <select v-model="payment" class="form-control">
          <option>Cash</option>
          <option>Card</option>
          <option>Home Credit</option>
        </select>
      </div>

      <!-- Addon section (only for ADDON_CATS and not in promo mode) -->
      <div v-if="hasAddon && !isPromoMode" style="margin-bottom:14px;">
        <label class="form-label">Add-on / Accessory</label>
        <AddonPicker @select="onAddonSelect" @remove="onAddonRemove" />
      </div>

      <!-- Promo addon / Freebie display -->
      <div v-if="isPromoMode || freebieProduct" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0fdf4;border-radius:8px;margin-bottom:14px;">
        <svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;color:var(--green);" aria-hidden="true"><use href="#ic-gift"/></svg>
        <div style="flex:1;font-size:13px;font-weight:600;color:#15803d;">
          {{ isPromoMode ? promoAddonName + ' — included in Promotion' : freebieProduct?.name + ' (' + freebieProduct?.category + ')' }}
        </div>
        <div style="font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:10px;">FREE</div>
      </div>

      <!-- Customer info (first item only) -->
      <div v-if="!store.saleRows.length">
        <CustomerForm ref="customerFormRef" />
      </div>
    </div>

    <!-- Total -->
    <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;font-weight:600;color:var(--muted);">{{ isPromoMode ? 'Promotion Price' : isPasa && pasa > 0 ? 'Customer Total (incl. Pasa)' : 'Total Amount' }}</span>
      <span style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent);">
        {{ total > 0 ? '₱' + total.toLocaleString() : '—' }}
      </span>
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:10px;">
      <button class="btn btn-outline btn-lg" style="flex:1;" @click="emit('add-another', getFormData())">
        <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;" aria-hidden="true"><use href="#ic-plus"/></svg>
        Add Another Item
      </button>
      <button class="btn btn-primary btn-lg" style="flex:1;" @click="emit('go-review', getFormData())">
        Review Sale
        <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;" aria-hidden="true"><use href="#ic-arrow-right"/></svg>
      </button>
    </div>
  </div>

  <div v-else style="padding:40px;text-align:center;color:var(--muted);">
    No product selected.
  </div>
</template>
