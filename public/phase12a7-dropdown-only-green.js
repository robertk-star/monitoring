(function () {
  const GREEN = '#1fff00';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isMonitoringPage() {
    return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Monitoring');
  }

  function getMonitoringTable() {
    if (!isMonitoringPage()) return null;
    return Array.from(document.querySelectorAll('table')).find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
        text(th).replace(/[↕↑↓]/g, '').trim().toLowerCase()
      );
      return headers.includes('file #') &&
        headers.includes('name') &&
        headers.includes('monitoring') &&
        headers.includes('med expire');
    }) || null;
  }

  function rows() {
    const table = getMonitoringTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.querySelectorAll('td').length >= 7);
  }

  function applyDropdownOnlyStyle() {
    if (!isMonitoringPage()) return;

    document.body.classList.add('phase12a7-dropdown-only-green');

    rows().forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      const select = cells[3] ? cells[3].querySelector('select') : null;
      if (!select) return;

      const isOn = String(select.value || '').trim() === 'On';

      select.classList.toggle('phase12a7-monitoring-on-select', isOn);
      select.classList.toggle('phase12a7-monitoring-off-select', !isOn);

      // Remove old row-level styling if prior scripts added inline styles.
      if (isOn) {
        row.style.background = '';
        row.style.boxShadow = '';
        cells.forEach((cell) => {
          cell.style.background = '';
          cell.style.boxShadow = '';
        });
      }
    });
  }

  function addStyles() {
    if (document.getElementById('phase12a7-style')) return;

    const style = document.createElement('style');
    style.id = 'phase12a7-style';
    style.textContent = `
      body.phase12a7-dropdown-only-green tr.phase12a6-monitoring-on td,
      body.phase12a7-dropdown-only-green tr.monitoring-row-on td,
      body.phase12a7-dropdown-only-green tr.phase12a6-monitoring-on:hover td {
        background: #fff !important;
        box-shadow: none !important;
      }

      body.phase12a7-dropdown-only-green select.phase12a7-monitoring-on-select,
      body.phase12a7-dropdown-only-green select.phase12a6-select-on {
        border-color: ${GREEN} !important;
        background: rgba(31, 255, 0, 0.16) !important;
        box-shadow: 0 0 0 2px rgba(31, 255, 0, 0.20) !important;
        color: #0f172a !important;
        font-weight: 900 !important;
      }

      body.phase12a7-dropdown-only-green select.phase12a7-monitoring-off-select {
        border-color: #cbd5e1 !important;
        background: #fff !important;
        box-shadow: none !important;
        color: #0f172a !important;
        font-weight: 500 !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('change', function (event) {
    if (!isMonitoringPage()) return;
    const target = event.target;
    if (target && target.tagName === 'SELECT') {
      setTimeout(applyDropdownOnlyStyle, 50);
      setTimeout(applyDropdownOnlyStyle, 300);
      setTimeout(applyDropdownOnlyStyle, 900);
    }
  }, true);

  function refresh() {
    addStyles();
    applyDropdownOnlyStyle();
  }

  setInterval(refresh, 800);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
