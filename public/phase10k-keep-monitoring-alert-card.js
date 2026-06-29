(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function pageTitle() {
    const h1 = document.querySelector('.page-header h1');
    return text(h1);
  }

  function isMonitoringPage() {
    return pageTitle() === 'Monitoring';
  }

  function renameMonitoringAlerts() {
    if (!isMonitoringPage()) return;

    const phase8Title = document.querySelector('#phase8-panel .phase8-title');
    if (phase8Title && text(phase8Title).includes('Phase 8')) {
      phase8Title.textContent = text(phase8Title).replace(/^Phase\s*8\s*/i, '').trim() || 'Monitoring Alerts';
    }

    Array.from(document.querySelectorAll('section.card, div.card, .wide-card')).forEach((card) => {
      const cardText = text(card);
      if (!/Phase\s*8\s+Monitoring\s+Alerts/i.test(cardText)) return;

      const titleCandidates = [
        card.querySelector('.phase8-title'),
        card.querySelector('h2'),
        card.querySelector('h3'),
        card.querySelector('strong')
      ].filter(Boolean);

      titleCandidates.forEach((title) => {
        if (/Phase\s*8\s+Monitoring\s+Alerts/i.test(text(title))) {
          title.textContent = 'Monitoring Alerts';
        }
      });
    });
  }

  function undoPhase9FlashHiderIfPresent() {
    // If Phase 10J was installed, it may hide the Phase 9 permission card on Monitoring.
    // This does not force the Phase 9 card to show; it only stops the no-flash script from hiding/removing cards by body class.
    document.body.classList.remove('phase10j-monitoring-page');

    const style = document.getElementById('phase10j-style');
    if (style) style.disabled = true;
  }

  function keepMonitoringAlertCardVisible() {
    const panel = document.getElementById('phase8-panel');
    if (panel) {
      panel.style.display = '';
      panel.style.height = '';
      panel.style.margin = '';
      panel.style.padding = '';
      panel.style.border = '';
      panel.style.overflow = '';
      panel.removeAttribute('aria-hidden');
    }
  }

  function run() {
    if (!isMonitoringPage()) return;
    undoPhase9FlashHiderIfPresent();
    keepMonitoringAlertCardVisible();
    renameMonitoringAlerts();
  }

  setInterval(run, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
