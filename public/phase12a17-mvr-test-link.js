(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function isSettingsPage() { return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings'); }
  function addLink() {
    if (!isSettingsPage() || document.getElementById('phase12a17-mvr-test-link')) return;
    const anchor = document.getElementById('phase12a-panel') || Array.from(document.querySelectorAll('section.card')).find((section) => text(section).includes('TazWorks'));
    const card = document.createElement('section');
    card.id = 'phase12a17-mvr-test-link';
    card.className = 'card wide-card settings-card';
    card.innerHTML = '<h2>6328 MVR Test Page</h2><p class="muted">Open a diagnostic page showing the full order, search rows, result pulls, text previews, and date extraction diagnostics for file 6328.</p><a href="/mvr-test.html" target="_blank" rel="noopener" style="display:inline-flex;border:1px solid #16a34a;background:#ecfdf5;color:#166534;border-radius:999px;padding:9px 12px;font-weight:900;text-decoration:none">Open MVR Test Page</a>';
    if (anchor) anchor.insertAdjacentElement('afterend', card);
    else document.querySelector('.main-panel')?.appendChild(card);
  }
  setInterval(addLink, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLink);
  else addLink();
})();

// PHASE12A20_SETTINGS_ONLY_TAIL
(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function isSettings() { return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings'); }
  function cleanup() {
    if (isSettings()) return;
    document.getElementById('phase12a17-mvr-test-link')?.remove();
  }
  setInterval(cleanup, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanup);
  else cleanup();
})();
