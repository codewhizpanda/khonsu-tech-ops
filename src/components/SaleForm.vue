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
const pasaDisplay = ref('');
const pasaWasCapped = ref(false);

// Preview total: for IMEI products use at least 1 unit even if none selected yet
const previewTotal = computed(() => {
  const q = isImei.value ? Math.max(store.selectedIMEIs.length, 1) : qty.value;
  return displayPrice.value * q + (store.selectedAddon?.soldPrice || 0);
});

// Admin-toggleable (Settings → General): caps the promoter's Pasa markup at the
// item's own net sales amount (SRP − Unit Price) so a promoter's commission can
// never exceed what ITEL earns on the sale. Applies per unit — since the cap
// scales the same way qty does, it's equivalent to capping the whole line total.
const pasaCapEnabled = computed(() => store.settings.pasaCapEnabled !== false);
const pasaMax = computed(() => product.value ? Math.max(0, product.value.srp - product.value.unitPrice) : 0);

function onPasaBlur() {
  let v = parseFloat(pasaDisplay.value) || 0;
  if (pasaCapEnabled.value && v > pasaMax.value) {
    v = pasaMax.value;
    pasaWasCapped.value = true;
  } else {
    pasaWasCapped.value = false;
  }
  pasa.value = v;
  pasaDisplay.value = v > 0 ? v.toFixed(2) : '';
}

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

watch(qty, n => {
  if (isImei.value) return;
  const cur = colors.value;
  if (n > cur.length) colors.value = [...cur, ...Array(n - cur.length).fill('')];
  else colors.value = cur.slice(0, n);
});

