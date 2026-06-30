<script setup>
import { useSyncState } from '@/composables/useSync.js';
const { syncing, syncMsg } = useSyncState();
</script>

<template>
  <Transition name="overlay">
    <div v-if="syncing" style="position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
      <div style="background:var(--surface);border-radius:18px;padding:32px 40px;text-align:center;min-width:220px;box-shadow:0 8px 40px rgba(0,0,0,.3);">
        <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 16px;"></div>
        <div style="font-size:15px;font-weight:600;color:var(--text);">{{ syncMsg }}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;">Please wait</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay-enter-active, .overlay-leave-active { transition: opacity .2s; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }
</style>
