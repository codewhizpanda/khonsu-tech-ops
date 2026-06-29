import { state } from './state.js';
import { ik, vl } from './utils.js';
import { recalc } from './form.js';

export function toggleAddonPicker() {
  const el = document.getElementById('addonPicker');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') {
    buildAddonCatFilter();
    renderAddonGrid();
  }
}

export function buildAddonCatFilter() {
  const cats = ['All', 'Earbuds', 'Smart Watch', 'Power Bank', 'Others'];
  const el = document.getElementById('addonCatF');
  if (!el) return;
  el.innerHTML = cats.map(c =>
    `<button class="cat-btn${c === state.addonCat ? ' active' : ''}" data-ac="${encodeURIComponent(c)}">${c}</button>`
  ).join('');
  el.onclick = function (e) {
    const b = e.target.closest('.cat-btn');
    if (!b) return;
    state.addonCat = decodeURIComponent(b.dataset.ac);
    el.querySelectorAll('.cat-btn').forEach(x => x.classList.toggle('active', x === b));
    renderAddonGrid();
  };
}

export function renderAddonGrid() {
  const grid = document.getElementById('addonGrid');
  if (!grid) return;
  const allowed = ['Earbuds', 'Smart Watch', 'Power Bank', 'Others'];
  const list = state.PRODUCTS.filter(p =>
    allowed.includes(p.category) && (state.addonCat === 'All' || p.category === state.addonCat)
  );
  const map = {};
  grid.innerHTML = list.map((p, i) => {
    const key = ik(p);
    map[i] = key;
    const inv = state.inventory[key] || { stock: 0, reorder: 1 };
    const isOut = inv.stock <= 0;
    const isLow = !isOut && inv.stock <= inv.reorder;
    const isSel = state.selectedAddon && ik(state.selectedAddon.product) === key;
    let sc = 'sok', sl = inv.stock + ' left';
    if (isOut) { sc = 'sout'; sl = 'OUT'; } else if (isLow) { sc = 'slow'; sl = 'LOW:' + inv.stock; }
    return `<div class="pc${isOut ? ' oos' : ''}${isSel ? ' sel' : ''}" data-ai="${i}" style="padding:10px;">
      <div class="sb ${sc}">${sl}</div>
      <div class="cl">${p.category}</div>
      <div class="pn" style="font-size:12px;">${p.name}</div>
      <div class="pp" style="font-size:13px;">₱${p.srp.toLocaleString()}</div>
      ${isSel ? '<div style="font-size:10px;color:var(--green);margin-top:4px;">✓ Added</div>' : ''}
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);">No accessories.</div>';

  grid.onclick = function (e) {
    const c = e.target.closest('.pc');
    if (!c || c.classList.contains('oos')) return;
    const k = map[parseInt(c.dataset.ai)];
    const p = state.PRODUCTS.find(x => ik(x) === k);
    if (!p) return;
    state.selectedAddon = { product: p, soldPrice: p.srp };
    if (!document.getElementById('f-bundle').value) {
      state.bundleCounter++;
      localStorage.setItem('kt_pc', state.bundleCounter);
      const d = new Date();
      const dp = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      document.getElementById('f-bundle').value = 'BDL-' + dp + '-' + String(state.bundleCounter).padStart(3, '0');
    }
    document.getElementById('addonPickerBtn').style.display = 'none';
    document.getElementById('addonPicker').style.display = 'none';
    renderAddonList();
    recalc();
  };
}

export function renderAddonList() {
  if (!state.selectedAddon) {
    document.getElementById('addonList').style.display = 'none';
    return;
  }
  document.getElementById('addonList').style.display = 'block';
  const a = state.selectedAddon;
  document.getElementById('addonItems').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface);border:1.5px solid var(--accent);border-radius:8px;">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--accent);">${a.product.name}</div>
        <div style="font-size:11px;color:var(--muted);">Add-on price (editable)</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="color:var(--muted);">₱</span>
        <input type="number" value="${a.soldPrice}" min="0" oninput="updateAddonPrice(this.value)"
          style="width:90px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-family:monospace;font-weight:600;color:var(--accent);background:var(--bg);outline:none;">
        <span onclick="removeAddon()" style="cursor:pointer;color:var(--muted);font-size:18px;">✕</span>
      </div>
    </div>`;
}

export function updateAddonPrice(val) {
  if (state.selectedAddon) state.selectedAddon.soldPrice = parseFloat(val) || 0;
  recalc();
}

export function removeAddon() {
  state.selectedAddon = null;
  document.getElementById('f-bundle').value = '';
  document.getElementById('addonList').style.display = 'none';
  document.getElementById('addonPickerBtn').style.display = '';
  document.getElementById('addonPicker').style.display = 'none';
  renderAddonGrid();
  recalc();
}

window.toggleAddonPicker = toggleAddonPicker;
window.updateAddonPrice = updateAddonPrice;
window.removeAddon = removeAddon;
