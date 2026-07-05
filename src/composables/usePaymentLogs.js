import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush } from '@/composables/useSync.js';

// Payment methods available for Bisen's Maya terminal (card/QRPh acceptance).
export const BISEN_METHODS = ['Maya - Card', 'Maya - QRPh'];

export function usePaymentLogs() {
  const store = useAppStore();
  const { toast } = useToast();

  function addPaymentLog({ storeName, method, amount, reference = '', notes = '', origin = 'manual' }) {
    const entry = {
      id: 'PL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      store: storeName,
      method,
      amount: Number(amount) || 0,
      reference,
      notes,
      staff: store.currentUser,
      origin,
      status: 'pending',
      creditedDate: null,
      creditedBy: null,
    };
    store.paymentLogs.unshift(entry);
    store.savePaymentLogs();
    tryPush('logPayment', { ...entry });
    return entry;
  }

  // Auto-derive one log per non-cash payment method used in a confirmed ITEL sale.
  function logSalePayments(so, rows) {
    const groups = {};
    rows.forEach(r => {
      if (!r.payment || r.payment === 'Cash') return;
      const amt = (r.soldPrice || 0) * (r.qty || 0);
      groups[r.payment] = (groups[r.payment] || 0) + amt;
    });
    Object.entries(groups).forEach(([method, amount]) => {
      if (amount > 0) addPaymentLog({ storeName: 'ITEL', method, amount, reference: so, origin: 'auto' });
    });
  }

  function addBisenLog({ method, amount, reference, notes }) {
    if (!method || !(Number(amount) > 0)) { toast('Enter a payment method and amount', 'error'); return false; }
    addPaymentLog({ storeName: 'Bisen', method, amount, reference, notes, origin: 'manual' });
    toast('Payment log added', 'success');
    return true;
  }

  function markCredited(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return;
    log.status = 'credited';
    log.creditedDate = new Date().toISOString();
    log.creditedBy = store.currentUser;
    store.savePaymentLogs();
    tryPush('updatePaymentStatus', { id, status: 'credited', creditedDate: log.creditedDate, creditedBy: log.creditedBy });
    toast('Marked as credited', 'success');
  }

  function revertPending(id) {
    const log = store.paymentLogs.find(p => p.id === id);
    if (!log) return;
    log.status = 'pending';
    log.creditedDate = null;
    log.creditedBy = null;
    store.savePaymentLogs();
    tryPush('updatePaymentStatus', { id, status: 'pending', creditedDate: null, creditedBy: null });
    toast('Reverted to pending', 'success');
  }

  function removeLog(id) {
    store.paymentLogs = store.paymentLogs.filter(p => p.id !== id);
    store.savePaymentLogs();
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
          notes: String(r.Notes || ''),
          staff: String(r.Staff || ''),
          origin: String(r.Origin || 'manual'),
          status: String(r.Status || 'pending'),
          creditedDate: r.CreditedDate ? String(r.CreditedDate) : null,
          creditedBy: r.CreditedBy ? String(r.CreditedBy) : null,
        });
      });
      store.paymentLogs = Array.from(byId.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
      store.savePaymentLogs();
    } catch { /* non-critical */ }
  }

  return { addPaymentLog, logSalePayments, addBisenLog, markCredited, revertPending, removeLog, pullPaymentLogs };
}
