import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush } from '@/composables/useSync.js';

export function useTimeLog() {
  const store = useAppStore();
  const { toast } = useToast();

  function clockIn(user) {
    const entry = {
      id: 'TL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      user,
      clockIn: new Date().toISOString(),
      clockOut: null,
      origin: 'auto',
      notes: '',
      correctedBy: null,
      correctedAt: null,
    };
    store.timeLogs.unshift(entry);
    store.saveTimeLogs();
    tryPush('clockIn', { id: entry.id, user, clockIn: entry.clockIn });
    return entry;
  }

  // The server does its own lookup (most recent open row for this user) rather
  // than relying on a client-remembered "current entry id" — that way logging
  // out still finalizes the right row even if the open entry was opened on a
  // different device, or this device's local copy was cleared.
  function clockOut(user) {
    const clockOutTime = new Date().toISOString();
    const entry = store.timeLogs.find(t => t.user === user && !t.clockOut);
    if (entry) {
      entry.clockOut = clockOutTime;
      store.saveTimeLogs();
    }
    tryPush('clockOut', { user, clockOut: clockOutTime });
  }

  function addManualEntry({ user, clockIn, clockOut, notes = '' }) {
    if (!user || !clockIn) { toast('Enter a staff name and clock-in time', 'error'); return false; }
    const entry = {
      id: 'TL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      user,
      clockIn: new Date(clockIn).toISOString(),
      clockOut: clockOut ? new Date(clockOut).toISOString() : null,
      origin: 'manual',
      notes,
      correctedBy: null,
      correctedAt: null,
    };
    store.timeLogs.unshift(entry);
    store.saveTimeLogs();
    tryPush('addTimeLog', { ...entry });
    toast('Time entry added', 'success');
    return true;
  }

  function editEntry(id, { clockIn, clockOut, notes = '' }) {
    const entry = store.timeLogs.find(t => t.id === id);
    if (!entry) return false;
    if (!clockIn) { toast('Clock-in time is required', 'error'); return false; }
    entry.clockIn      = new Date(clockIn).toISOString();
    entry.clockOut     = clockOut ? new Date(clockOut).toISOString() : null;
    entry.notes        = notes;
    entry.correctedBy  = 'Admin';
    entry.correctedAt  = new Date().toISOString();
    store.saveTimeLogs();
    tryPush('editTimeLog', {
      id, clockIn: entry.clockIn, clockOut: entry.clockOut || '', notes: entry.notes,
      correctedBy: entry.correctedBy, correctedAt: entry.correctedAt,
    });
    toast('Time entry updated', 'success');
    return true;
  }

  function removeEntry(id) {
    store.timeLogs = store.timeLogs.filter(t => t.id !== id);
    store.saveTimeLogs();
    tryPush('deleteTimeLog', { id });
  }

  async function pushAllTimeLogs() {
    if (!store.scriptUrl) { toast('Connect Google Sheets first in Setup', 'error'); return false; }
    const rows = store.timeLogs.map(t => ([
      t.id, t.user, t.clockIn, '', t.clockOut || '', '',
      t.origin || 'auto', t.notes || '', t.correctedBy || '', t.correctedAt || '',
    ]));
    try {
      const res  = await fetch(store.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'pushTimeLogs', rows }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast('Pushed ' + rows.length + ' time log entr(y/ies) to Sheets', 'success');
      return true;
    } catch (e) {
      toast('Push failed: ' + (e.message || 'check connection'), 'error');
      return false;
    }
  }

  async function pullTimeLogs() {
    if (!store.scriptUrl || store.syncQueue.length) return;
    try {
      const res  = await fetch(store.scriptUrl + '?action=getTimeLogs');
      const json = await res.json();
      if (json.error || !json.logs) return;
      const byId = new Map(store.timeLogs.map(t => [t.id, t]));
      json.logs.forEach(r => {
        const id = String(r.ID || '');
        if (!id) return;
        byId.set(id, {
          id,
          user: String(r.User || ''),
          clockIn: String(r.ClockIn || ''),
          clockOut: r.ClockOut ? String(r.ClockOut) : null,
          origin: String(r.Origin || 'auto'),
          notes: String(r.Notes || ''),
          correctedBy: r.CorrectedBy ? String(r.CorrectedBy) : null,
          correctedAt: r.CorrectedAt ? String(r.CorrectedAt) : null,
        });
      });
      store.timeLogs = Array.from(byId.values()).sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      store.saveTimeLogs();
    } catch { /* non-critical */ }
  }

  return {
    clockIn, clockOut, addManualEntry, editEntry, removeEntry,
    pullTimeLogs, pushAllTimeLogs,
  };
}
