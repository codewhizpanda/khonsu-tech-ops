<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl, fmt } from '@/utils.js';
import ProductCard from '@/components/ProductCard.vue';

const emit = defineEmits(['open-detail', 'open-bundle']);
const store = useAppStore();
const filterOpen = ref(false);

const cats = computed(() => {
  const base = ['All', ...new Set(store.PRODUCTS.map(p => p.category))];
  if (store.predefinedBundles.length) base.splice(1, 0, 'Promotions');
  return base;
});

const filteredProducts = computed(() => {
  if (store.activeCat === 'Promotions') return [];
  return store.PRODUCTS.filter(p =>
    (store.activeCat === 'All' || p.category === store.activeCat) &&
    (p.name + ' ' + vl(p)).toLowerCase().includes(store.searchQ.toLowerCase())
  );
});

function selectCat(c) {
  store.activeCat = c;
  store.searchQ = '';
  filterOpen.value = false;
}
</script>

<template>
  <div>
    <!-- Search + Filter row -->
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">
      <div class="sw" style="margin-bottom:0;flex:1;">
        <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
        <input v-model="store.searchQ" type="text" placeholder="Search products…" :disabled="store.activeCat === 'Promotions'" />
      </div>
      <button @click="filterOpen = true"
        :style="store.activeCat !== 'All' ? 'background:var(--accent);border-color:var(--accent);color:#fff;' : ''"
        style="flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;position:relative;color:var(--text);"
        :title="store.activeCat">
        <svg class="ic" aria-hidden="true"><use href="#ic-filter"/></svg>
      </button>
    </div>

    <!-- Active filter label -->
    <div v-if="store.activeCat !== 'All'" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
      <span style="font-size:12px;color:var(--muted);">Showing:</span>
      <span style="font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:2px 10px;border-radius:20px;">{{ store.activeCat }}</span>
      <button @click="selectCat('All')" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;">✕ Clear</button>
    </div>

    <!-- Filter dialog -->
    <Teleport to="body">
      <div v-if="filterOpen" style="position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;" @click.self="filterOpen = false">
        <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:20px 20px 32px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <span style="font-size:15px;font-weight:700;">Filter by Category</span>
            <button @click="filterOpen = false" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1;">&times;</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button
              v-for="c in cats"
              :key="c"
              @click="selectCat(c)"
              style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-family:inherit;text-align:left;transition:background .15s;"
              :style="store.activeCat === c ? 'background:var(--accent);color:#fff;font-weight:600;' : 'background:var(--surface2);color:var(--text);'"
            >
              {{ c }}
              <svg v-if="store.activeCat === c" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-check"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Promotions grid -->
    <div v-if="store.activeCat === 'Promotions'" class="pgrid">
      <template v-if="store.predefinedBundles.length">
        <div
          v-for="(b, i) in store.predefinedBundles"
          :key="i"
          :class="['pc', (store.inventory[b.mainKey]?.stock <= 0 || store.inventory[b.addonKey]?.stock <= 0) && 'oos']"
          @click="!(store.inventory[b.mainKey]?.stock <= 0 || store.inventory[b.addonKey]?.stock <= 0) && emit('open-bundle', b)"
        >
          <div :class="['sb', (store.inventory[b.mainKey]?.stock <= 0 || store.inventory[b.addonKey]?.stock <= 0) ? 'sout' : 'sok']">
            {{ (store.inventory[b.mainKey]?.stock <= 0 || store.inventory[b.addonKey]?.stock <= 0) ? 'OUT' : 'In Stock' }}
          </div>
          <div class="cl">Promotion</div>
          <div class="pn">{{ b.name }}</div>
          <div class="pv" style="font-size:11px;line-height:1.7;margin-bottom:6px;">
            <span style="font-weight:600;color:var(--accent2);">Phone:</span> {{ b.mainName }}<br>
            <span style="font-weight:600;color:var(--accent2);">Accessory:</span> {{ b.addonName }}
          </div>
          <div class="pp">{{ fmt(b.price) }}</div>
        </div>
      </template>
      <div v-else style="padding:40px;text-align:center;color:var(--muted);grid-column:1/-1;">
        No promotions defined. Create one in Master List.
      </div>
    </div>

    <!-- Regular product grid -->
    <div v-else class="pgrid">
      <ProductCard
        v-for="p in filteredProducts"
        :key="ik(p)"
        :product="p"
        :inv="store.inventory[ik(p)] || { stock: 0, reorder: 1 }"
        :low-threshold="store.settings.lowStockThreshold"
        style="cursor:pointer;"
        @click="!((store.inventory[ik(p)] || {}).stock <= 0) && emit('open-detail', ik(p))"
      />
      <div v-if="!filteredProducts.length" style="padding:40px;text-align:center;color:var(--muted);grid-column:1/-1;">
        No products found.
      </div>
    </div>
  </div>
</template>
