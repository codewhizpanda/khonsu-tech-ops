export function showPage(name, e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (e && e.target) e.target.classList.add('active');
  document.dispatchEvent(new CustomEvent('page:change', { detail: name }));
}

export function showS(name) {
  ['picker', 'detail', 'review', 'report'].forEach(s =>
    document.getElementById('s-' + s).style.display = s === name ? 'block' : 'none'
  );
  if (name === 'report') {
    document.getElementById('reportDate').textContent =
      new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  document.dispatchEvent(new CustomEvent('screen:change', { detail: name }));
}

window.showPage = showPage;
window.showS = showS;
