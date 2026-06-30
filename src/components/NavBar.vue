<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/state.js';

const store  = useAppStore();
const router = useRouter();
const route  = useRoute();

const isAdmin = computed(() => store.currentUser === 'Admin');

function go(path) { router.push(path); }
function isActive(path) { return route.path === path; }

function logout() {
  store.currentUser = null;
  localStorage.removeItem('kt_user');
  router.push('/sales');
}
</script>

<template>
  <header style="background:var(--surface);border-bottom:1px solid var(--border);padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;position:sticky;top:0;z-index:100;">
    <div style="font-size:13px;font-weight:700;color:var(--accent);white-space:nowrap;">Khonsu Tech OPS</div>
    <button class="btn btn-outline btn-sm" style="font-size:12px;white-space:nowrap;flex-shrink:0;" @click="logout">
      <svg class="ic" aria-hidden="true"><use href="#ic-user"/></svg>
      {{ store.currentUser }} — Switch
    </button>
  </header>

  <nav>
    <button class="tab" :class="{ active: isActive('/sales') }" @click="go('/sales')">
      <svg class="ic" aria-hidden="true"><use href="#ic-cart"/></svg> Log Sale
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/restock') }" @click="go('/restock')">
      <svg class="ic" aria-hidden="true"><use href="#ic-truck"/></svg> Receive Stock
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/inventory') }" @click="go('/inventory')">
      <svg class="ic" aria-hidden="true"><use href="#ic-box"/></svg> Inventory
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/po') }" @click="go('/po')">
      <svg class="ic" aria-hidden="true"><use href="#ic-clipboard"/></svg> Purchase Orders
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/masterlist') }" @click="go('/masterlist')">
      <svg class="ic" aria-hidden="true"><use href="#ic-list"/></svg> Master List
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/settings') }" @click="go('/settings')">
      <svg class="ic" aria-hidden="true"><use href="#ic-settings"/></svg> Settings
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/setup') }" @click="go('/setup')">
      <svg class="ic" aria-hidden="true"><use href="#ic-zap"/></svg> Setup
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/reports') }" @click="go('/reports')">
      <svg class="ic" aria-hidden="true"><use href="#ic-calendar"/></svg> Reports
    </button>
    <button v-if="isAdmin" class="tab" :class="{ active: isActive('/dashboard') }" @click="go('/dashboard')">
      <svg class="ic" aria-hidden="true"><use href="#ic-chart"/></svg> Dashboard
    </button>
  </nav>
</template>
