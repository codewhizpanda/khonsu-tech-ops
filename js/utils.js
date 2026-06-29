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

export function fmt(n) {
  return n === 0 || !n
    ? 'N/A'
    : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}
