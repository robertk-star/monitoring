(function () {
  const SETTINGS_ONLY_IDS = [
    'phase12a-panel',
    'phase12a17-mvr-test-link'
  ];

  const SETTINGS_ONLY_TITLES = [
    'TazWorks Manual Sync',
    'Latest raw sync summary',
    '6328 MVR Test Page'
  ];

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function currentPageTitle() {
    const h1 = document.querySelector('.page-header h1');
    return text(h1);
  }

  function isSettingsPage() {
    return currentPageTitle() === 'Settings';
  }

  function isSettingsOnlyNode(el) {
    if (!el || el === document.body || el === document.documentElement) return false;

    if (SETTINGS_ONLY_IDS.includes(el.id)) return true;

    const t = text(el);
    return SETTINGS_ONLY_TITLES.some((title) => t.includes(title));
  }

  function closestCard(el) {
    if (!el || !el.closest) return el;
    return el.closest('section.card, div.card, .wide-card, .settings-card') || el;
  }

  function removeSettingsOnlyPanels() {
    if (isSettingsPage()) return;

    SETTINGS_ONLY_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    Array.from(document.querySelectorAll('section.card, div.card, .wide-card, .settings-card, h2, h3')).forEach((el) => {
      if (isSettingsOnlyNode(el)) {
        const card = closestCard(el);
        if (card && card.parentNode) card.remove();
      }
    });

    // Extra guard for the raw summary block if it was left behind without the parent card.
    const rawSummaryHeading = Array.from(document.querySelectorAll('h2, h3')).find((el) => text(el).includes('Latest raw sync summary'));
    if (rawSummaryHeading) {
      const card = closestCard(rawSummaryHeading);
      if (card && card.parentNode) card.remove();
      else rawSummaryHeading.remove();
    }
  }

  function addBodyClass() {
    document.body.classList.toggle('phase12a20-settings-page', isSettingsPage());
    document.body.classList.toggle('phase12a20-not-settings-page', !isSettingsPage());
  }

  function addStyles() {
    if (document.getElementById('phase12a20-cleanup-style')) return;
    const style = document.createElement('style');
    style.id = 'phase12a20-cleanup-style';
    style.textContent = `
      body.phase12a20-not-settings-page #phase12a-panel,
      body.phase12a20-not-settings-page #phase12a17-mvr-test-link {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  let lastTitle = '';

  function refresh() {
    addStyles();
    addBodyClass();

    const title = currentPageTitle();
    if (title !== lastTitle) {
      lastTitle = title;
      setTimeout(removeSettingsOnlyPanels, 0);
      setTimeout(removeSettingsOnlyPanels, 100);
      setTimeout(removeSettingsOnlyPanels, 400);
    }

    removeSettingsOnlyPanels();
  }

  const observer = new MutationObserver(() => refresh());

  function boot() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    refresh();
    setInterval(refresh, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
