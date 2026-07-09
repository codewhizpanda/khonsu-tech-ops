export function ic(name, size = 15) {
  return `<svg style="width:${size}px;height:${size}px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.125em;display:inline-block;" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
}

export function ik(p) {
  let k = p.name;
  if (p.ram) k += ' ' + p.ram;
  if (p.storage) k += '/' + p.storage;
  return k;
}

export function vl(p) {
  return (p.ram && p.storage) ? p.ram + ' / ' + p.storage : '';
}

// Parse a date value from Google Sheets — may be a locale string ("6/29/2026"),
// an ISO string ("2026-06-28T16:00:00.000Z"), or a Date object.
// Returns a Date in the browser's local timezone, or null on failure.
export function parseSheetDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

export function sameDay(raw, ref = new Date()) {
  const d = parseSheetDate(raw);
  return d &&
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();
}

export function fmtSheetDate(raw) {
  const d = parseSheetDate(raw);
  return d ? d.toLocaleDateString('en-PH') : String(raw || '—');
}

// Units (IMEI-tracked: phones/tablets) sort before accessories; alphabetical
// by name within each group. Shared by Master List, Inventory, and any other
// product list/picker that should present items in this order.
export const UNIT_CATEGORIES = new Set(['Bar Phone', 'Smart Phone', 'Tablet']);

// Canonical display order for every category — also the New Item dropdown
// order in MasterListPage.vue, so there's one definition instead of two that
// could drift.
export const CATEGORY_ORDER = ['Bar Phone', 'Smart Phone', 'Tablet', 'Earbuds', 'Smart Watch', 'Power Bank', 'Others'];

export function compareProducts(a, b) {
  const groupA = CATEGORY_ORDER.indexOf(a.category);
  const groupB = CATEGORY_ORDER.indexOf(b.category);
  if (groupA !== groupB) return (groupA === -1 ? CATEGORY_ORDER.length : groupA) - (groupB === -1 ? CATEGORY_ORDER.length : groupB);
  return a.name.localeCompare(b.name);
}

export function fmt(n) {
  return n === 0 || !n
    ? 'N/A'
    : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
