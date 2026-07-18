<script setup>
import { ref } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { pullFromSheets, restoreTodaySales, getQueue } from '@/composables/useSync.js';
import { useTimeLog } from '@/composables/useTimeLog.js';
import logoPrimary from '@/assets/logo/khonsu-tech-logo-primary.svg';

const store     = useAppStore();
const { toast } = useToast();

const pinModalOpen = ref(false);
const pendingUser  = ref('');
const pinValue     = ref('');
const pinError     = ref('');
const pinChecking  = ref(false);

const DEFAULT_PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

async function localHash(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function login(user) {
  store.currentUser = user;
  localStorage.setItem('kt_user', user);
  if (user !== 'Admin') useTimeLog().clockIn(user);
  if (store.scriptUrl) {
    restoreTodaySales().catch(() => {});
    setTimeout(() => {
      if (!getQueue().length) pullFromSheets().catch(() => {});
    }, 800);
  }
  toast('Welcome, ' + user + '!', 'success');
}

function openPinModal(user) {
  pendingUser.value  = user;
  pinModalOpen.value = true;
  pinValue.value     = '';
  pinError.value     = '';
  setTimeout(() => document.getElementById('pinInput')?.focus(), 50);
}

function closePinModal() {
  pinModalOpen.value = false;
  pinValue.value     = '';
  pinError.value     = '';
}

async function submitPin() {
  const pin = pinValue.value.trim();
  if (!pin) return;
  const user = pendingUser.value;
  const isAdmin = user === 'Admin';
  pinChecking.value = true;
  pinError.value    = '';
  try {
    let valid = false;
    let offline = false;
    if (store.scriptUrl) {
      const res  = await fetch(store.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(isAdmin ? { action: 'verifyPin', pin } : { action: 'verifyStaffPin', user, pin }),
      });
      const data = await res.json();
      if (data.error) {
        // Server doesn't recognize the action (e.g. not yet added to the deployed script) —
        // fall back to the local default-PIN check instead of always rejecting.
        offline = true;
        valid = (await localHash(pin)) === DEFAULT_PIN_HASH;
      } else {
        valid = data.valid === true;
      }
    } else {
      offline = true;
      valid = (await localHash(pin)) === DEFAULT_PIN_HASH;
    }
    if (valid) {
      closePinModal();
      login(user);
      if (offline && store.scriptUrl) toast('Server PIN check unavailable — logged in with offline PIN', 'success');
    } else {
      pinError.value = 'Incorrect PIN. Try again.';
      pinValue.value = '';
    }
  } catch {
    const localValid = (await localHash(pin)) === DEFAULT_PIN_HASH;
    if (localValid) {
      closePinModal();
      login(user);
      toast('Server unreachable — logged in with offline PIN', 'success');
    } else {
      pinError.value = 'Server unreachable. Try the default PIN (1234) or check connection.';
    }
  } finally {
    pinChecking.value = false;
  }
}
</script>

<template>
  <div class="lock-screen">
    <div class="ls-card">
      <img :src="logoPrimary" alt="Khonsu Tech" style="height:88px;width:auto;margin-bottom:12px;" />
      <p style="font-size:12px;color:var(--muted);margin-bottom:24px;">Sales Operations System</p>

      <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;">Who's logging in?</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button class="btn btn-outline" @click="openPinModal('Sam')">
          <svg class="ic" aria-hidden="true"><use href="#ic-user"/></svg> Sam
        </button>
        <button class="btn btn-outline" @click="openPinModal('Joyce')">
          <svg class="ic" aria-hidden="true"><use href="#ic-user"/></svg> Joyce
        </button>
        <button class="btn btn-primary" @click="openPinModal('Admin')">
          <svg class="ic" aria-hidden="true"><use href="#ic-lock"/></svg> Admin
        </button>
      </div>

      <p style="font-size:11px;color:var(--muted);margin-top:20px;">Space No. K424.6 · Festival Mall · Alabang</p>
    </div>
  </div>

  <!-- PIN Modal -->
  <Teleport to="body">
    <div v-if="pinModalOpen" style="position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;" @click.self="closePinModal">
      <div style="background:var(--surface);border-radius:16px;padding:28px 24px;width:min(340px,90vw);box-shadow:0 8px 40px rgba(0,0,0,.3);">
        <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <svg class="ic" aria-hidden="true"><use href="#ic-key"/></svg> {{ pendingUser }} PIN
        </h3>
        <div class="field">
          <label>Enter PIN</label>
          <input id="pinInput" type="password" inputmode="numeric" v-model="pinValue"
            placeholder="••••"
            @keydown.enter="submitPin"
            style="font-size:20px;letter-spacing:6px;text-align:center;" />
        </div>
        <p v-if="pinError" style="color:var(--red);font-size:13px;margin-top:8px;">{{ pinError }}</p>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button class="btn btn-outline" style="flex:1;" @click="closePinModal">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" :disabled="pinChecking" @click="submitPin">
            {{ pinChecking ? 'Checking…' : 'Unlock' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lock-screen {
  position: fixed; inset: 0; z-index: 500;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
}
.ls-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 36px 28px;
  width: min(360px, 90vw);
  text-align: center;
  box-shadow: 0 8px 40px rgba(0,0,0,.12);
}
</style>
