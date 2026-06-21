import { state } from './state.js';
import { ik, vl } from './utils.js';

export function renderInv() {
  const body = document.getElementById('invBody');
  let out = 0, low = 0, ok = 0;
  body.innerHTML = state.masterList.map(p => {
    const key = ik(p);
    const inv = state.inventory[key] || { stock: 0, reorder: 1 };
    const isOut = inv.stock <= 0;
    const isLow = !isOut && inv.stock <= inv.reorder;
    if (isOut) out++; else if (isLow) low++; else ok++;
    const badge = isOut
      ? '<span class="sb sout" style="position:static;display:inline-flex;">OUT</span>'
      : isLow
        ? '<span class="sb slow" style="position:static;display:inline-flex;">LOW</span>'
        : '<span class="sb sok" style="position:static;display:inline-flex;">OK</span>';
    const obs = p.obsolete
      ? '<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;margin-left:6px;">Obsolete</span>'
      : '';
    return `<tr>
      <td>${p.category}</td>
      <td style="font-weight:600;">${p.name}${obs}</td>
      <td style="color:var(--muted);">${vl(p) || '—'}</td>
      <td style="font-size:12px;color:var(--muted);">${p.colors || '—'}</td>
      <td class="mono">₱${(p.srp || 0).toLocaleString()}</td>
      <td class="mono" style="font-weight:700;">${inv.stock}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
  document.getElementById('iv-tot').textContent = state.masterList.length;
  document.getElementById('iv-out').textContent = out;
  document.getElementById('iv-low').textContent = low;
  document.getElementById('iv-ok').textContent = ok;
}
