import { state } from './state.js';
import { toast } from './toast.js';
import { buildCatFilter, renderProducts } from './products.js';
import { syncPricingFromSheet, syncInventoryFromSheet } from './setup.js';
import { showPage, showS } from './nav.js';

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

window.login = login;
window.logout = logout;
