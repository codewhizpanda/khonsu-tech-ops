<script setup>
import { ref } from 'vue';
import { useAppStore } from '@/stores/state.js';
import { ik } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { pullFromSheets, pullUnits } from '@/composables/useSync.js';

const store = useAppStore();
const { toast } = useToast();

const connectStatus = ref('');
const connectOk     = ref(false);
const pushStatus    = ref('');
const pushing       = ref(false);
const pullStatus    = ref('');
const pulling       = ref(false);

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

    pushStatus.value = 'Pushing promotions…';
    await pushPost('savePromotions', { bundles: store.predefinedBundles });

    pushStatus.value = 'Pushing freebies…';
    const freebies = Object.entries(store.productFreebies).map(([mainKey, freebieKey]) => {
      const mp = store.masterList.find(p => ik(p) === mainKey);
      const fp = store.masterList.find(p => ik(p) === freebieKey);
      return { mainKey, freebieKey, mainName: mp?.name || '', freebieName: fp?.name || '' };
    });
    await pushPost('saveFreebies', { freebies });

    pushStatus.value = 'Pushing settings…';
    await pushPost('saveSettings', {
      settings: {
        DailyTarget:       store.settings.dailyTarget,
        LowStockThreshold: store.settings.lowStockThreshold,
        GlobalReorder:     store.settings.globalReorder,
        PasaCapEnabled:    store.settings.pasaCapEnabled,
      },
    });

    pushStatus.value = 'Done!';
    toast('All data pushed to Google Sheets!', 'success');
  } catch (err) {
    pushStatus.value = 'Error: ' + (err.message || 'Push failed');
    toast('Push failed — check your connection', 'error');
  } finally {
    pushing.value = false;
  }
}

// Manual "pull latest data" — for when data was loaded or edited directly in
// the Sheet (e.g. bulk-entering real IMEIs into the Units tab for an initial
// stocktake, or correcting Master List prices) and you don't want to wait for
// the next login's automatic pull. Guarded the same way the automatic pull
// is: skipped while the offline queue is non-empty, so a manual pull can't
// clobber local edits that haven't reached Sheets yet.
async function pullAll() {
  if (!store.scriptUrl) { toast('Connect Google Sheets first', 'error'); return; }
  if (store.syncQueue.length) {
    pullStatus.value = 'You have unsynced local changes — Sync Now (top banner) first, then pull.';
    return;
  }
  pulling.value = true;
  pullStatus.value = 'Pulling master list, inventory, and settings…';
  try {
    await pullFromSheets();
    pullStatus.value = 'Pulling IMEI units…';
    await pullUnits();
    pullStatus.value = 'Done! Latest data loaded — any local placeholder ("DUMMY-...") units are replaced automatically once real units cover the stock.';
  } catch (err) {
    pullStatus.value = 'Pull failed — check your connection.';
  } finally {
    pulling.value = false;
  }
}

