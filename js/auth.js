import { state } from './state.js';
import { toast } from './toast.js';
import { buildCatFilter, renderProducts } from './products.js';
import { syncPricingFromSheet, syncInventoryFromSheet } from './setup.js';
import { showPage, showS } from './nav.js';

const DEFAULT_PIN = '1234';
const PIN_KEY = 'kt_pin';

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getStoredHash() {
  return localStorage.getItem(PIN_KEY) || await hashPin(DEFAULT_PIN);
}

export function login(user) {
  state.currentUser = user;
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('userPill').textContent = '👤 ' + user + ' — Switch';
  const adminTabs = ['tab-inventory', 'tab-po', 'tab-ml', 'tab-settings', 'tab-setup'];
  adminTabs.forEach(id => {
    document.getElementById(id).style.display = user === 'Admin' ? '' : 'none';
  });
  buildCatFilter();
  renderProducts();
  if (state.scriptUrl) {
    setTimeout(() => {
      syncPricingFromSheet().catch(() => {});
      syncInventoryFromSheet().catch(() => {});
    }, 800);
  }
  toast('Welcome, ' + user + '!', 'success');
}

export function logout() {
  state.currentUser = null;
  document.getElementById('lockScreen').style.display = 'flex';
  showPage('sales', null);
  showS('picker');
}

export function promptAdminPin() {
  const modal = document.getElementById('pinModal');
  const input = document.getElementById('pinInput');
  modal.style.display = 'flex';
  input.value = '';
  document.getElementById('pinError').textContent = '';
  setTimeout(() => input.focus(), 50);
}

export function closePinModal() {
  document.getElementById('pinModal').style.display = 'none';
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
}

export async function submitAdminPin() {
  const input = document.getElementById('pinInput');
  const pin = input.value.trim();
  if (!pin) return;
  const entered = await hashPin(pin);
  const stored = await getStoredHash();
  if (entered === stored) {
    closePinModal();
    login('Admin');
  } else {
    document.getElementById('pinError').textContent = 'Incorrect PIN. Try again.';
    input.value = '';
    input.focus();
  }
}

export async function changeAdminPin() {
  const current = document.getElementById('pin-current').value.trim();
  const next = document.getElementById('pin-new').value.trim();
  const confirm = document.getElementById('pin-confirm').value.trim();
  const statusEl = document.getElementById('pinChangeStatus');

  if (!current || !next || !confirm) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'All fields are required.';
    return;
  }
  if (next.length < 4) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'New PIN must be at least 4 digits.';
    return;
  }
  if (next !== confirm) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'New PIN and confirmation do not match.';
    return;
  }
  const currentHash = await hashPin(current);
  const storedHash = await getStoredHash();
  if (currentHash !== storedHash) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Current PIN is incorrect.';
    return;
  }
  const newHash = await hashPin(next);
  localStorage.setItem(PIN_KEY, newHash);
  document.getElementById('pin-current').value = '';
  document.getElementById('pin-new').value = '';
  document.getElementById('pin-confirm').value = '';
  statusEl.style.color = 'var(--green)';
  statusEl.textContent = 'PIN updated successfully.';
  toast('Admin PIN updated!', 'success');
}

window.login = login;
window.logout = logout;
window.promptAdminPin = promptAdminPin;
window.closePinModal = closePinModal;
window.submitAdminPin = submitAdminPin;
window.changeAdminPin = changeAdminPin;
