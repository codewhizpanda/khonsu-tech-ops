<script setup>
import { ref } from 'vue';

const show = ref(false);
const name    = ref('');
const contact = ref('');
const email   = ref('');

function getInfo() {
  const n = name.value.trim(), c = contact.value.trim(), e = email.value.trim();
  return (n || c || e) ? { name: n, contact: c, email: e } : null;
}

function reset() {
  show.value = false;
  name.value = '';
  contact.value = '';
  email.value = '';
}

defineExpose({ getInfo, reset });
</script>

<template>
  <div style="margin-top:10px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;">
    <div
      style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface);cursor:pointer;"
      @click="show = !show"
    >
      <span style="font-size:13px;font-weight:600;color:var(--text);">Customer Info</span>
      <button class="btn btn-outline btn-sm" style="padding:3px 10px;font-size:11px;">{{ show ? '− Hide' : '+ Add' }}</button>
    </div>
    <div v-if="show" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
      <input v-model="name"    type="text"  placeholder="Name"         class="form-control" style="font-size:13px;" />
      <input v-model="contact" type="tel"   placeholder="Contact no."  class="form-control" style="font-size:13px;" />
      <input v-model="email"   type="email" placeholder="Email"        class="form-control" style="font-size:13px;" />
    </div>
  </div>
</template>
