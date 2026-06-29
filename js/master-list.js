import { state, saveInv } from './state.js';
import { ik, vl } from './utils.js';
import { toast } from './toast.js';
import { renderInv } from './inventory.js';
import { buildCatFilter, renderProducts } from './products.js';
import { COLORS } from './data.js';
import { tryPush } from './sync.js';

export function renderML() {
  const q = (document.getElementById('mlSearch') || { value: '' }).value.toLowerCase();
  const filtered = state.masterList.map((p, i) => ({ p, i })).filter(({ p }) =>
    (p.name + ' ' + vl(p) + ' ' + p.category).toLowerCase().includes(q)
  );
  document.getElementById('mlBody').innerHTML = filtered.map(({ p, i }) => `<tr>
    <td style="font-size:12px;color:var(--muted);">${p.category}</td>
    <td style="font-weight:600;">${p.name}</td>
    <td style="font-size:12px;color:var(--muted);">${vl(p) || '—'}</td>
    <td><input type="text" value="${p.colors || ''}" oninput="masterList[${i}].colors=this.value"
      style="min-width:150px;padding:5px 8px;font-size:12px;"></td>
    <td><input type="number" value="${p.unitPrice}" oninput="masterList[${i}].unitPrice=parseFloat(this.value)||0"
      style="width:85px;padding:5px 8px;font-size:12px;"></td>
    <td><input type="number" value="${p.srp}" oninput="masterList[${i}].srp=parseFloat(this.value)||0"
      style="width:85px;padding:5px 8px;font-size:12px;"></td>
    <td><button class="toggle-obs ${p.obsolete ? '' : 'avail'}" onclick="toggleObs(${i})">${p.obsolete ? 'Obsolete' : 'Available'}</button></td>
  </tr>`).join('');

  renderBundleList();
  renderFreebieList();
}

export function toggleObs(i) {
  state.masterList[i].obsolete = !state.masterList[i].obsolete;
  renderML();
}

