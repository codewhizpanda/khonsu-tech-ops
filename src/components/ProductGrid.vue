<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik, vl } from '@/utils.js';
import ProductCard from '@/components/ProductCard.vue';

const emit = defineEmits(['open-detail', 'open-bundle']);
const store = useAppStore();

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
}
</script>

<template>
  <div>
    <!-- Category filter -->
    <div id="catFilter" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      <button
        v-for="c in cats"
        :key="c"
        :class="['cat-btn', store.activeCat === c && 'active']"
        @click="selectCat(c)"
      >{{ c }}</button>
    </div>

    <!-- Search -->
    <div v-if="store.activeCat !== 'Promotions'" class="sw" style="margin-bottom:14px;">
      <span class="si"><svg class="ic" aria-hidden="true"><use href="#ic-search"/></svg></span>
      <input v-model="store.searchQ" type="text" placeholder="Search products…" />
    </div>

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
          <div class="pp">₱{{ b.price.toLocaleString() }}</div>
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
