(function () {
  const GREEN = '#1fff00';
  let activeFilter = localStorage.getItem('phase12a6-monitoring-filter') || 'all';

  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function isMonitoringPage() { return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Monitoring'); }

  function getTable() {
    if (!isMonitoringPage()) return null;
    return Array.from(document.querySelectorAll('table')).find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => text(th).replace(/[↕↑↓]/g, '').trim().toLowerCase());
      return headers.includes('file #') && headers.includes('name') && headers.includes('monitoring') && headers.includes('med expire');
    }) || null;
  }

  // PHASE12A51_TERMINATED_ALERT_SOURCE_FIX
  function isTerminatedRow(row) {
    if (!row) return false;
    if (row.hasAttribute('data-phase12a46-monitoring-hidden')) return true;
    if (row.hasAttribute('data-phase12a46-client-monitoring-hidden')) return true;
    const cb = row.querySelector('[data-phase12a45-terminated], [data-unterm]');
    return Boolean(cb && cb.checked);
  }

  function rows() {
    const table = getTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.querySelectorAll('td').length >= 7 && !isTerminatedRow(row));
  }

  function cellValue(cell) {
    if (!cell) return '';
    const select = cell.querySelector('select');
    if (select) return String(select.value || '').trim();
    const input = cell.querySelector('input');
    if (input) return String(input.value || '').trim();
    const textarea = cell.querySelector('textarea');
    if (textarea) return String(textarea.value || '').trim();
    return text(cell);
  }

  function data(row) {
    const c = Array.from(row.querySelectorAll('td'));
    const medExpire = cellValue(c[5]);
    const medDate = parseDate(medExpire);
    return {
      monitoring: cellValue(c[3]),
      medExpire,
      medDate,
      medDays: medDate ? Math.ceil((medDate.getTime() - today().getTime()) / 86400000) : null,
      mvrStatus: cellValue(c[4])
    };
  }

  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? Number('20' + m[3]) : Number(m[3]);
      return new Date(y, Number(m[1]) - 1, Number(m[2]));
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function state(row) {
    const d = data(row);
    if (d.monitoring !== 'On') return 'off';
    if (!d.medDate) return 'blank';
    if (d.medDays < 0) return 'expired';
    if (d.medDays <= 30) return 'exp30';
    if (d.medDays <= 60) return 'exp60';
    if (/pending|review|needed|expired|attention/i.test(d.mvrStatus || '')) return 'mvr';
    return 'ok';
  }

  function counts() {
    const out = { total: 0, on: 0, off: 0, expired: 0, exp30: 0, exp60: 0, blank: 0, mvr: 0 };
    rows().forEach((row) => {
      const d = data(row);
      const s = state(row);
      out.total++;
      if (d.monitoring === 'On') out.on++;
      else out.off++;
      if (s === 'expired') out.expired++;
      if (s === 'exp30') out.exp30++;
      if (s === 'exp60') out.exp60++;
      if (s === 'blank') out.blank++;
      if (s === 'mvr') out.mvr++;
    });
    return out;
  }

  function shouldShow(row) {
    if (isTerminatedRow(row)) return false;
    const d = data(row);
    const s = state(row);
    if (activeFilter === 'all') return true;
    if (activeFilter === 'on') return d.monitoring === 'On';
    if (activeFilter === 'off') return d.monitoring !== 'On';
    if (activeFilter === 'expired') return s === 'expired';
    if (activeFilter === 'exp30') return s === 'exp30';
    if (activeFilter === 'exp60') return s === 'exp60';
    if (activeFilter === 'blank') return s === 'blank';
    if (activeFilter === 'mvr') return s === 'mvr';
    return true;
  }

  function setCount(button, count, label) {
    if (!button) return;
    button.innerHTML = `<b>${count}</b>${label}`;
  }

  function metricButton(labelText) {
    const card = document.getElementById('monitoring-alerts-panel') || Array.from(document.querySelectorAll('section.card, div.card')).find((el) => text(el).includes('Monitoring Alerts'));
    if (!card) return null;
    return Array.from(card.querySelectorAll('button')).find((button) => text(button).toLowerCase().includes(labelText.toLowerCase())) || null;
  }

  function updateCounts() {
    const c = counts();
    setCount(metricButton('Total'), c.total, 'Total');
    setCount(metricButton('On Monitoring'), c.on, 'On Monitoring');
    setCount(metricButton('Off Monitoring'), c.off, 'Off Monitoring');
    setCount(metricButton('Expired Medical'), c.expired, 'Expired Medical');
    setCount(metricButton('Expiring 30 Days'), c.exp30, 'Expiring 30 Days');
    setCount(metricButton('Expiring 60 Days'), c.exp60, 'Expiring 60 Days');
    setCount(metricButton('Blank Med Expire'), c.blank, 'Blank Med Expire');
    setCount(metricButton('MVR Attention'), c.mvr, 'MVR Attention');

    const filterMap = [
      ['Total', 'all'], ['On Monitoring', 'on'], ['Off Monitoring', 'off'], ['Expired Medical', 'expired'],
      ['Expiring 30 Days', 'exp30'], ['Expiring 60 Days', 'exp60'], ['Blank Med Expire', 'blank'], ['MVR Attention', 'mvr']
    ];
    filterMap.forEach(([label, filter]) => {
      const btn = metricButton(label);
      if (!btn) return;
      btn.dataset.phase12a6Filter = filter;
      btn.classList.toggle('phase12a6-active-filter', activeFilter === filter);
    });
  }

  function decorateRows() {
    rows().forEach((row) => {
      const d = data(row);
      const on = d.monitoring === 'On';
      row.classList.toggle('phase12a6-monitoring-on', on);
      row.style.display = shouldShow(row) ? '' : 'none';

      const cells = Array.from(row.querySelectorAll('td'));
      const select = cells[3] ? cells[3].querySelector('select') : null;
      if (select) select.classList.toggle('phase12a6-select-on', on);
    });
  }

  function addStyles() {
    if (document.getElementById('phase12a6-alert-style')) return;
    const style = document.createElement('style');
    style.id = 'phase12a6-alert-style';
    style.textContent = `
      tr.phase12a6-monitoring-on td {
        background: rgba(31, 255, 0, 0.09) !important;
        box-shadow: inset 5px 0 0 ${GREEN};
      }
      tr.phase12a6-monitoring-on:hover td {
        background: rgba(31, 255, 0, 0.14) !important;
      }
      select.phase12a6-select-on {
        border-color: ${GREEN} !important;
        background: rgba(31, 255, 0, 0.14) !important;
        font-weight: 800;
      }
      [data-phase12a6-filter] {
        cursor: pointer;
      }
      [data-phase12a6-filter].phase12a6-active-filter {
        background: rgba(31, 255, 0, 0.16) !important;
        border-color: ${GREEN} !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function(event) {
    const btn = event.target && event.target.closest ? event.target.closest('[data-phase12a6-filter]') : null;
    if (!btn) return;
    activeFilter = btn.dataset.phase12a6Filter || 'all';
    localStorage.setItem('phase12a6-monitoring-filter', activeFilter);
    refresh();
  }, true);

  document.addEventListener('change', function(event) {
    const el = event.target;
    if (el && el.tagName === 'SELECT' && isMonitoringPage()) {
      setTimeout(refresh, 100);
      setTimeout(refresh, 500);
    }
  }, true);

  function refresh() {
    if (!isMonitoringPage()) return;
    addStyles();
    updateCounts();
    decorateRows();
  }

  setInterval(refresh, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