const SCRIPT_SOURCE = `// Khonsu Tech Operations — Apps Script Backend
// Paste this into a new Google Apps Script project (script.google.com),
// then deploy as Web App (Execute as: Me, Who has access: Anyone).

const SS = SpreadsheetApp.getActiveSpreadsheet();
const DEFAULT_PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // sha256("1234")

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'init')                return initSheets();
    if (d.action === 'logSale')             return logSale(d);
    if (d.action === 'voidSaleRow')         return voidSaleRow(d);
    if (d.action === 'logPO')               return logPO(d);
    if (d.action === 'pushInventory')       return pushInventory(d);
    if (d.action === 'pushMasterList')      return pushMasterList(d);
    if (d.action === 'saveProducts')        return pushMasterList(d);
    if (d.action === 'updateMasterList')    return updateMasterList(d);
    if (d.action === 'saveInventory')       return updateInventoryRows(d.rows);
    if (d.action === 'updateInventoryItems')return updateInventoryRows(d.items);
    if (d.action === 'savePO')              return savePO(d);
    if (d.action === 'updatePOStatus')      return updatePOStatus(d);
    if (d.action === 'savePromotions')      return savePromotions(d);
    if (d.action === 'saveFreebies')        return saveFreebies(d);
    if (d.action === 'saveUnits')           return saveUnits(d);
    if (d.action === 'updateUnitStatus')    return updateUnitStatus(d);
    if (d.action === 'saveSettings')        return saveSettings(d);
    if (d.action === 'verifyPin')           return verifyPin(d);
    if (d.action === 'setPin')              return setPin(d);
    if (d.action === 'verifyStaffPin')      return verifyStaffPin(d);
    if (d.action === 'setUserPin')          return setUserPin(d);
    if (d.action === 'resetStaffPin')       return resetStaffPin(d);
    if (d.action === 'logPayment')          return logPayment(d);
    if (d.action === 'updatePaymentStatus') return updatePaymentStatus(d);
    if (d.action === 'pushPaymentLogs')     return pushPaymentLogs(d);
    if (d.action === 'editPaymentLog')      return editPaymentLog(d);
    if (d.action === 'deletePaymentLog')    return deletePaymentLog(d);
    if (d.action === 'logIssue')            return logIssue(d);
    if (d.action === 'updateIssueStatus')   return updateIssueStatus(d);
    if (d.action === 'pushIssueLogs')       return pushIssueLogs(d);
    if (d.action === 'clockIn')             return clockIn(d);
    if (d.action === 'clockOut')            return clockOut(d);
    if (d.action === 'addTimeLog')          return addTimeLog(d);
    if (d.action === 'editTimeLog')         return editTimeLog(d);
    if (d.action === 'deleteTimeLog')       return deleteTimeLog(d);
    if (d.action === 'pushTimeLogs')        return pushTimeLogs(d);
    return respond({ error: 'Unknown action' });
  } catch (err) { return respond({ error: err.toString() }); }
}

function doGet(e) {
  if (e.parameter.action === 'ping')             return respond({ status: 'ok' });
  if (e.parameter.action === 'getMasterList')    return getMasterList();
  if (e.parameter.action === 'getSales')         return getSales();
  if (e.parameter.action === 'getPaymentLogs')   return getPaymentLogs();
  if (e.parameter.action === 'getAllData')       return getAllData();
  if (e.parameter.action === 'getIssueLogs')     return getIssueLogs();
  if (e.parameter.action === 'getUnits')         return getUnits();
  if (e.parameter.action === 'getTimeLogs')      return getTimeLogs();
  return respond({ status: 'Khonsu Tech OPS running' });
}

function getSales() {
  const sh = SS.getSheetByName('Sales Log');
  if (!sh) return respond({ sales: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ sales: [] });
  // Column order matches initSheets + logSale:
  // 0:Date 1:SO/Bundle 2:Item 3:Variant 4:Color 5:Qty 6:UnitPrice 7:SRP
  // 8:SoldPrice 9:PasaPrice 10:Discount 11:NetSales 12:Payment 13:SoldType 14:Promoter 15:Staff 16:SaleID 17:IMEI
  // 18:BundleCode 19:IsAddon 20:IsPromotion 21:CustomerName 22:CustomerContact 23:CustomerEmail
  const sales = data.slice(1).map(function(r) {
    var d = r[0];
    return {
      SaleID:    String(r[16] || ''),
      Date:      d instanceof Date ? d.toISOString() : String(d),
      SO:        String(r[1] || ''),
      ItemName:  String(r[2] || ''),
      Variant:   String(r[3] || ''),
      Color:     String(r[4] || ''),
      Qty:       Number(r[5]) || 0,
      UnitPrice: Number(r[6]) || 0,
      SRP:       Number(r[7]) || 0,
      SoldPrice: Number(r[8]) || 0,
      PasaPrice: Number(r[9]) || 0,
      Discount:  Number(r[10]) || 0,
      NetSales:  Number(r[11]) || 0,
      Payment:   String(r[12] || ''),
      SoldType:  String(r[13] || ''),
      Promoter:  String(r[14] || ''),
      Staff:     String(r[15] || ''),
      IMEI:      String(r[17] || ''),
      BundleCode:      String(r[18] || ''),
      IsAddon:         String(r[19] || '') === 'true',
      IsPromotion:     String(r[20] || '') === 'true',
      CustomerName:    String(r[21] || ''),
      CustomerContact: String(r[22] || ''),
      CustomerEmail:   String(r[23] || ''),
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
                  'Sold Price','Pasa Price','Discount','Net Sales','Payment','Sold Type','Promoter','Staff','Sale ID','IMEI',
                  'Bundle Code','Is Addon','Is Promotion','Customer Name','Customer Contact','Customer Email'],
    'Inventory': ['Category','Model','RAM','Storage','Colors','Unit Price','SRP','Stock','Reorder Point'],
    'Purchase Orders': ['PO Number','Date','Supplier','Items','Quantities','Status','Approver'],
    'PO Items': ['POID','ItemName','Qty','Color'],
    'Payment Logs': ['ID','Date','Store','Method','Amount','Reference','Staff','Origin','Notes','Status','Credited Date','Credited By','Settled Date','Settled By','SO Number'],
    'Promotions': ['BundleID','Name','Price','MainProductKey','MainProductName','AddonProductKey','AddonProductName'],
    'Freebies': ['MainProductKey','FreebieProductKey','MainProductName','FreebieProductName'],
    'Settings': ['Key','Value'],
    'Units': ['IMEI','ProductKey','ProductName','Color','Status','DRNumber','ReceivedDate','SONumber','SoldDate','IsDummy'],
    'Issue Log': ['ID','Date','LastSeen','Type','Action','QueueID','Message','Context','Attempts','Status','ResolvedDate','ResolvedBy'],
    'Time Log': ['ID','User','Clock In','Clock In Received At','Clock Out','Clock Out Received At','Origin','Notes','Corrected By','Corrected At'],
  };
  Object.entries(tabs).forEach(([name, headers]) => {
    let sh = SS.getSheetByName(name);
    if (!sh) sh = SS.insertSheet(name);
    // Always (re)write row 1 to exactly match the current schema, whether the
    // tab is brand new or has months of data rows already. Headers are pure
    // labels, never read as data by anything but getMasterList()'s dynamic
    // lookup, so overwriting them is safe and this sidesteps a real bug the
    // previous "backfill trailing columns" approach had: it compared against
    // sh.getLastColumn(), which reflects the widest DATA row, not the header
    // row's own width. A tab created under an older/shorter schema (e.g. this
    // sheet's Inventory tab, originally 'ProductKey,Stock,ReorderPoint,
    // LastUpdated' from the pre-Vue app) but since written with wider,
    // newer-schema data rows would already report getLastColumn() >= the new
    // header count, so the header row's stale/wrong labels were never fixed
    // and newly-added columns to its right were never labeled at all.
    if (sh.getLastRow() === 0) sh.appendRow(headers);
    else sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#1c2541').setFontColor('white');
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
      r.discount || 0, r.netSales || 0, r.payment, r.soldType, r.promoter || '', r.staff, String(r.id || ''),
      (r.imeis || []).join(', '),
      r.bundle || '', r.isAddon ? 'true' : 'false', r.isPromotion ? 'true' : 'false',
      r.customer ? (r.customer.name || '') : '', r.customer ? (r.customer.contact || '') : '', r.customer ? (r.customer.email || '') : '']);
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

function voidSaleRow(d) {
  const sh = SS.getSheetByName('Sales Log');
  if (!sh) return respond({ error: 'No Sales Log sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][16]) === String(d.id)) { sh.deleteRow(i + 1); break; }
  }
  return respond({ status: 'Sale row voided' });
}

function logPO(d) {
  const sh    = SS.getSheetByName('Purchase Orders');
  const items = (d.items || []).map(i => i.name).join(', ');
  const qtys  = (d.items || []).map(i => i.qty).join(', ');
  sh.appendRow([d.id, d.date, d.supplier, items, qtys, d.status || 'Pending', d.approver]);
  savePOItems(d.id, d.items || []);
  return respond({ status: 'PO logged' });
}

// Normalized child table for PO line items (POID, ItemName, Qty, Color) — the
// 'Items'/'Quantities' columns on Purchase Orders stay as a human-readable
// summary; this is the queryable source of truth. Replaces any existing rows
// for the given PO so re-saving an edited PO doesn't leave stale line items.
function savePOItems(poId, items) {
  const sh = SS.getSheetByName('PO Items');
  if (!sh) return;
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(poId)) sh.deleteRow(i + 1);
  }
  (items || []).forEach(it => sh.appendRow([poId, it.name, it.qty, it.color || '']));
}

function pushInventory(d) {
  const sh = SS.getSheetByName('Inventory');
  if (!sh) return respond({ error: 'No Inventory sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Pushed', count: (d.rows || []).length });
}

function updateInventoryRows(list) {
  const sh = SS.getSheetByName('Inventory');
  if (!sh) return respond({ error: 'No Inventory sheet' });
  const data = sh.getDataRange().getValues();
  (list || []).forEach(function(entry) {
    for (let i = 1; i < data.length; i++) {
      const k = data[i][1] + (data[i][2] ? ' ' + data[i][2] : '') + (data[i][3] ? '/' + data[i][3] : '');
      if (k.trim() === (entry.productKey || '').trim()) {
        sh.getRange(i + 1, 8).setValue(entry.stock);
        sh.getRange(i + 1, 9).setValue(entry.reorder);
        break;
      }
    }
  });
  return respond({ status: 'Inventory updated', count: (list || []).length });
}

function pushMasterList(d) {
  let sh = SS.getSheetByName('Master List');
  if (!sh) {
    sh = SS.insertSheet('Master List');
    sh.appendRow(['Key','Category','Model','RAM','Storage','Colors','Unit Price','SRP','Status']);
    sh.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#1c2541').setFontColor('white');
  }
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Master List pushed', count: (d.rows || []).length });
}

// Same tab/clear-and-rewrite semantics as pushMasterList, but for an external
// caller (e.g. an LLM turning a supplier Viber update into structured data)
// that sends named-field objects rather than the frontend's positional row
// arrays.
function updateMasterList(d) {
  let sh = SS.getSheetByName('Master List');
  if (!sh) {
    sh = SS.insertSheet('Master List');
    sh.appendRow(['Key','Category','Model','RAM','Storage','Colors','Unit Price','SRP','Status']);
    sh.getRange(1, 1, 1, 9)
      .setFontWeight('bold').setBackground('#1c2541').setFontColor('white');
  }
  const rows = (d.rows || []).map(item => [
    item.key || '', item.category || '', item.model || '', item.ram || '',
    item.storage || '', item.colors || '', Number(item.unitPrice) || 0,
    Number(item.srp) || 0, item.status || '',
  ]);
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  if (rows.length) sh.getRange(2, 1, rows.length, 9).setValues(rows);
  return respond({ status: 'Master List updated', count: rows.length });
}

function savePO(d) {
  const sh = SS.getSheetByName('Purchase Orders');
  if (!sh) return respond({ error: 'No Purchase Orders sheet' });
  const items    = d.items || [];
  const itemsStr = JSON.stringify(items);
  const qtysStr  = items.map(i => i.qty).join(', ');
  const data = sh.getDataRange().getValues();
  savePOItems(d.id, items);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 2, 1, 6).setValues([[d.date, d.supplier, itemsStr, qtysStr, d.status || 'pending', d.approver || '']]);
      return respond({ status: 'PO updated' });
    }
  }
  sh.appendRow([d.id, d.date, d.supplier, itemsStr, qtysStr, d.status || 'pending', d.approver || '']);
  return respond({ status: 'PO created' });
}

function updatePOStatus(d) {
  const sh = SS.getSheetByName('Purchase Orders');
  if (!sh) return respond({ error: 'No Purchase Orders sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 6).setValue(d.status || 'pending');
      break;
    }
  }
  return respond({ status: 'PO status updated' });
}

function savePromotions(d) {
  const sh = SS.getSheetByName('Promotions');
  if (!sh) return respond({ error: 'No Promotions sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.bundles || []).forEach(b => sh.appendRow([b.id, b.name, b.price, b.mainKey, b.mainName, b.addonKey, b.addonName]));
  return respond({ status: 'Promotions saved', count: (d.bundles || []).length });
}

function saveFreebies(d) {
  const sh = SS.getSheetByName('Freebies');
  if (!sh) return respond({ error: 'No Freebies sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.freebies || []).forEach(f => sh.appendRow([f.mainKey, f.freebieKey, f.mainName || '', f.freebieName || '']));
  return respond({ status: 'Freebies saved', count: (d.freebies || []).length });
}

function saveUnits(d) {
  const sh = SS.getSheetByName('Units');
  if (!sh) return respond({ error: 'No Units sheet' });
  (d.units || []).forEach(u => sh.appendRow([u.imei, u.productKey, u.productName, u.color,
    u.status || 'available', u.drNumber || '', u.receivedDate || '', u.soNumber || '', u.soldDate || '', u.isDummy ? 'true' : 'false']));
  return respond({ status: 'Units saved', count: (d.units || []).length });
}

function updateUnitStatus(d) {
  const sh = SS.getSheetByName('Units');
  if (!sh) return respond({ error: 'No Units sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.imei)) {
      sh.getRange(i + 1, 5).setValue('sold');
      sh.getRange(i + 1, 8).setValue(d.soNumber || '');
      sh.getRange(i + 1, 9).setValue(d.soldDate || '');
      break;
    }
  }
  return respond({ status: 'Unit status updated' });
}

function getUnits() {
  const sh = SS.getSheetByName('Units');
  if (!sh) return respond({ units: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ units: [] });
  const units = data.slice(1).filter(r => r[0]).map(function(r) {
    return {
      IMEI: String(r[0] || ''),
      ProductKey: String(r[1] || ''),
      ProductName: String(r[2] || ''),
      Color: String(r[3] || ''),
      Status: String(r[4] || 'available'),
      DRNumber: String(r[5] || ''),
      ReceivedDate: String(r[6] || ''),
      SONumber: String(r[7] || ''),
      SoldDate: String(r[8] || ''),
      IsDummy: String(r[9] || 'false'),
    };
  });
  return respond({ units: units });
}

function getSettingsSheet() {
  let sh = SS.getSheetByName('Settings');
  if (!sh) {
    sh = SS.insertSheet('Settings');
    sh.appendRow(['Key', 'Value']);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1c2541').setFontColor('white');
  }
  return sh;
}

function getSettingValue(key) {
  const sh = getSettingsSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === key) return data[i][1];
  return null;
}

function setSettingValue(key, value) {
  const sh = getSettingsSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

function saveSettings(d) {
  const s = d.settings || {};
  if (s.DailyTarget !== undefined)       setSettingValue('DailyTarget', s.DailyTarget);
  if (s.LowStockThreshold !== undefined) setSettingValue('LowStockThreshold', s.LowStockThreshold);
  if (s.GlobalReorder !== undefined)     setSettingValue('GlobalReorder', s.GlobalReorder);
  if (s.PasaCapEnabled !== undefined)    setSettingValue('PasaCapEnabled', s.PasaCapEnabled);
  return respond({ status: 'Settings saved' });
}

function sha256Hex(str) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return raw.map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function verifyPin(d) {
  const stored = getSettingValue('AdminPinHash') || DEFAULT_PIN_HASH;
  return respond({ valid: sha256Hex(d.pin || '') === stored });
}

function setPin(d) {
  const stored = getSettingValue('AdminPinHash') || DEFAULT_PIN_HASH;
  if (sha256Hex(d.current || '') !== stored) return respond({ error: 'Current PIN is incorrect' });
  if (!d.next || String(d.next).length < 4) return respond({ error: 'New PIN must be at least 4 digits' });
  setSettingValue('AdminPinHash', sha256Hex(d.next));
  return respond({ status: 'PIN updated' });
}

var STAFF_USERS = ['Sam', 'Joyce'];

function verifyStaffPin(d) {
  var user = String(d.user || '');
  if (STAFF_USERS.indexOf(user) === -1) return respond({ error: 'Unknown staff user' });
  var stored = getSettingValue(user + 'PinHash') || DEFAULT_PIN_HASH;
  return respond({ valid: sha256Hex(d.pin || '') === stored });
}

// Self-service PIN change — works for Sam/Joyce (and Admin, for symmetry), each
// keyed by their own Settings row so changing one never touches another's PIN.
function setUserPin(d) {
  var user = String(d.user || '');
  if (user !== 'Admin' && STAFF_USERS.indexOf(user) === -1) return respond({ error: 'Unknown user' });
  var stored = getSettingValue(user + 'PinHash') || DEFAULT_PIN_HASH;
  if (sha256Hex(d.current || '') !== stored) return respond({ error: 'Current PIN is incorrect' });
  if (!d.next || String(d.next).length < 4) return respond({ error: 'New PIN must be at least 4 digits' });
  setSettingValue(user + 'PinHash', sha256Hex(d.next));
  return respond({ status: 'PIN updated' });
}

// Admin-only reset back to the shared default — no current-PIN check, since Admin
// is already gated into Settings client-side (same soft-gate model as everywhere else).
function resetStaffPin(d) {
  var user = String(d.user || '');
  if (STAFF_USERS.indexOf(user) === -1) return respond({ error: 'Unknown staff user' });
  setSettingValue(user + 'PinHash', DEFAULT_PIN_HASH);
  return respond({ status: user + "'s PIN reset to default" });
}

function getAllData() {
  const products = [];
  const mlSheet = SS.getSheetByName('Master List');
  if (mlSheet) {
    const data = mlSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      products.push({ Category: data[i][1], Name: data[i][2], RAM: data[i][3], Storage: data[i][4],
        Colors: data[i][5], UnitPrice: data[i][6], SRP: data[i][7], Status: data[i][8] });
    }
  }

  const inventory = [];
  const invSheet = SS.getSheetByName('Inventory');
  if (invSheet) {
    const data = invSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const key = data[i][1] + (data[i][2] ? ' ' + data[i][2] : '') + (data[i][3] ? '/' + data[i][3] : '');
      inventory.push({ ProductKey: key, Stock: data[i][7], ReorderPoint: data[i][8] });
    }
  }

  const promotions = [];
  const promoSheet = SS.getSheetByName('Promotions');
  if (promoSheet) {
    const data = promoSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      promotions.push({ BundleID: data[i][0], Name: data[i][1], Price: data[i][2],
        MainProductKey: data[i][3], MainProductName: data[i][4], AddonProductKey: data[i][5], AddonProductName: data[i][6] });
    }
  }

  const freebies = [];
  const freebieSheet = SS.getSheetByName('Freebies');
  if (freebieSheet) {
    const data = freebieSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      freebies.push({ MainProductKey: data[i][0], FreebieProductKey: data[i][1] });
    }
  }

  const settings = {
    DailyTarget:       getSettingValue('DailyTarget'),
    LowStockThreshold: getSettingValue('LowStockThreshold'),
    GlobalReorder:     getSettingValue('GlobalReorder'),
    PasaCapEnabled:    getSettingValue('PasaCapEnabled'),
  };

  const poItemsByPOID = {};
  const poItemsSheet = SS.getSheetByName('PO Items');
  if (poItemsSheet) {
    const idata = poItemsSheet.getDataRange().getValues();
    for (let i = 1; i < idata.length; i++) {
      const poid = String(idata[i][0] || '');
      if (!poid) continue;
      if (!poItemsByPOID[poid]) poItemsByPOID[poid] = [];
      poItemsByPOID[poid].push({ name: idata[i][1], qty: idata[i][2], color: idata[i][3] || '' });
    }
  }

  const purchaseOrders = [];
  const poSheet = SS.getSheetByName('Purchase Orders');
  if (poSheet) {
    const data = poSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const poid = String(data[i][0]);
      // Prefer the normalized PO Items rows; fall back to the legacy JSON
      // blob in the Items column for POs saved before this tab existed.
      let items = poItemsByPOID[poid];
      if (!items) {
        try { items = JSON.parse(data[i][3] || '[]'); } catch (err) { items = []; }
      }
      purchaseOrders.push({ POID: poid, Date: data[i][1], Supplier: data[i][2],
        Approver: data[i][6], Status: data[i][5], items: items });
    }
  }

  return respond({ products, inventory, promotions, freebies, settings, purchaseOrders });
}

function logPayment(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  sh.appendRow([d.id, d.date, d.store, d.method, d.amount || 0, d.reference || '',
    d.staff || '', d.origin || 'manual', d.notes || '', d.status || 'pending',
    d.creditedDate || '', d.creditedBy || '', d.settledDate || '', d.settledBy || '',
    d.soNumber || '']);
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
      sh.getRange(i + 1, 13).setValue(d.settledDate || '');
      sh.getRange(i + 1, 14).setValue(d.settledBy || '');
      break;
    }
  }
  return respond({ status: 'Payment status updated' });
}

function pushPaymentLogs(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Payment Logs pushed', count: (d.rows || []).length });
}

function editPaymentLog(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 3).setValue(d.store || '');
      sh.getRange(i + 1, 4).setValue(d.method || '');
      sh.getRange(i + 1, 5).setValue(d.amount || 0);
      sh.getRange(i + 1, 6).setValue(d.reference || '');
      sh.getRange(i + 1, 9).setValue(d.notes || '');
      break;
    }
  }
  return respond({ status: 'Payment log updated' });
}

function deletePaymentLog(d) {
  const sh = SS.getSheetByName('Payment Logs');
  if (!sh) return respond({ error: 'No Payment Logs sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.deleteRow(i + 1);
      break;
    }
  }
  return respond({ status: 'Payment log deleted' });
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
      SettledDate: String(r[12] || ''),
      SettledBy: String(r[13] || ''),
      SONumber: String(r[14] || ''),
    };
  });
  return respond({ logs: logs });
}

function logIssue(d) {
  // Upsert by ID: a re-push of the same local entry (e.g. attempts/lastSeen bumped
  // after a retried failure) updates its existing row instead of duplicating it.
  const sh = SS.getSheetByName('Issue Log');
  if (!sh) return respond({ error: 'No Issue Log sheet' });
  const row = [d.id, d.date, d.lastSeen || d.date, d.type || 'runtime', d.issueAction || '',
    d.queueId || '', d.message || '', d.context || '', d.attempts || 1,
    d.status || 'open', d.resolvedDate || '', d.resolvedBy || ''];
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return respond({ status: 'Issue updated' });
    }
  }
  sh.appendRow(row);
  return respond({ status: 'Issue logged' });
}

function updateIssueStatus(d) {
  const sh = SS.getSheetByName('Issue Log');
  if (!sh) return respond({ error: 'No Issue Log sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 10).setValue(d.status || 'open');
      sh.getRange(i + 1, 11).setValue(d.resolvedDate || '');
      sh.getRange(i + 1, 12).setValue(d.resolvedBy || '');
      break;
    }
  }
  return respond({ status: 'Issue status updated' });
}

function pushIssueLogs(d) {
  const sh = SS.getSheetByName('Issue Log');
  if (!sh) return respond({ error: 'No Issue Log sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Issue Log pushed', count: (d.rows || []).length });
}

function getIssueLogs() {
  const sh = SS.getSheetByName('Issue Log');
  if (!sh) return respond({ issues: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ issues: [] });
  const issues = data.slice(1).filter(r => r[0]).map(function(r) {
    return {
      ID: String(r[0] || ''), Date: String(r[1] || ''), LastSeen: String(r[2] || ''),
      Type: String(r[3] || ''), Action: String(r[4] || ''), QueueID: String(r[5] || ''),
      Message: String(r[6] || ''), Context: String(r[7] || ''), Attempts: Number(r[8]) || 1,
      Status: String(r[9] || 'open'), ResolvedDate: String(r[10] || ''), ResolvedBy: String(r[11] || ''),
    };
  });
  return respond({ issues: issues });
}

function clockIn(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  sh.appendRow([d.id, d.user, d.clockIn, new Date(), '', '', 'auto', '', '', '']);
  return respond({ status: 'Clocked in' });
}

// No id is sent — finds this user's most recent open row (Clock Out blank) and
// closes it, so logging out still finalizes the right row even if the open
// entry was opened on a different device than the one calling clockOut here.
function clockOut(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(d.user || '') && !data[i][4]) {
      sh.getRange(i + 1, 5).setValue(d.clockOut || '');
      sh.getRange(i + 1, 6).setValue(new Date());
      return respond({ status: 'Clocked out' });
    }
  }
  return respond({ status: 'No open session found' });
}

function addTimeLog(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  sh.appendRow([d.id, d.user, d.clockIn, '', d.clockOut || '', '', d.origin || 'manual', d.notes || '', '', '']);
  return respond({ status: 'Time entry added' });
}

function editTimeLog(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 3).setValue(d.clockIn || '');
      sh.getRange(i + 1, 5).setValue(d.clockOut || '');
      sh.getRange(i + 1, 8).setValue(d.notes || '');
      sh.getRange(i + 1, 9).setValue(d.correctedBy || '');
      sh.getRange(i + 1, 10).setValue(d.correctedAt || '');
      break;
    }
  }
  return respond({ status: 'Time entry updated' });
}

function deleteTimeLog(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sh.deleteRow(i + 1);
      break;
    }
  }
  return respond({ status: 'Time entry deleted' });
}

function pushTimeLogs(d) {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ error: 'No Time Log sheet' });
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  (d.rows || []).forEach(r => sh.appendRow(r));
  return respond({ status: 'Time Log pushed', count: (d.rows || []).length });
}

function getTimeLogs() {
  const sh = SS.getSheetByName('Time Log');
  if (!sh) return respond({ logs: [] });
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return respond({ logs: [] });
  const logs = data.slice(1).filter(r => r[0]).map(function(r) {
    return {
      ID: String(r[0] || ''),
      User: String(r[1] || ''),
      ClockIn: String(r[2] || ''),
      ClockOut: String(r[4] || ''),
      Origin: String(r[6] || 'auto'),
      Notes: String(r[7] || ''),
      CorrectedBy: String(r[8] || ''),
      CorrectedAt: String(r[9] || ''),
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
        Pushes your master list, inventory, promotions, freebies, and settings to Google Sheets. Run this after first connecting, or whenever you want to overwrite Sheets with local data.
      </p>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <button class="btn btn-success" :disabled="pushing || !store.scriptUrl" @click="pushAll">
          {{ pushing ? 'Pushing…' : 'Push All Data' }}
        </button>
        <span v-if="pushStatus" style="font-size:13px;color:var(--muted);">{{ pushStatus }}</span>
      </div>
    </div>

    <!-- Step 5 -->
    <div class="card" style="margin-top:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">5</div>
        <h3 style="font-size:15px;font-weight:700;margin:0;">Pull Latest Data</h3>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.7;">
        If you loaded or edited data directly in the Google Sheet — e.g. bulk-entering real IMEIs into the <strong>Units</strong> tab for an initial stocktake, or correcting <strong>Master List</strong> prices — pull it into this device now instead of waiting for the next login. A real IMEI unit automatically replaces any local placeholder ("DUMMY-…") unit for the same product once real units cover its stock count.
      </p>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <button class="btn btn-outline" :disabled="pulling || !store.scriptUrl" @click="pullAll">
          {{ pulling ? 'Pulling…' : 'Pull Latest Data' }}
        </button>
        <span v-if="pullStatus" style="font-size:13px;color:var(--muted);">{{ pullStatus }}</span>
      </div>
    </div>
  </div>
</template>
