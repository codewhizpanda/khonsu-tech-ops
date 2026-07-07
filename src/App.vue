<script setup>
import { computed, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useAppStore } from '@/stores/state.js';
import { pullFromSheets, restoreTodaySales, pullUnits, getQueue } from '@/composables/useSync.js';
import SvgSprite   from '@/components/SvgSprite.vue';
import LockScreen  from '@/components/LockScreen.vue';
import NavBar      from '@/components/NavBar.vue';
import SyncBanner  from '@/components/SyncBanner.vue';
import SyncOverlay from '@/components/SyncOverlay.vue';
import Toast       from '@/components/Toast.vue';

const store     = useAppStore();
const loggedIn  = computed(() => !!store.currentUser);

onMounted(async () => {
  store.initApp();

  // Restore session from previous tab/refresh
  if (store.currentUser && store.scriptUrl) {
    restoreTodaySales().catch(() => {});
    setTimeout(() => {
      if (!getQueue().length) {
        pullFromSheets().catch(() => {});
        pullUnits().catch(() => {});
      }
    }, 800);
  }
});
</script>

<template>
  <SvgSprite />

  <template v-if="loggedIn">
    <NavBar />
    <SyncBanner />
    <main style="padding:16px;max-width:1100px;margin:0 auto;">
      <RouterView />
    </main>
  </template>

  <LockScreen v-else />

  <SyncOverlay />
  <Toast />
</template>
