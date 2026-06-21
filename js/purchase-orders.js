import { state } from './state.js';
import { toast } from './toast.js';

export function generatePO(items) {
  let po = state.purchaseOrders.find(p => p.status === 'pending');
  if (po) {
    items.forEach(ni => {
      const ex = po.items.find(i => i.name === ni.name);
      if (ex) ex.qty += ni.qty; else po.items.push(ni);
    });
    po.date = new Date().toLocaleString('en-PH');
  } else {
    po = {
      id: 'PO-' + Date.now().toString().slice(-6),
      date: new Date().toLocaleString('en-PH'),
      supplier: 'Tecnix Trading',
      approver: 'Admin',
      items,
      status: 'pending',
    };
    state.purchaseOrders.unshift(po);
  }
  localStorage.setItem('kt_pos', JSON.stringify(state.purchaseOrders));
  if (state.scriptUrl) {
    fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logPO', ...po }),
    }).catch(() => {});
  }
  renderPOs();
}

export function renderPOs() {
  const el = document.getElementById('poList');
  if (!state.purchaseOrders.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">No purchase orders yet.</div>';
    return;
  }
  el.innerHTML = state.purchaseOrders.map(po => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent);margin-bottom:6px;">${po.id}</div>
          <div style="font-size:13px;color:var(--muted);line-height:1.9;">
            <strong style="color:var(--text);">Date:</strong> ${po.date}<br>
            <strong style="color:var(--text);">Supplier:</strong> ${po.supplier}<br>
            <strong style="color:var(--text);">Approver:</strong> ${po.approver}
          </div>
        </div>
        <span class="badge ${po.status === 'sent' ? 'bg' : 'by'}">${po.status === 'sent' ? '✓ Sent' : '⏳ Pending'}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead><tr>
          <th style="background:var(--accent);color:#fff;padding:8px;font-size:10px;text-align:left;">Item</th>
          <th style="background:var(--accent);color:#fff;padding:8px;font-size:10px;">Color/Notes</th>
          <th style="background:var(--accent);color:#fff;padding:8px;font-size:10px;text-align:right;">Qty</th>
        </tr></thead>
        <tbody>${po.items.map(i => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border);font-size:13px;">${i.name}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);">${i.color || '—'}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;text-align:right;font-family:monospace;">${i.qty}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        ${po.status === 'pending' ? `
          <button class="btn btn-outline btn-sm" onclick="openPOEdit('${po.id}')">✏️ Edit</button>
          <button class="btn btn-success btn-sm" onclick="markSent('${po.id}')">✓ Mark as Sent</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="printPO('${po.id}')">🖨 Print</button>
      </div>
    </div>`).join('');
}

export function markSent(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (po) {
    po.status = 'sent';
    localStorage.setItem('kt_pos', JSON.stringify(state.purchaseOrders));
    renderPOs();
    toast('PO marked as sent', 'success');
  }
}

export function openPOEdit(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  state.editingPOId = id;
  document.getElementById('poEditId').textContent = id;
  const dl = document.getElementById('poItemList');
  dl.innerHTML = state.masterList
    .filter(p => !p.obsolete)
    .map(p => {
      const v = (p.ram && p.storage) ? p.ram + '/' + p.storage : '';
      return `<option value="${p.name}${v ? ' (' + v + ')' : ''}">`;
    }).join('');
  renderPOEditItems(po);
  document.getElementById('po-new-item').value = '';
  document.getElementById('po-new-qty').value = '1';
  document.getElementById('po-new-color').value = '';
  document.getElementById('poEditModal').style.display = 'flex';
}

export function closePOEdit() {
  document.getElementById('poEditModal').style.display = 'none';
  state.editingPOId = null;
}

export function renderPOEditItems(po) {
  document.getElementById('poEditItems').innerHTML = '<div style="margin-bottom:12px;">' +
    po.items.map((item, i) => `
      <div style="display:grid;grid-template-columns:2fr 80px 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:600;">${item.name}</div>
        <input type="number" value="${item.qty}" min="1" oninput="updatePOItem(${i},'qty',this.value)"
          style="padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
        <input type="text" value="${item.color || 'Assorted'}" oninput="updatePOItem(${i},'color',this.value)"
          placeholder="Color/Notes" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
        <span onclick="removePOItem(${i})" style="cursor:pointer;color:var(--muted);font-size:16px;padding:4px;">✕</span>
      </div>`).join('') + '</div>';
}

export function updatePOItem(i, field, val) {
  const po = state.purchaseOrders.find(p => p.id === state.editingPOId);
  if (!po) return;
  if (field === 'qty') po.items[i].qty = parseInt(val) || 1;
  if (field === 'color') po.items[i].color = val;
}

export function removePOItem(i) {
  const po = state.purchaseOrders.find(p => p.id === state.editingPOId);
  if (!po) return;
  po.items.splice(i, 1);
  renderPOEditItems(po);
}

export function addPOLineItem() {
  const name = document.getElementById('po-new-item').value.trim();
  const qty = parseInt(document.getElementById('po-new-qty').value) || 1;
  const color = document.getElementById('po-new-color').value.trim() || 'Assorted';
  if (!name) { toast('Enter item name', 'error'); return; }
  const po = state.purchaseOrders.find(p => p.id === state.editingPOId);
  if (!po) return;
  po.items.push({ name, qty, color });
  renderPOEditItems(po);
  document.getElementById('po-new-item').value = '';
  document.getElementById('po-new-qty').value = '1';
  document.getElementById('po-new-color').value = '';
  toast('Line item added', 'success');
}

export function savePOEdit() {
  localStorage.setItem('kt_pos', JSON.stringify(state.purchaseOrders));
  if (state.scriptUrl) {
    fetch(state.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logPO', ...state.purchaseOrders.find(p => p.id === state.editingPOId) }),
    }).catch(() => {});
  }
  closePOEdit();
  renderPOs();
  toast('PO updated!', 'success');
}

export function printPO(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const statusColor = po.status === 'sent' ? '#16a34a' : '#d97706';
  const statusBg = po.status === 'sent' ? '#dcfce7' : '#fef3c7';
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${po.id}</title><style>
    body{font-family:Arial,sans-serif;padding:32px;font-size:12px;color:#111;}
    .sub{color:#666;font-size:11px;margin-bottom:0;}h1{font-size:15px;margin-bottom:2px;}
    table{width:100%;border-collapse:collapse;margin:16px 0;}
    th{background:#1b2e6b;color:#fff;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;}
    td{padding:8px;border-bottom:1px solid #eee;font-size:12px;}
    .meta{margin:12px 0;padding:12px;background:#f0f2f7;border-radius:6px;font-size:12px;line-height:2;}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${statusBg};color:${statusColor};}
    .sig{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}
    .sig-line{border-top:1px solid #000;padding-top:4px;color:#666;font-size:11px;margin-top:30px;}
    .footer{margin-top:20px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:10px;}
    @media print{body{padding:16px;}}
  </style></head><body>`);
  win.document.write('<h1>KHONSU ELECTRONIC GADGETS TRADING (ITEL MOBILE)</h1>');
  win.document.write('<div class="sub">Space No. K424.6 Festival Mall, FCC, Alabang, Muntinlupa City</div>');
  win.document.write('<div style="display:flex;justify-content:space-between;align-items:flex-start;margin:16px 0 0;">');
  win.document.write('<div></div>');
  win.document.write(`<div style="text-align:right;"><strong style="font-size:14px;">PURCHASE ORDER</strong><br><span style="color:#666;font-size:12px;">${po.date}</span></div>`);
  win.document.write('</div>');
  win.document.write(`<div class="meta"><strong>PO Number:</strong> ${po.id} &nbsp; <span class="badge">${po.status.toUpperCase()}</span><br><strong>Supplier:</strong> ${po.supplier}<br><strong>Approver:</strong> ${po.approver}</div>`);
  win.document.write('<table><thead><tr><th>Item</th><th>Color / Notes</th><th style="text-align:right;">Qty</th></tr></thead><tbody>');
  po.items.forEach(i => {
    win.document.write(`<tr><td>${i.name}</td><td style="color:#666;">${i.color || 'Assorted'}</td><td style="text-align:right;font-weight:600;font-family:monospace;">${i.qty}</td></tr>`);
  });
  win.document.write('</tbody></table>');
  win.document.write(`<div style="padding:10px 12px;background:#f0f2f7;border-radius:6px;display:flex;justify-content:space-between;margin-top:8px;"><span>Total Line Items</span><strong>${po.items.length}</strong></div>`);
  win.document.write('<div class="sig"><div><div class="sig-line">Prepared by — Signature / Date</div></div><div><div class="sig-line">Received by — Signature / Date</div></div></div>');
  win.document.write('<div class="footer">Generated by Khonsu Tech OPS</div>');
  win.document.write('<scr' + 'ipt>window.onload=()=>window.print();<\/scr' + 'ipt></body></html>');
  win.document.close();
}

window.markSent = markSent;
window.openPOEdit = openPOEdit;
window.closePOEdit = closePOEdit;
window.updatePOItem = updatePOItem;
window.removePOItem = removePOItem;
window.addPOLineItem = addPOLineItem;
window.savePOEdit = savePOEdit;
window.printPO = printPO;
