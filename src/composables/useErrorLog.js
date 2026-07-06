import { useAppStore } from '@/stores/state.js';
import { useToast } from '@/composables/useToast.js';

// Intentionally does NOT import from useSync.js (tryPush/enqueue) — useSync.js
// calls into this module on sync failures, so importing back would create a
// circular dependency. Pushes here are one-shot/best-effort instead of
// queued: the local copy is always saved regardless, and pushAllIssueLogs()
// is the manual recovery valve if a push never lands.
async function pushIssueEntry(entry) {
  const store = useAppStore();
  if (!store.scriptUrl) return;
  try {
    await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      // Explicit fields, not a spread — entry.action (the sync action name, e.g.
      // 'savePromotions') would otherwise collide with and overwrite the
      // dispatch-level 'logIssue' action key. Sent under issueAction instead.
      body: JSON.stringify({
        action: 'logIssue',
        id: entry.id,
        date: entry.date,
        lastSeen: entry.lastSeen,
        type: entry.type,
        issueAction: entry.action,
        queueId: entry.queueId,
        message: entry.message,
        context: entry.context,
        attempts: entry.attempts,
        status: entry.status,
        resolvedDate: entry.resolvedDate,
        resolvedBy: entry.resolvedBy,
      }),
    });
  } catch { /* best-effort only */ }
}

async function pushIssueStatus(entry) {
  const store = useAppStore();
  if (!store.scriptUrl) return;
  try {
    await fetch(store.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'updateIssueStatus', id: entry.id, status: entry.status,
        resolvedDate: entry.resolvedDate, resolvedBy: entry.resolvedBy,
      }),
    });
  } catch { /* best-effort only */ }
}

export function useErrorLog() {
  const store = useAppStore();
  const { toast } = useToast();

  // Sync failures: upserted by queueId so a retried failure updates the
  // existing entry (attempts/lastSeen) instead of spamming a new one.
  function logSyncIssue({ queueId, action, message, payload }) {
    const existing = queueId ? store.errorLogs.find(e => e.queueId === queueId && e.status === 'open') : null;
    if (existing) {
      existing.message  = message || existing.message;
      existing.attempts = (existing.attempts || 1) + 1;
      existing.lastSeen = new Date().toISOString();
      store.saveErrorLogs();
      pushIssueEntry(existing);
      return existing;
    }
    const now = new Date().toISOString();
    const entry = {
      id: 'ERR-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: now,
      lastSeen: now,
      type: 'sync',
      action: action || '',
      queueId: queueId || null,
      message: message || 'Unknown sync error',
      context: payload ? JSON.stringify(payload).slice(0, 500) : '',
      attempts: 1,
      status: 'open',
      resolvedDate: null,
      resolvedBy: null,
    };
    store.errorLogs.unshift(entry);
    store.saveErrorLogs();
    pushIssueEntry(entry);
    return entry;
  }

  function logRuntimeError(message, context) {
    const now = new Date().toISOString();
    const entry = {
      id: 'ERR-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: now,
      lastSeen: now,
      type: 'runtime',
      action: '',
      queueId: null,
      message: message || 'Unknown error',
      context: context || '',
      attempts: 1,
      status: 'open',
      resolvedDate: null,
      resolvedBy: null,
    };
    store.errorLogs.unshift(entry);
    store.saveErrorLogs();
    pushIssueEntry(entry);
    return entry;
  }

  function markResolved(id) {
    const entry = store.errorLogs.find(e => e.id === id);
    if (!entry) return;
    entry.status = 'resolved';
    entry.resolvedDate = new Date().toISOString();
    entry.resolvedBy = store.currentUser;
    store.saveErrorLogs();
    pushIssueStatus(entry);
    toast('Issue marked as resolved', 'success');
  }

  function markUnresolved(id) {
    const entry = store.errorLogs.find(e => e.id === id);
    if (!entry) return;
    entry.status = 'open';
    entry.resolvedDate = null;
    entry.resolvedBy = null;
    store.saveErrorLogs();
    pushIssueStatus(entry);
    toast('Issue reopened', 'success');
  }

  async function pushAllIssueLogs() {
    if (!store.scriptUrl) { toast('Connect Google Sheets first in Setup', 'error'); return false; }
    const rows = store.errorLogs.map(e => ([
      e.id, e.date, e.lastSeen, e.type, e.action || '', e.queueId || '',
      e.message || '', e.context || '', e.attempts || 1,
      e.status || 'open', e.resolvedDate || '', e.resolvedBy || '',
    ]));
    try {
      const res  = await fetch(store.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'pushIssueLogs', rows }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast('Pushed ' + rows.length + ' issue log(s) to Sheets', 'success');
      return true;
    } catch (e) {
      toast('Push failed: ' + (e.message || 'check connection'), 'error');
      return false;
    }
  }

  async function pullIssueLogs() {
    if (!store.scriptUrl || store.syncQueue.length) return;
    try {
      const res  = await fetch(store.scriptUrl + '?action=getIssueLogs');
      const json = await res.json();
      if (json.error || !json.issues) return;
      const byId = new Map(store.errorLogs.map(e => [e.id, e]));
      json.issues.forEach(r => {
        const id = String(r.ID || '');
        if (!id) return;
        byId.set(id, {
          id,
          date: String(r.Date || ''),
          lastSeen: String(r.LastSeen || r.Date || ''),
          type: String(r.Type || 'runtime'),
          action: String(r.Action || ''),
          queueId: r.QueueID ? String(r.QueueID) : null,
          message: String(r.Message || ''),
          context: String(r.Context || ''),
          attempts: Number(r.Attempts) || 1,
          status: String(r.Status || 'open'),
          resolvedDate: r.ResolvedDate ? String(r.ResolvedDate) : null,
          resolvedBy: r.ResolvedBy ? String(r.ResolvedBy) : null,
        });
      });
      store.errorLogs = Array.from(byId.values()).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      store.saveErrorLogs();
    } catch { /* non-critical */ }
  }

  return { logSyncIssue, logRuntimeError, markResolved, markUnresolved, pushAllIssueLogs, pullIssueLogs };
}

// Global safety net: catch uncaught runtime errors app-wide so they surface
// to Admin as investigable issues, not just the browser console.
window.addEventListener('error', (e) => {
  useErrorLog().logRuntimeError(e.message || 'Unknown error', (e.filename || '') + ':' + (e.lineno || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  useErrorLog().logRuntimeError((reason && reason.message) || String(reason), 'unhandledrejection');
});
