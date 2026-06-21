export function toggleCustomerInfo() {
  const el = document.getElementById('custInfoFields');
  const btn = document.getElementById('custInfoToggle');
  if (!el) return;
  const show = el.style.display === 'none';
  el.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '− Hide' : '+ Add';
}

export function getCustomerInfo() {
  const n = (document.getElementById('cust-name') || { value: '' }).value.trim();
  const c = (document.getElementById('cust-contact') || { value: '' }).value.trim();
  const e = (document.getElementById('cust-email') || { value: '' }).value.trim();
  return (n || c || e) ? { name: n, contact: c, email: e } : null;
}

export function resetCustomerInfo() {
  ['cust-name', 'cust-contact', 'cust-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const f = document.getElementById('custInfoFields');
  if (f) f.style.display = 'none';
  const b = document.getElementById('custInfoToggle');
  if (b) b.textContent = '+ Add';
}

window.toggleCustomerInfo = toggleCustomerInfo;
