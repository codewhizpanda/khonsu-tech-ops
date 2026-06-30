<script setup>
import { computed } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { processQueue } from '@/composables/useSync.js';
import { useSyncState } from '@/composables/useSync.js';

const store = useAppStore();
const { syncing } = useSyncState();
const count = computed(() => store.syncQueue.length);
</script>

<template>
  <div v-if="count > 0 || syncing" style="background:#7c3aed;color:#fff;padding:8px 16px;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <span>{{ syncing ? 'Syncing…' : `${count} unsynced item${count !== 1 ? 's' : ''} — data saved locally` }}</span>
    <button
      :disabled="syncing"
      @click="processQueue"
      style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:4px 14px;border-radius:6px;font-size:12px;cursor:pointer;"
    >{{ syncing ? 'Syncing…' : 'Sync Now' }}</button>
  </div>
</template>
