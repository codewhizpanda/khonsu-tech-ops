import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush } from '@/composables/useSync.js';

// Payment methods available for Bisen's Maya terminal (card/QRPh acceptance).
export const BISEN_METHODS = ['Maya - Card', 'Maya - QRPh'];
// Payment methods available for ITEL's own non-cash sales.
export const ITEL_METHODS = ['Card', 'Home Credit'];

export function usePaymentLogs() {
  const store = useAppStore();
  const { toast } = useToast();

  function addPaymentLog({ storeName, method, amount, reference = '', soNumber = '', notes = '', origin = 'manual' }) {
    const entry = {
      id: 'PL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      store: storeName,
      method,
      amount: Number(amount) || 0,
      reference,
      soNumber,
      notes,
      staff: store.currentUser,
      origin,
      status: 'pending',
      creditedDate: null,
      creditedBy: null,
      settledDate: null,
      settledBy: null,
    };
    store.paymentLogs.unshift(entry);
    store.savePaymentLogs();
    tryPush('logPayment', { ...entry });
    return entry;
  }

  // Auto-derive one log per non-cash payment method used in a confirmed ITEL sale.
  // cardRef is the optional Terminal Txn ID staff entered on the Review Sale screen —
  // it only ever attaches to the 'Card' group, since that's the only method it's collected for.
  function logSalePayments(so, rows, cardRef = '') {
    const groups = {};
    rows.forEach(r => {
      if (!r.payment || r.payment === 'Cash') return;
      const amt = (r.soldPrice || 0) * (r.qty || 0);
      groups[r.payment] = (groups[r.payment] || 0) + amt;
    });
    Object.entries(groups).forEach(([method, amount]) => {
      if (amount > 0) {
        addPaymentLog({
          storeName: 'ITEL', method, amount, soNumber: so,
          reference: method === 'Card' ? cardRef : '',
          origin: 'auto',
        });
      }
    });
  }

  function addBisenLog({ method, amount, reference, notes }) {
    if (!method || !(Number(amount) > 0) || !(reference || '').trim()) {
      toast('Enter a payment method, amount, and reference', 'error');
      return false;
    }
    addPaymentLog({ storeName: 'Bisen', method, amount, reference, notes, origin: 'manual' });
    toast('Payment log added', 'success');
    return true;
  }

  // Pushes the full status/credited/settled state for a log entry, so the sheet
  // always mirrors exactly what's stored locally — avoids partial-update bugs
  // where an old settledDate/settledBy lingers after a status change.
  function pushStatus(log) {
    tryPush('updatePaymentStatus', {
      id: log.id, status: log.status,
      creditedDate: log.creditedDate, creditedBy: log.creditedBy,
      settledDate: log.settledDate, settledBy: log.settledBy,
    });
  }

  function markCredited(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return;
    log.status = 'credited';
    log.creditedDate = new Date().toISOString();
    log.creditedBy = store.currentUser;
    store.savePaymentLogs();
    pushStatus(log);
    toast('Marked as credited', 'success');
  }

  function revertPending(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return;
    log.status = 'pending';
    log.creditedDate = null;
    log.creditedBy = null;
    log.settledDate = null;
    log.settledBy = null;
    store.savePaymentLogs();
    pushStatus(log);
    toast('Reverted to pending', 'success');
  }

  // Bisen's Maya terminal proceeds double as Accounts Payable — money ITEL is
  // holding on Bisen's behalf. Settling only makes sense once Admin has already
  // confirmed the funds landed (status 'credited'); this is the step that
  // actually reduces the outstanding AP balance once cash has been paid out.
  function settlePayment(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return;
    if (log.store !== 'Bisen' || log.status !== 'credited') {
      toast('Only a credited Bisen payment can be settled', 'error');
      return;
    }
    log.status = 'settled';
    log.settledDate = new Date().toISOString();
    log.settledBy = store.currentUser;
    store.savePaymentLogs();
    pushStatus(log);
    toast('Payment settled to Bisen', 'success');
  }

  function revertToCredited(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log || log.status !== 'settled') return;
    log.status = 'credited';
    log.settledDate = null;
    log.settledBy = null;
    store.savePaymentLogs();
    pushStatus(log);
    toast('Reverted to credited', 'success');
  }

  function editLog(id, { storeName, method, amount, reference = '', notes = '' }) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return false;
    if (!storeName || !method || !(Number(amount) > 0)) { toast('Enter a store, method and amount', 'error'); return false; }
    if (storeName === 'Bisen' && !reference.trim()) { toast('Enter a reference for a Bisen entry', 'error'); return false; }
    log.store     = storeName;
    log.method    = method;
    log.amount    = Number(amount) || 0;
    log.reference = reference;
    log.notes     = notes;
    store.savePaymentLogs();
    tryPush('editPaymentLog', { id, store: log.store, method: log.method, amount: log.amount, reference: log.reference, notes: log.notes });
    toast('Payment log updated', 'success');
    return true;
  }

  function removeLog(id) {
    store.paymentLogs = store.paymentLogs.filter(p => p.id !== id);
    store.savePaymentLogs();
    tryPush('deletePaymentLog', { id });
  }

  // Force-overwrites the Payment Logs sheet with everything currently in local storage.
  // Recovery valve for entries that were created locally but never made it to Sheets
  // (e.g. a stale Apps Script deployment silently rejected them).
  async function pushAllPaymentLogs() {
    if (!store.scriptUrl) { toast('Connect Google Sheets first in Setup', 'error'); return false; }
    const rows = store.paymentLogs.map(l => ([
      l.id, l.date, l.store, l.method, l.amount, l.reference || '',
      l.staff || '', l.origin || 'manual', l.notes || '', l.status || 'pending',
      l.creditedDate || '', l.creditedBy || '', l.settledDate || '', l.settledBy || '',
      l.soNumber || '',
    ]));
    try {
      const res  = await fetch(store.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'pushPaymentLogs', rows }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast('Pushed ' + rows.length + ' payment log(s) to Sheets', 'success');
      return true;
    } catch (e) {
      toast('Push failed: ' + (e.message || 'check connection'), 'error');
      return false;
    }
  }

  // Merge in entries logged from other devices, so Admin can see/reconcile everything.
  // Skipped while the offline queue is non-empty, to avoid clobbering un-synced local edits.
  async function pullPaymentLogs() {
    if (!store.scriptUrl || store.syncQueue.length) return;
    try {
      const res  = await fetch(store.scriptUrl + '?action=getPaymentLogs');
      const json = await res.json();
      if (json.error || !json.logs) return;
      const byId = new Map(store.paymentLogs.map(p => [p.id, p]));
      json.logs.forEach(r => {
        const id = String(r.ID || '');
        if (!id) return;
        byId.set(id, {
          id,
          date: String(r.Date || ''),
          store: String(r.Store || ''),
          method: String(r.Method || ''),
          amount: Number(r.Amount) || 0,
          reference: String(r.Reference || ''),
          soNumber: String(r.SONumber || ''),
          notes: String(r.Notes || ''),
          staff: String(r.Staff || ''),
          origin: String(r.Origin || 'manual'),
          status: String(r.Status || 'pending'),
          creditedDate: r.CreditedDate ? String(r.CreditedDate) : null,
          creditedBy: r.CreditedBy ? String(r.CreditedBy) : null,
          settledDate: r.SettledDate ? String(r.SettledDate) : null,
          settledBy: r.SettledBy ? String(r.SettledBy) : null,
        });
      });
      store.paymentLogs = Array.from(byId.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
      store.savePaymentLogs();
    } catch { /* non-critical */ }
  }

  return {
    addPaymentLog, logSalePayments, addBisenLog, editLog,
    markCredited, revertPending, settlePayment, revertToCredited,
    removeLog, pullPaymentLogs, pushAllPaymentLogs,
  };
}