export function openNewItemModal() {
  ['ni-name', 'ni-ram', 'ni-storage', 'ni-unitprice', 'ni-srp', 'ni-colors'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('newItemModal').style.display = 'flex';
}

export function closeNewItemModal() {
  document.getElementById('newItemModal').style.display = 'none';
}

export function saveNewItem() {
  const cat = document.getElementById('ni-cat').value;
  const name = document.getElementById('ni-name').value.trim();
  if (!name) { toast('Product name required', 'error'); return; }
  const newP = {
    category: cat, name,
    ram: document.getElementById('ni-ram').value.trim(),
    storage: document.getElementById('ni-storage').value.trim(),
    unitPrice: parseFloat(document.getElementById('ni-unitprice').value) || 0,
    srp: parseFloat(document.getElementById('ni-srp').value) || 0,
    colors: document.getElementById('ni-colors').value.trim() || (COLORS[cat] || []).join(', '),
    obsolete: false,
  };
  state.masterList.push(newP);
  if (!state.inventory[ik(newP)]) state.inventory[ik(newP)] = { stock: 0, reorder: 1 };
  closeNewItemModal();
  renderML();
  toast('Product added — remember to Save Changes', 'success');
}

export function openFreebieModal() {
  const mainSel = document.getElementById('fr-main');
  const addonSel = document.getElementById('fr-addon');
  const phones = state.masterList.filter(p => !p.obsolete && ['Smart Phone', 'Tablet', 'Bar Phone'].includes(p.category));
  const accessories = state.masterList.filter(p => !p.obsolete && ['Earbuds', 'Smart Watch', 'Power Bank', 'Others'].includes(p.category));
  mainSel.innerHTML = '<option value="">— Select product —</option>' +
    phones.map(p => `<option value="${ik(p)}">${p.name}${vl(p) ? ' (' + vl(p) + ')' : ''}</option>`).join('');
  addonSel.innerHTML = '<option value="">— Select freebie —</option>' +
    accessories.map(p => `<option value="${ik(p)}">${p.name}</option>`).join('');
  document.getElementById('freebieModal').style.display = 'flex';
}

function pushFreebies() {
  const freebies = Object.entries(state.productFreebies).map(([mainKey, freebieKey]) => {
    const mainP = state.masterList.find(p => ik(p) === mainKey);
    const fbP = state.masterList.find(p => ik(p) === freebieKey);
    return { mainKey, freebieKey, mainName: mainP ? mainP.name : '', freebieName: fbP ? fbP.name : '' };
  });
  tryPush('saveFreebies', { freebies });
}

export function saveFreebie() {
  const mainKey = document.getElementById('fr-main').value;
  const addonKey = document.getElementById('fr-addon').value;
  if (!mainKey) { toast('Select a main product', 'error'); return; }
  if (!addonKey) { toast('Select a freebie item', 'error'); return; }
  state.productFreebies[mainKey] = addonKey;
  localStorage.setItem('kt_freebies', JSON.stringify(state.productFreebies));
  pushFreebies();
  document.getElementById('freebieModal').style.display = 'none';
  renderFreebieList();
  toast('Freebie saved!', 'success');
}

export function deleteFreebie(mainKey) {
  delete state.productFreebies[mainKey];
  localStorage.setItem('kt_freebies', JSON.stringify(state.productFreebies));
  pushFreebies();
  renderFreebieList();
  toast('Freebie removed', 'success');
}

export function renderFreebieList() {
  const el = document.getElementById('freebieList');
  if (!el) return;
  const keys = Object.keys(state.productFreebies);
  if (!keys.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">No freebies defined yet.</div>';
    return;
  }
  el.innerHTML = keys.map(mk => {
    const mainP = state.masterList.find(p => ik(p) === mk);
    const addonP = state.masterList.find(p => ik(p) === state.productFreebies[mk]);
    if (!mainP || !addonP) return '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--accent);">${mainP.name}${vl(mainP) ? ' (' + vl(mainP) + ')' : ''}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:4px;"><svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;" aria-hidden="true"><use href="#ic-gift"/></svg>${addonP.name}</div>
      </div>
      <span data-fk="${encodeURIComponent(mk)}" onclick="deleteFreebie(decodeURIComponent(this.dataset.fk))"
        style="cursor:pointer;color:var(--muted);font-size:16px;">✕</span>
    </div>`;
  }).join('');
}

export function openNewBundleModal() {
  document.getElementById('nb-name').value = '';
  document.getElementById('nb-price').value = '';
  const phones = state.masterList.filter(p => !p.obsolete && ['Smart Phone', 'Tablet', 'Bar Phone'].includes(p.category));
  const accessories = state.masterList.filter(p => !p.obsolete && ['Earbuds', 'Smart Watch', 'Power Bank', 'Others'].includes(p.category));
  document.getElementById('nb-main').innerHTML = '<option value="">— Select main item —</option>' +
    phones.map(p => `<option value="${ik(p)}">${p.name}${vl(p) ? ' (' + vl(p) + ')' : ''}</option>`).join('');
  document.getElementById('nb-addon').innerHTML = '<option value="">— Select accessory —</option>' +
    accessories.map(p => `<option value="${ik(p)}">${p.name}</option>`).join('');
  document.getElementById('newBundleModal').style.display = 'flex';
}

export function closeNewBundleModal() {
  document.getElementById('newBundleModal').style.display = 'none';
}

function pushBundles() {
  tryPush('savePromotions', { bundles: state.predefinedBundles });
}

export function saveNewBundle() {
  const name = document.getElementById('nb-name').value.trim();
  const price = parseFloat(document.getElementById('nb-price').value) || 0;
  const mainKey = document.getElementById('nb-main').value;
  const addonKey = document.getElementById('nb-addon').value;
  if (!name) { toast('Bundle name required', 'error'); return; }
  if (!mainKey) { toast('Select a main item', 'error'); return; }
  if (!addonKey) { toast('Select an accessory', 'error'); return; }
  if (!price) { toast('Bundle price required', 'error'); return; }
  const mainP = state.masterList.find(p => ik(p) === mainKey);
  const addonP = state.masterList.find(p => ik(p) === addonKey);
  const bundle = {
    id: 'BND-' + Date.now().toString().slice(-5),
    name, price, mainKey,
    mainName: mainP.name + (vl(mainP) ? ' (' + vl(mainP) + ')' : ''),
    addonKey,
    addonName: addonP.name,
  };
  state.predefinedBundles.push(bundle);
  localStorage.setItem('kt_bundles', JSON.stringify(state.predefinedBundles));
  pushBundles();
  closeNewBundleModal();
  renderBundleList();
  renderProducts();
  toast('Promotion saved!', 'success');
}

export function deleteBundle(id) {
  state.predefinedBundles = state.predefinedBundles.filter(b => b.id !== id);
  localStorage.setItem('kt_bundles', JSON.stringify(state.predefinedBundles));
  pushBundles();
  renderBundleList();
  renderProducts();
  toast('Promotion deleted', 'success');
}

export function renderBundleList() {
  const el = document.getElementById('bundleList');
  if (!el) return;
  if (!state.predefinedBundles.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">No promotions defined yet.</div>';
    return;
  }
  el.innerHTML = state.predefinedBundles.map(b => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--accent);">${b.name}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${b.mainName} + ${b.addonName}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:15px;font-weight:700;color:var(--accent);font-family:monospace;">₱${b.price.toLocaleString()}</div>
        <span onclick="deleteBundle('${b.id}')" style="cursor:pointer;color:var(--muted);font-size:16px;" title="Delete">✕</span>
      </div>
    </div>`).join('');
}

export function saveMasterList() {
  localStorage.setItem('kt_ml', JSON.stringify(state.masterList));
  state.PRODUCTS = state.masterList.filter(p => !p.obsolete);
  state.masterList.forEach(p => {
    if (!state.inventory[ik(p)]) state.inventory[ik(p)] = { stock: 0, reorder: 1 };
  });
  saveInv();
  buildCatFilter();
  renderProducts();

  const productRows = state.masterList.map(p => [
    ik(p), p.category, p.name, p.ram || '', p.storage || '',
    p.colors || '', p.unitPrice, p.srp, p.obsolete ? 'Obsolete' : 'Active',
  ]);
  tryPush('saveProducts', { rows: productRows });

  const inventoryRows = state.masterList.map(p => ({
    productKey: ik(p),
    stock: (state.inventory[ik(p)] || {}).stock || 0,
    reorder: (state.inventory[ik(p)] || {}).reorder || 1,
  }));
  tryPush('saveInventory', { rows: inventoryRows });

  toast('Master list saved!', 'success');
}

window.masterList = state.masterList;
window.toggleObs = toggleObs;
window.openNewItemModal = openNewItemModal;
window.closeNewItemModal = closeNewItemModal;
window.saveNewItem = saveNewItem;
window.saveMasterList = saveMasterList;
window.openNewBundleModal = openNewBundleModal;
window.closeNewBundleModal = closeNewBundleModal;
window.saveNewBundle = saveNewBundle;
window.deleteBundle = deleteBundle;
window.openFreebieModal = openFreebieModal;
window.saveFreebie = saveFreebie;
window.deleteFreebie = deleteFreebie;