function resetForm(init) {
  const d = init || {};
  qty.value        = d.qty        ?? 1;
  colors.value     = d.colors     ? [...d.colors] : Array(d.qty || 1).fill('');
  soldType.value   = d.soldType   ?? 'Walk-in';
  promoter.value   = d.promoter   ?? '';
  pasa.value       = d.pasa       ?? 0;
  pasaDisplay.value = (d.pasa || 0) > 0 ? Number(d.pasa).toFixed(2) : '';
  pasaWasCapped.value = false;
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

    <!-- Back button -->
    <button class="btn btn-outline btn-sm" @click="emit('back')" style="margin-bottom:16px;display:inline-flex;align-items:center;gap:6px;">
      <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-arrow-left"/></svg>
      Back to Catalog
    </button>

    <!-- Two-column grid -->
    <div class="sale-layout">

      <!-- ── Left column ── -->
      <div>

        <!-- Product hero card -->
        <div class="step-card" style="display:flex;gap:16px;align-items:flex-start;">
          <div style="width:72px;height:72px;border-radius:10px;background:var(--surface2);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
            <svg style="width:32px;height:32px;fill:none;stroke:var(--muted);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-box"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <span style="display:inline-block;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
              {{ isPromoMode ? 'Promotion' : product.category }}
            </span>
            <div style="font-size:20px;font-weight:800;color:var(--text);line-height:1.2;margin-bottom:6px;">{{ product.name }}</div>
            <div v-if="vl(product)" style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
              <span v-if="product.ram" style="font-size:11px;padding:2px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--muted);font-weight:600;">{{ product.ram }}</span>
              <span v-if="product.storage" style="font-size:11px;padding:2px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--muted);font-weight:600;">{{ product.storage }}</span>
            </div>
            <div style="display:flex;align-items:baseline;gap:6px;">
              <span style="font-size:11px;color:var(--muted);">{{ isPasa && pasa > 0 ? 'Customer Price' : 'SRP' }}</span>
              <span style="font-size:16px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent);">{{ fmt(displayPrice) }}</span>
            </div>
          </div>
        </div>

        <!-- Step 1: Select Unit (IMEI) or Quantity & Color -->
        <div class="step-card">
          <div class="step-hd">
            <div class="step-num">1</div>
            <div>
              <div style="font-size:14px;font-weight:700;">{{ isImei ? 'Select Unit' : 'Quantity &amp; Color' }}</div>
              <div v-if="isImei" style="font-size:12px;color:var(--muted);">
                {{ store.units.filter(u => u.productKey === ik(product) && u.status === 'available').length }} unit(s) available
              </div>
            </div>
          </div>

          <!-- IMEI picker -->
          <IMEIPicker v-if="isImei" />

          <!-- Non-IMEI: Qty + Colors -->
          <template v-else>
            <div style="margin-bottom:14px;">
              <label class="form-label">Quantity</label>
              <input v-model.number="qty" type="number" min="1" class="form-control" style="width:100px;" />
            </div>
            <div>
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
          </template>
        </div>

        <!-- Steps 2 + 3: Sold Type + Payment side by side -->
        <div class="step-card">
          <div class="g2" style="gap:16px;">
            <div>
              <div class="step-hd" style="margin-bottom:10px;">
                <div class="step-num">2</div>
                <div style="font-size:14px;font-weight:700;">Sold Type</div>
              </div>
              <select v-model="soldType" class="form-control">
                <option>Walk-in</option>
                <option>Pasa</option>
              </select>
            </div>
            <div>
              <div class="step-hd" style="margin-bottom:10px;">
                <div class="step-num">3</div>
                <div style="font-size:14px;font-weight:700;">Payment</div>
              </div>
              <select v-model="payment" class="form-control">
                <option>Cash</option>
                <option>Card</option>
                <option>Home Credit</option>
              </select>
            </div>
          </div>
          <!-- Pasa fields -->
          <template v-if="isPasa">
            <div style="border-top:1px solid var(--border);margin:14px 0;"></div>
            <div class="g2" style="gap:12px;">
              <div>
                <label class="form-label">Promoter Name</label>
                <input v-model="promoter" type="text" placeholder="Promoter / referral name" class="form-control" />
              </div>
              <div>
                <label class="form-label">Pasa Price (₱ added to SRP)</label>
                <input
                  :value="pasaDisplay"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  class="form-control"
                  @input="pasaDisplay = $event.target.value; pasa = parseFloat($event.target.value) || 0; pasaWasCapped = false"
                  @blur="onPasaBlur"
                />
                <div v-if="pasaCapEnabled" style="font-size:11px;color:var(--muted);margin-top:4px;">
                  Max {{ fmt(pasaMax) }} — capped to this item's net sales amount
                </div>
                <div v-if="pasaWasCapped" style="font-size:11px;color:var(--red);margin-top:4px;">
                  Capped to the maximum allowed Pasa amount.
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Step 4: Add-on / Accessory -->
        <div v-if="hasAddon || isPromoMode || freebieProduct" class="step-card">
          <div class="step-hd">
            <div class="step-num">4</div>
            <div>
              <div style="font-size:14px;font-weight:700;">Add-on / Accessory
                <span style="font-size:12px;color:var(--muted);font-weight:400;"> (Optional)</span>
              </div>
            </div>
          </div>
          <AddonPicker v-if="hasAddon && !isPromoMode" @select="onAddonSelect" @remove="onAddonRemove" />
          <!-- Promo / freebie badge -->
          <div v-if="isPromoMode || freebieProduct" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0fdf4;border-radius:8px;">
            <svg style="width:16px;height:16px;fill:none;stroke:var(--green);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-gift"/></svg>
            <div style="flex:1;font-size:13px;font-weight:600;color:#15803d;">
              {{ isPromoMode ? promoAddonName + ' — included in Promotion' : freebieProduct?.name + ' (' + freebieProduct?.category + ')' }}
            </div>
            <div style="font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:10px;">FREE</div>
          </div>
        </div>

        <!-- Step 5: Customer Info -->
        <div v-if="!store.saleRows.length" class="step-card">
          <div class="step-hd">
            <div class="step-num">5</div>
            <div>
              <div style="font-size:14px;font-weight:700;">Customer Info
                <span style="font-size:12px;color:var(--muted);font-weight:400;"> (Optional)</span>
              </div>
            </div>
          </div>
          <CustomerForm ref="customerFormRef" />
        </div>

      </div>

      <!-- ── Right sidebar ── -->
      <div class="sale-sidebar">

        <!-- Sale Summary card -->
        <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px;">
          <!-- Dark header -->
          <div style="background:var(--accent);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg style="width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-cart"/></svg>
              <span style="font-size:14px;font-weight:700;color:#fff;">Sale Summary</span>
            </div>
            <span style="font-size:11px;background:rgba(255,255,255,.18);color:#fff;padding:2px 8px;border-radius:10px;font-weight:600;">
              {{ effectiveQty }} item{{ effectiveQty !== 1 ? 's' : '' }}
            </span>
          </div>
          <!-- Body -->
          <div style="padding:14px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;color:var(--muted);">{{ isPromoMode ? 'Promo Price' : isPasa && pasa > 0 ? 'Customer Total' : 'Unit Price' }}</span>
              <span style="font-size:13px;font-weight:600;font-family:'JetBrains Mono',monospace;">{{ fmt(displayPrice) }}</span>
            </div>
            <div v-if="store.selectedAddon" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;color:var(--muted);">{{ store.selectedAddon.product.name }}</span>
              <span style="font-size:13px;font-weight:600;font-family:'JetBrains Mono',monospace;">{{ fmt(store.selectedAddon.soldPrice) }}</span>
            </div>
            <div v-if="isPromoMode || freebieProduct" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;color:var(--green);">
                {{ isPromoMode ? promoAddonName : freebieProduct?.name }}
              </span>
              <span style="font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;padding:1px 7px;border-radius:8px;">FREE</span>
            </div>
            <div style="border-top:1px solid var(--border);margin:10px 0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
              <span style="font-size:13px;font-weight:700;">Total Amount</span>
              <span style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent);">{{ previewTotal > 0 ? fmt(previewTotal) : '—' }}</span>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;margin-bottom:8px;" @click="emit('go-review', getFormData())">
              Review Sale
              <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;" aria-hidden="true"><use href="#ic-arrow-right"/></svg>
            </button>
            <button class="btn btn-outline btn-lg" style="width:100%;" @click="emit('add-another', getFormData())">
              <svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;" aria-hidden="true"><use href="#ic-plus"/></svg>
              Add Another Item
            </button>
          </div>
        </div>

        <!-- Product Details card -->
        <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;font-weight:700;">Product Details</span>
          </div>
          <div style="padding:4px 0;">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
              <svg style="width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-tag"/></svg>
              <span style="font-size:12px;color:var(--muted);min-width:64px;flex-shrink:0;">Category</span>
              <span style="font-size:13px;font-weight:600;flex:1;text-align:right;">{{ product.category }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
              <svg style="width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-box"/></svg>
              <span style="font-size:12px;color:var(--muted);min-width:64px;flex-shrink:0;">Model</span>
              <span style="font-size:13px;font-weight:600;flex:1;text-align:right;">{{ product.name }}</span>
            </div>
            <div v-if="vl(product)" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
              <svg style="width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-info"/></svg>
              <span style="font-size:12px;color:var(--muted);min-width:64px;flex-shrink:0;">Variant</span>
              <span style="font-size:13px;font-weight:600;flex:1;text-align:right;">{{ vl(product) }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;" :style="bundleCode ? 'border-bottom:1px solid var(--border);' : ''">
              <svg style="width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-tag"/></svg>
              <span style="font-size:12px;color:var(--muted);min-width:64px;flex-shrink:0;">SRP</span>
              <span style="font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;flex:1;text-align:right;color:var(--accent);">{{ fmt(product.srp) }}</span>
            </div>
            <div v-if="bundleCode" style="display:flex;align-items:center;gap:10px;padding:10px 16px;">
              <svg style="width:14px;height:14px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-receipt"/></svg>
              <span style="font-size:12px;color:var(--muted);min-width:64px;flex-shrink:0;">{{ isPromoMode ? 'Promo' : 'Bundle' }}</span>
              <span style="font-size:12px;font-weight:700;font-family:monospace;flex:1;text-align:right;">{{ bundleCode }}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <div v-else style="padding:40px;text-align:center;color:var(--muted);">
    No product selected.
  </div>
</template>
