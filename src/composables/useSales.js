import { useAppStore } from '@/stores/state.js';
import { ik, vl, fmt } from '@/utils.js';
import { useToast } from '@/composables/useToast.js';
import { tryPush } from '@/composables/useSync.js';
import { usePaymentLogs } from '@/composables/usePaymentLogs.js';

export const IMEI_CATS = new Set(['Smart Phone', 'Bar Phone', 'Tablet']);
export const isImeiProduct = p => p && IMEI_CATS.has(p.category);

export function useSales() {
  const store = useAppStore();
  const { toast } = useToast();

  function getAvailableUnits(productKey) {
    return store.units.filter(u => u.productKey === productKey && u.status === 'available');
  }

  function markUnitSold(imei, soNumber) {
    const unit = store.units.find(u => u.imei === imei);
    if (!unit) return;
    unit.status = 'sold';
    unit.soNumber = soNumber;
    unit.soldDate = new Date().toLocaleDateString('en-PH');
    if (store.inventory[unit.productKey]) {
      store.inventory[unit.productKey].stock = getAvailableUnits(unit.productKey).length;
    }
    localStorage.setItem('kt_units', JSON.stringify(store.units));
    tryPush('updateUnitStatus', { imei, soNumber, soldDate: unit.soldDate });
  }

  function makeSoNumber() {
    store.soCounter++;
    localStorage.setItem('kt_so', store.soCounter);
    const d = new Date();
    return 'SO-' + String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      '-' + String(store.soCounter).padStart(4, '0');
  }

  function makeBundleCode(prefix = 'BDL') {
    store.bundleCounter++;
    localStorage.setItem('kt_pc', store.bundleCounter);
    const d = new Date();
    const dp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    return prefix + '-' + dp + '-' + String(store.bundleCounter).padStart(3, '0');
  }

  function buildPendingItem(formData) {
    const p = store.selectedProduct;
    if (!p) return null;
    const imei = isImeiProduct(p);
    const { qty, colors, soldType, promoter, payment, pasa,
      bundleCode, bundlePrice, bundleName, promoAddonKey, promoAddonName, customer } = formData;

    let resolvedColors, resolvedQty;
    if (imei) {
      if (!store.selectedIMEIs.length) {
        toast('Please scan or select at least one unit', 'error');
        return null;
      }
      resolvedColors = store.selectedIMEIs.map(u => u.color);
      resolvedQty = store.selectedIMEIs.length;
    } else {
      if (!colors.every(c => c.length > 0)) {
        toast('Please enter a color for each unit', 'error');
        return null;
      }
      resolvedColors = colors;
      resolvedQty = qty;
    }

    if (soldType === 'Pasa' && !promoter) {
      toast('Please enter promoter name', 'error');
      return null;
    }

    const srp = p.srp;
    const isPromo = bundlePrice > 0;
    const sp = isPromo ? bundlePrice : (soldType === 'Pasa' ? srp + pasa : srp);
    const freebieKey = store.productFreebies[ik(p)];
    const freebieP = freebieKey ? store.masterList.find(x => ik(x) === freebieKey) : null;

    return {
      id: Date.now() + Math.random(),
      isPromo,
      bundleCode,
      bundleName,
      product: p,
      colors: resolvedColors,
      color: resolvedColors.join(', '),
      qty: resolvedQty,
      imeis: imei ? store.selectedIMEIs.map(u => u.imei) : [],
      soldType,
      promoter: soldType === 'Pasa' ? promoter : '',
      pasa: pasa || 0,
      payment,
      srp,
      sp,
      unitPrice: p.unitPrice,
      net: (sp - p.unitPrice) * resolvedQty,
      addon: store.selectedAddon ? { ...store.selectedAddon } : null,
      freebie: freebieP ? { name: freebieP.name, key: freebieKey } : null,
      promoAddon: promoAddonKey ? { key: promoAddonKey, name: promoAddonName } : null,
      customer: store.pendingItems.length === 0 ? customer : null,
    };
  }

  function addAnotherItem(formData) {
    const item = buildPendingItem(formData);
    if (!item) return false;
    store.pendingItems.push(item);
    toast(item.product.name + ' added — select next item', 'success');
    store.selectedProduct = null;
    store.selectedAddon = null;
    store.selectedIMEIs = [];
    return true;
  }

  function goToReview(formData) {
    if (store.selectedProduct) {
      const item = buildPendingItem(formData);
      if (!item) return false;
      store.pendingItems.push(item);
      store.selectedProduct = null;
      store.selectedAddon = null;
    }
    if (!store.pendingItems.length) {
      toast('No items to review', 'error');
      return false;
    }
    if (!store.currentSO) store.currentSO = makeSoNumber();
    return true;
  }

  function removePendingItem(idx) {
    store.pendingItems.splice(idx, 1);
  }

  function editPendingItem(idx) {
    const item = store.pendingItems.splice(idx, 1)[0];
    store.selectedProduct = item.product;
    store.selectedAddon = item.addon;
    store.selectedIMEIs = item.imeis && item.imeis.length
      ? item.imeis.map(imei => store.units.find(u => u.imei === imei)).filter(Boolean)
      : [];
    return item;
  }

  function confirmSale() {
    if (!store.pendingItems.length) { toast('No items to confirm', 'error'); return false; }
    if (!store.currentSO) store.currentSO = makeSoNumber();
    const so = store.currentSO;
    const now = Date.now();
    const decrements = [];
    const rowStart = store.saleRows.length;

    store.pendingItems.forEach((item, i) => {
      const p = item.product;
      const freebieKey = item.freebie ? item.freebie.key : null;
      store.saleRows.push({
        id: now + i * 10, so, bundle: item.bundleCode || '',
        itemName: p.name, variant: vl(p), color: item.color,
        qty: item.qty, unitPrice: item.unitPrice, srp: item.srp,
        soldPrice: item.sp, pasaPrice: item.pasa || 0, discount: 0,
        netSales: (item.sp - item.unitPrice) * item.qty,
        payment: item.payment, soldType: item.soldType,
        promoter: item.promoter, staff: store.currentUser,
        productKey: ik(p), isPromotion: item.isPromo || false,
        imeis: item.imeis || [], customer: item.customer || null,
      });

      if (item.imeis && item.imeis.length) {
        item.imeis.forEach(imei => markUnitSold(imei, so));
        decrements.push({ productKey: ik(p), qty: item.qty });
      } else if (store.inventory[ik(p)]) {
        store.inventory[ik(p)].stock = Math.max(0, store.inventory[ik(p)].stock - item.qty);
        decrements.push({ productKey: ik(p), qty: item.qty });
      }

      if (item.addon) {
        const a = item.addon, ak = ik(a.product);
        store.saleRows.push({
          id: now + i * 10 + 1, so, bundle: item.bundleCode || '',
          itemName: a.product.name, variant: vl(a.product), color: '', qty: 1,
          unitPrice: a.product.unitPrice, srp: a.product.srp, soldPrice: a.soldPrice,
          pasaPrice: 0, discount: 0, netSales: a.soldPrice - a.product.unitPrice,
          payment: item.payment, soldType: item.soldType, promoter: item.promoter,
          staff: store.currentUser, productKey: ak, isAddon: true, customer: null,
        });
        if (store.inventory[ak]) {
          store.inventory[ak].stock = Math.max(0, store.inventory[ak].stock - 1);
          decrements.push({ productKey: ak, qty: 1 });
        }
      }

      if (item.promoAddon) {
        const paKey = item.promoAddon.key;
        const paP = store.masterList.find(x => ik(x) === paKey);
        if (paP) {
          store.saleRows.push({
            id: now + i * 10 + 2, so, bundle: item.bundleCode || '',
            itemName: paP.name, variant: vl(paP), color: 'Assorted', qty: item.qty,
            unitPrice: paP.unitPrice, srp: 0, soldPrice: 0, pasaPrice: 0, discount: 0,
            netSales: -(paP.unitPrice * item.qty),
            payment: item.payment, soldType: item.soldType, promoter: '',
            staff: store.currentUser, productKey: paKey, isPromoAddon: true, customer: null,
          });
          if (store.inventory[paKey]) {
            store.inventory[paKey].stock = Math.max(0, store.inventory[paKey].stock - item.qty);
            decrements.push({ productKey: paKey, qty: item.qty });
          }
        }
      }

      if (freebieKey && store.inventory[freebieKey]) {
        store.inventory[freebieKey].stock = Math.max(0, store.inventory[freebieKey].stock - item.qty);
        decrements.push({ productKey: freebieKey, qty: item.qty });
      }
    });

    store.saveInv();
    const newRows = store.saleRows.slice(rowStart);
    tryPush('logSale', { date: new Date().toISOString(), rows: newRows });
    usePaymentLogs().logSalePayments(so, newRows);
    if (decrements.length) {
      tryPush('updateInventoryItems', {
        items: decrements.map(d => ({
          productKey: d.productKey,
          stock: (store.inventory[d.productKey] || {}).stock || 0,
          reorder: (store.inventory[d.productKey] || {}).reorder || 1,
        })),
      });
    }

    store.pendingItems = [];
    store.selectedIMEIs = [];
    store.currentSO = null;
    store.saveTodayRows();
    toast('Sales Order ' + so + ' confirmed!', 'success');
    return true;
  }

  function removeRow(id) {
    const r = store.saleRows.find(x => x.id === id);
    if (r && store.inventory[r.productKey]) store.inventory[r.productKey].stock += r.qty;
    store.saleRows = store.saleRows.filter(x => x.id !== id);
    store.saveInv();
    store.saveTodayRows();
  }

  function generatePO(items) {
    let po = store.purchaseOrders.find(p => p.status === 'pending');
    if (po) {
      items.forEach(ni => {
        const ex = po.items.find(i => i.name === ni.name);
        if (ex) ex.qty += ni.qty;
        else po.items.push({ name: ni.name, qty: ni.qty, color: '' });
      });
      po.date = new Date().toLocaleString('en-PH');
    } else {
      po = {
        id: 'PO-' + String(Date.now()).slice(-6),
        date: new Date().toLocaleString('en-PH'),
        supplier: 'Tecnix Trading',
        approver: 'Admin',
        items: items.map(i => ({ name: i.name, qty: i.qty, color: '' })),
        status: 'pending',
      };
      store.purchaseOrders.unshift(po);
    }
    store.savePOs();
    tryPush('savePO', { id: po.id, date: po.date, supplier: po.supplier, approver: po.approver, status: po.status, items: po.items });
    toast('PO ' + po.id + ' updated for low-stock items', 'success');
  }

  function closeDayReport() {
    if (!store.saleRows.length) { toast('No transactions today', 'error'); return false; }
    if (!confirm("Close today's report? Local data will be cleared.")) return false;
    const low = [];
    store.PRODUCTS.forEach(p => {
      const k = ik(p);
      const inv = store.inventory[k];
      if (inv && inv.stock <= inv.reorder) low.push({ name: p.name + (vl(p) ? ' ' + vl(p) : ''), qty: 5 });
    });
    if (low.length) generatePO(low);
    store.saleRows = [];
    store.pendingItems = [];
    store.currentSO = null;
    store.clearTodayRows();
    return true;
  }

  function printReport() {
    const rows = store.saleRows;
    if (!rows.length) return;
    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const gross = rows.reduce((s, r) => s + r.soldPrice * r.qty, 0);
    const disc  = rows.reduce((s, r) => s + (r.discount || 0), 0);
    const net   = rows.reduce((s, r) => s + (r.netSales || 0), 0);
    const cash  = rows.filter(r => r.payment === 'Cash').reduce((s, r) => s + r.soldPrice * r.qty, 0);
    const card  = rows.filter(r => r.payment === 'Card').reduce((s, r) => s + r.soldPrice * r.qty, 0);
    const hc    = rows.filter(r => r.payment === 'Home Credit').reduce((s, r) => s + r.soldPrice * r.qty, 0);
    const met   = net >= store.settings.dailyTarget;
    const sm = {};
    rows.forEach(r => { sm[r.staff] = (sm[r.staff] || 0) + (r.netSales || 0); });
    const f = n => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Daily Sales Report</title><style>
body{font-family:Arial,sans-serif;padding:32px;font-size:12px;}h1{font-size:15px;margin-bottom:2px;}.sub{color:#666;font-size:11px;margin-bottom:16px;}
table{width:100%;border-collapse:collapse;margin:16px 0;}th{background:#1b2e6b;color:#fff;padding:8px;text-align:left;font-size:10px;}
td{padding:7px 8px;border-bottom:1px solid #eee;font-size:11px;}.tf td{background:#e8ecf4;font-weight:700;}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;}.box{border:1px solid #d0d7e8;border-radius:6px;padding:12px;}
.box h3{font-size:12px;font-weight:700;margin-bottom:8px;color:#1b2e6b;}.row{display:flex;justify-content:space-between;margin-bottom:4px;}
.sig{margin-top:40px;}@media print{body{padding:16px;}}
</style></head><body>
<h1>KHONSU ELECTRONIC GADGETS TRADING (ITEL MOBILE)</h1>
<div class="sub">Space No. K424.6 Festival Mall, FCC, Alabang, Muntinlupa City</div>
<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><div></div>
<div style="text-align:right;"><strong style="font-size:14px;">DAILY SALES REPORT</strong><br><span style="color:#666;">${date}</span></div></div>
<table><thead><tr><th>SO#</th><th>Code</th><th>Item</th><th>Variant</th><th>Color</th><th>Qty</th><th>Unit Price</th><th>SRP</th><th>Sold Price</th><th>Pasa</th><th>Discount</th><th>Net Sales</th><th>Payment</th><th>Walk-in</th><th>Pasa</th><th>Staff</th></tr></thead><tbody>`);
    rows.forEach(r => {
      win.document.write(`<tr><td>${r.so||'—'}</td><td>${r.bundle||'—'}</td><td>${r.itemName}</td><td>${r.variant||''}</td><td>${r.color||''}</td><td>${r.qty}</td><td>P ${f(r.unitPrice||0)}</td><td>P ${f(r.srp)}</td><td>P ${f(r.soldPrice*r.qty)}</td><td>${r.pasaPrice>0?'P '+f(r.pasaPrice):'N/A'}</td><td>${r.discount>0?'P '+f(r.discount):'N/A'}</td><td>P ${f(r.netSales||0)}</td><td>${r.payment}</td><td style="text-align:center;">${r.soldType==='Walk-in'?'✓':''}</td><td style="text-align:center;">${r.soldType==='Pasa'?'✓ '+(r.promoter||''):''}</td><td>${r.staff}</td></tr>`);
    });
    win.document.write(`</tbody><tfoot><tr class="tf"><td colspan="8">TOTAL</td><td>P ${f(gross)}</td><td></td><td>${disc>0?'P '+f(disc):'N/A'}</td><td>P ${f(net)}</td><td colspan="4"></td></tr></tfoot></table>
<div class="grid">
<div class="box"><h3>SALES SUMMARY</h3>
<div class="row"><span>Gross:</span><span>P ${f(gross)}</span></div>
<div class="row"><span>Discounts:</span><span>${disc>0?'P '+f(disc):'N/A'}</span></div>
<div class="row"><span>Net Sales:</span><span><strong>P ${f(net)}</strong></span></div>
<hr style="margin:8px 0;">
<div class="row"><span>Cash:</span><span>${cash>0?'P '+f(cash):'N/A'}</span></div>
<div class="row"><span>Card:</span><span>${card>0?'P '+f(card):'N/A'}</span></div>
<div class="row"><span>Home Credit:</span><span>${hc>0?'P '+f(hc):'N/A'}</span></div>
</div>
<div class="box"><h3>STAFF'S SALES</h3>
${Object.entries(sm).map(([n,v])=>`<div class="row"><span>${n}:</span><span>P ${f(v)}</span></div>`).join('')}
<hr style="margin:8px 0;">
<div class="row"><strong>DAILY TARGET: P ${f(store.settings.dailyTarget)}</strong></div>
</div>
<div class="box"><h3>RESULT</h3><div style="font-size:14px;font-weight:700;">${met?'MET':'BELOW TARGET'}</div></div>
</div>
<div class="sig"><p><strong>PREPARED BY:</strong></p>
<p style="margin-top:16px;">Name: ________________________________&nbsp;&nbsp;&nbsp;Date: ${date}</p>
<p style="margin-top:12px;">Signature: ________________________________</p></div>`);
    win.document.write('<scr'+'ipt>window.onload=()=>window.print();<\/scr'+'ipt></body></html>');
    win.document.close();
  }

  return {
    isImeiProduct, getAvailableUnits, makeSoNumber, makeBundleCode,
    buildPendingItem, addAnotherItem, goToReview,
    removePendingItem, editPendingItem, confirmSale,
    removeRow, generatePO, closeDayReport, printReport,
  };
}
