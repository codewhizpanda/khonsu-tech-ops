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
