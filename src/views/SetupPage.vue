<script setup>
import { ref } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';

const store = useAppStore();
const { toast } = useToast();

const connectStatus = ref('');
const connectOk     = ref(false);
const pushStatus    = ref('');
const pushing       = ref(false);

const urlInput = ref(store.scriptUrl || '');

async function connectSheet() {
  const url = urlInput.value.trim();
  if (!url) { connectStatus.value = 'Enter a valid Apps Script URL.'; connectOk.value = false; return; }
  connectStatus.value = 'Connecting…';
  connectOk.value = false;
  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'init' }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    store.scriptUrl = url;
    localStorage.setItem('kt_url', url);
    connectOk.value    = true;
    connectStatus.value = 'Connected! Sheets initialized.';
    toast('Google Sheets connected!', 'success');
  } catch (err) {
    connectStatus.value = 'Failed: ' + (err.message || 'Could not reach the script URL.');
    connectOk.value = false;
  }
}

async function pushPost(action, payload) {
  const res = await fetch(store.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

async function pushAll() {
  if (!store.scriptUrl) { toast('Connect Google Sheets first', 'error'); return; }
  pushing.value = true;
  pushStatus.value = 'Pushing master list…';
  try {
    const productRows = store.masterList.map(p => [
      ik(p), p.category, p.name, p.ram || '', p.storage || '',
      p.colors || '', p.unitPrice, p.srp, p.obsolete ? 'Obsolete' : 'Active',
    ]);
    await pushPost('pushMasterList', { rows: productRows });

    pushStatus.value = 'Pushing inventory…';
    const invRows = store.masterList.map(p => [
      p.category, p.name, p.ram || '', p.storage || '', p.colors || '',
      p.unitPrice, p.srp,
      (store.inventory[ik(p)] || {}).stock || 0,
      (store.inventory[ik(p)] || {}).reorder || 1,
    ]);
    await pushPost('pushInventory', { rows: invRows });

    pushStatus.value = 'Done!';
    toast('All data pushed to Google Sheets!', 'success');
  } catch (err) {
    pushStatus.value = 'Error: ' + (err.message || 'Push failed');
    toast('Push failed — check your connection', 'error');
  } finally {
    pushing.value = false;
  }
}

const SCRIPT_SOURCE = `// Khonsu Tech Operations — Apps Script Backend
// Paste this into a new Google Apps Script project (script.google.com),
// then deploy as Web App (Execute as: Me, Who has access: Anyone).

const SS = SpreadsheetApp.getActiveSpreadsheet();

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'init')                return initSheets();
    if (d.action === 'logSale')             return logSale(d);
    if (d.action === 'logPO')               return logPO(d);
    if (d.action === 'pushInventory')       return pushInventory(d);
    if (d.action === 'pushMasterList')      return pushMasterList(d);
    if (d.action === 'logPayment')          return logPayment(d);
    if (d.action === 'updatePaymentStatus') return updatePaymentStatus(d);
    return respond({ error: 'Unknown action' });
  } catch (err) { return respond({ error: err.toString() }); }
}

function doGet(e) {
  if (e.parameter.action === 'ping')             return respond({ status: 'ok' });
  if (e.parameter.action === 'getMasterList')    return getMasterList();
  if (e.parameter.action === 'getSales')         return getSales();
  if (e.parameter.action === 'getPaymentLogs')   return getPaymentLogs();
  return respond({ status: 'Khonsu Tech OPS running' });
}

function getSales() {
  const sh = SS.getSheetByName('Sales Log');
  if (!sh) return respond({ sales: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ sales: [] });
  // Column order matches initSheets + logSale:
  // 0:Date 1:SO/Bundle 2:Item 3:Variant 4:Color 5:Qty 6:UnitPrice 7:SRP
  // 8:SoldPrice 9:PasaPrice 10:Discount 11:NetSales 12:Payment 13:SoldType 14:Promoter 15:Staff
  const sales = data.slice(1).map(function(r) {
    var d = r[0];
    return {
      Date:      d instanceof Date ? d.toISOString() : String(d),
      SO:        String(r[1] || ''),
      ItemName:  String(r[2] || ''),
      Variant:   String(r[3] || ''),
      Color:     String(r[4] || ''),
      Qty:       Number(r[5]) || 0,
      SoldPrice: Number(r[8]) || 0,
      NetSales:  Number(r[11]) || 0,
      Payment:   String(r[12] || ''),
      Staff:     String(r[15] || ''),
    };
  });
  return respond({ sales: sales });
}

function getMasterList() {
  const sh = SS.getSheetByName('Master List') || SS.getSheetByName('Inventory');
  if (!sh) return respond({ error: 'No Master List sheet found' });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ rows: [] });
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return respond({ rows });
}

function initSheets() {
  const tabs = {
    'Sales Log': ['Date','Bundle','Item','Variant','Color','Qty','Unit Price','SRP',
                  'Sold Price','Pasa Price','Discount','Net Sales','Payment','Sold Type','Promoter','Staff'],
    'Inventory': ['Category','Model','RAM','Storage','Colors','Unit Price','SRP','Stock','Reorder Point'],
    'Purchase Orders': ['PO Number','Date','Supplier','Items','Quantities','Status','Approver'],
    'Payment Logs': ['ID','Date','Store','Method','Amount','Reference','Staff','Origin','Notes','Status','Credited Date','Credited By']
  };
  Object.entries(tabs).forEach(([name, headers]) => {
    let sh = SS.getSheetByName(name);
    if (!sh) sh = SS.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold').setBackground('#1b2e6b').setFontColor('white');
    }
  });
  return respond({ status: 'Initialized' });
}

function logSale(d) {
  const sh  = SS.getSheetByName('Sales Log');
  const inv = SS.getSheetByName('Inventory');
  const rows = d.rows || [];
  rows.forEach(r => {
    sh.appendRow([d.date, r.so || r.bundle || '', r.itemName, r.variant || '', r.color || '',
      r.qty, r.unitPrice, r.srp, r.soldPrice, r.pasaPrice || 0,
      r.discount || 0, r.netSales || 0, r.payment, r.soldType, r.promoter || '', r.staff]);
  });
  if (inv) {
    const data = inv.getDataRange().getValues();
    rows.forEach(r => {
      for (let i = 1; i < data.length; i++) {
        const k = data[i][1] + (data[i][2] ? ' ' + data[i][2] : '') + (data[i][3] ? '/' + data[i][3] : '');
        if (k.trim() === (r.productKey || '').trim()) {
          inv.getRange(i + 1, 8).setValue(Math.max(0, Number(data[i][7]) - r.qty));
          break;
        }
      }
    });
  }
  return respond({ status: 'Sale logged', count: rows.length });
}

function logPO(d) {
  const sh    = SS.getSheetByName('Purchase Orders');
  const items = (d.items || []).map(i => i.name).join(', ');
  const qtys  = (d.items || []).map(i => i.qty).join(', ');
  sh.appendRow([d.id, d.date, d.supplier, items, qtys, d.status || 'Pending', d.approver]);
  return respond({ status: 'PO logged' });
}

function pushInventory(d) {
  const sh = SS.getSheetByName('Inventory');
  if (!sh) return respond({ error: 'No Inventory sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Pushed', count: (d.rows || []).length });
}

function pushMasterList(d) {
  let sh = SS.getSheetByName('Master List');
  if (!sh) {
    sh = SS.insertSheet('Master List');
    sh.appendRow(['Key','Category','Model','RAM','Storage','Colors','Unit Price','SRP','Status']);
    sh.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#1b2e6b').setFontColor('white');
  }
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Master List pushed', count: (d.rows || []).length });
}

function logPayment(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  sh.appendRow([d.id, d.date, d.store, d.method, d.amount || 0, d.reference || '',
    d.staff || '', d.origin || 'manual', d.notes || '', d.status || 'pending',
    d.creditedDate || '', d.creditedBy || '']);
  return respond({ status: 'Payment logged' });
}

function updatePaymentStatus(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 10).setValue(d.status || 'pending');
      sh.getRange(i + 1, 11).setValue(d.creditedDate || '');
      sh.getRange(i + 1, 12).setValue(d.creditedBy || '');
      break;
    }
  }
  return respond({ status: 'Payment status updated' });
}

function getPaymentLogs() {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ logs: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ logs: [] });
  const logs = data.slice(1).map(function(r) {
    var d = r[1];
    return {
      ID: String(r[0] || ''),
      Date: d instanceof Date ? d.toISOString() : String(d || ''),
      Store: String(r[2] || ''),
      Method: String(r[3] || ''),
      Amount: Number(r[4]) || 0,
      Reference: String(r[5] || ''),
      Staff: String(r[6] || ''),
      Origin: String(r[7] || ''),
      Notes: String(r[8] || ''),
      Status: String(r[9] || 'pending'),
      CreditedDate: String(r[10] || ''),
      CreditedBy: String(r[11] || ''),
    };
  });
  return respond({ logs: logs });
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

async function copyScript() {
  try {
    await navigator.clipboard.writeText(SCRIPT_SOURCE);
    toast('Script copied to clipboard!', 'success');
  } catch {
    toast('Copy failed — select and copy manually', 'error');
  }
}
</script>

<template>
  <div>
    <h2 style="font-size:20px;font-weight:800;margin-bottom:20px;">Setup</h2>

    <!-- Step 1 -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">1</div>
        <h3 style="font-size:15px;font-weight:700;margin:0;">Create a Google Spreadsheet</h3>
      </div>
      <p style="font-size:13px;color:var(--muted);margin:0;line-height:1.7;">
        Go to <strong style="color:var(--text);">sheets.new</strong> and create a new spreadsheet. Name it anything (e.g. <em>Khonsu Sales</em>). Keep it open.
      </p>
    </div>

    <!-- Step 2 -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">2</div>
        <div>
          <h3 style="font-size:15px;font-weight:700;margin:0 0 6px;">Add the Apps Script</h3>
          <p style="font-size:13px;color:var(--muted);margin:0;line-height:1.7;">
            In your spreadsheet open <strong style="color:var(--text);">Extensions → Apps Script</strong>. Delete any default code, paste the script below, and save.
            Then choose <strong style="color:var(--text);">Deploy → New Deployment → Web App</strong>. Set <em>Execute as:</em> <strong>Me</strong>, <em>Who has access:</em> <strong>Anyone</strong>. Copy the deployment URL.
          </p>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:5px;" @click="copyScript">
          <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;" aria-hidden="true"><use href="#ic-copy"/></svg>
          Copy Script
        </button>
      </div>
      <pre style="background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:14px;font-family:'JetBrains Mono',monospace;font-size:11px;overflow-x:auto;max-height:300px;overflow-y:auto;color:var(--text);white-space:pre;line-height:1.6;margin:0;tab-size:2;">{{ SCRIPT_SOURCE }}</pre>
    </div>

    <!-- Step 3 -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">3</div>
        <h3 style="font-size:15px;font-weight:700;margin:0;">Connect</h3>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
        <input
          v-model="urlInput"
          type="url"
          placeholder="https://script.google.com/macros/s/…"
          style="flex:1;min-width:0;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);outline:none;"
        />
        <button class="btn btn-primary" style="white-space:nowrap;" @click="connectSheet">Connect</button>
      </div>
      <p v-if="connectStatus" :style="{ color: connectOk ? 'var(--green)' : 'var(--red)', fontSize: '13px', margin: 0 }">{{ connectStatus }}</p>
      <p v-else-if="store.scriptUrl" style="font-size:13px;color:var(--green);margin:0;">
        ✓ Connected — {{ store.scriptUrl.length > 60 ? store.scriptUrl.slice(0, 60) + '…' : store.scriptUrl }}
      </p>
    </div>

    <!-- Step 4 -->
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">4</div>
        <h3 style="font-size:15px;font-weight:700;margin:0;">Push All Data</h3>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.7;">
        Pushes your master list and inventory to Google Sheets. Run this after first connecting, or whenever you want to overwrite Sheets with local data.
      </p>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <button class="btn btn-success" :disabled="pushing || !store.scriptUrl" @click="pushAll">
          {{ pushing ? 'Pushing…' : 'Push All Data' }}
        </button>
        <span v-if="pushStatus" style="font-size:13px;color:var(--muted);">{{ pushStatus }}</span>
      </div>
    </div>
  </div>
</template>
