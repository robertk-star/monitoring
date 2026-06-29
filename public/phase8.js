(function () {
  const FILTER_KEY = 'saffhire_monitoring_filter_final_v2';
  let sortKey = '';
  let sortDir = 'asc';
  let lastSignature = '';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isMonitoringPage() {
    const h1 = document.querySelector('.page-header h1');
    return text(h1) === 'Monitoring';
  }

  function getTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => text(th).toLowerCase());
      return headers.includes('file #') &&
        headers.includes('name') &&
        headers.includes('order date') &&
        headers.includes('monitoring') &&
        headers.includes('med expire');
    }) || null;
  }

  function getRows() {
    const table = getTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.querySelectorAll('td').length >= 7);
  }

  function cells(row) {
    return Array.from(row.querySelectorAll('td'));
  }

  function value(cell) {
    if (!cell) return '';
    const input = cell.querySelector('input');
    if (input) return String(input.value || '').trim();
    const select = cell.querySelector('select');
    if (select) return String(select.value || '').trim();
    const textarea = cell.querySelector('textarea');
    if (textarea) return String(textarea.value || '').trim();
    return text(cell);
  }

  function parseDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? Number('20' + m[3]) : Number(m[3]);
      return new Date(year, Number(m[1]) - 1, Number(m[2]));
    }

    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function daysUntil(date) {
    if (!date) return null;
    return Math.ceil((date.getTime() - today().getTime()) / 86400000);
  }

  function rowData(row) {
    const c = cells(row);
    const medExpire = value(c[5]);
    const medDate = parseDate(medExpire);
    return {
      fileNumber: text(c[0]),
      name: text(c[1]),
      orderDate: text(c[2]),
      monitoring: value(c[3]),
      mvrStatus: text(c[4]),
      medExpire,
      medDate,
      medDays: daysUntil(medDate),
      notes: value(c[6])
    };
  }

  function rowState(row) {
    const data = rowData(row);
    if (data.monitoring !== 'On') return 'off';
    if (!data.medDate) return 'blank';
    if (data.medDays < 0) return 'expired';
    if (data.medDays <= 30) return 'exp30';
    if (data.medDays <= 60) return 'exp60';
    if (/pending|review|needed|expired|attention/i.test(data.mvrStatus || '')) return 'mvr';
    return 'ok';
  }

  function getCounts() {
    const out = { total: 0, on: 0, off: 0, expired: 0, exp30: 0, exp60: 0, blank: 0, mvr: 0 };
    getRows().forEach((row) => {
      const data = rowData(row);
      const state = rowState(row);
      out.total += 1;
      if (data.monitoring === 'On') out.on += 1;
      else out.off += 1;
      if (state === 'expired') out.expired += 1;
      if (state === 'exp30') out.exp30 += 1;
      if (state === 'exp60') out.exp60 += 1;
      if (state === 'blank') out.blank += 1;
      if (state === 'mvr') out.mvr += 1;
    });
    return out;
  }

  function shouldShow(row, filter) {
    const data = rowData(row);
    const state = rowState(row);
    if (filter === 'all') return true;
    if (filter === 'on') return data.monitoring === 'On';
    if (filter === 'off') return data.monitoring !== 'On';
    if (filter === 'expired') return state === 'expired';
    if (filter === 'exp30') return state === 'exp30';
    if (filter === 'exp60') return state === 'exp60';
    if (filter === 'blank') return state === 'blank';
    if (filter === 'mvr') return state === 'mvr';
    return true;
  }

  function applyFilter(filter) {
    localStorage.setItem(FILTER_KEY, filter);
    getRows().forEach((row) => {
      row.style.display = shouldShow(row, filter) ? '' : 'none';
    });
    document.querySelectorAll('[data-monitoring-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.monitoringFilter === filter);
    });
  }

  function cleanNumber(value) {
    const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function sortValue(row, key) {
    const data = rowData(row);
    if (key === 'file') return cleanNumber(data.fileNumber);
    if (key === 'name') return data.name.toLowerCase();
    if (key === 'order') return data.orderDate ? (parseDate(data.orderDate)?.getTime() || 0) : 0;
    if (key === 'med') return data.medDate ? data.medDate.getTime() : 0;
    return '';
  }

  function sortRows(key, forcedDir) {
    const table = getTable();
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const dir = forcedDir || (sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    sortKey = key;
    sortDir = dir;

    const rows = getRows();
    rows.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);

      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }

      const result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return dir === 'asc' ? result : -result;
    });

    rows.forEach((row) => tbody.appendChild(row));
    updateHeaders();
    applyFilter(localStorage.getItem(FILTER_KEY) || 'all');
  }

  function updateHeaders() {
    const table = getTable();
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th'));
    const map = { file: 0, name: 1, order: 2, med: 5 };

    Object.entries(map).forEach(([key, index]) => {
      const th = headers[index];
      if (!th) return;
      const label = th.dataset.originalLabel || text(th).replace(/[↕↑↓]/g, '').trim();
      th.dataset.originalLabel = label;
      const arrow = sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
      const muted = sortKey === key ? '' : ' muted';
      th.innerHTML = `${label} <span class="monitoring-sort-arrow${muted}">${arrow}</span>`;
      th.classList.add('monitoring-sortable');

      if (!th.dataset.sortReady) {
        th.dataset.sortReady = 'true';
        th.addEventListener('click', () => sortRows(key));
      }
    });
  }

  function csvEscape(value) {
    return '"' + String(value ?? '').replaceAll('"', '""') + '"';
  }

  function downloadCsv() {
    const rows = getRows().filter((row) => row.style.display !== 'none').map(rowData);
    const header = ['File Number', 'Name', 'Order Date', 'Monitoring', 'MVR Status', 'Med Expire', 'Days Until Med Expire', 'Notes'];
    const csv = [header, ...rows.map((r) => [r.fileNumber, r.name, r.orderDate, r.monitoring, r.mvrStatus, r.medExpire, r.medDays ?? '', r.notes])]
      .map((line) => line.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitoring-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const c = getCounts();
    const summary = [
      'SaffHire Monitoring Summary',
      `Total Applicants: ${c.total}`,
      `On Monitoring: ${c.on}`,
      `Off Monitoring: ${c.off}`,
      `Expired Medical: ${c.expired}`,
      `Expiring 30 Days: ${c.exp30}`,
      `Expiring 60 Days: ${c.exp60}`,
      `Blank Med Expire: ${c.blank}`,
      `MVR Attention: ${c.mvr}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      toast('Monitoring summary copied.');
    } catch {
      window.prompt('Copy this summary:', summary);
    }
  }

  function toast(message) {
    let box = document.getElementById('monitoring-alert-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'monitoring-alert-toast';
      box.className = 'monitoring-alert-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    clearTimeout(box.hideTimer);
    box.hideTimer = setTimeout(() => box.remove(), 4000);
  }

  function removeConflicts() {
    if (!isMonitoringPage()) return;

    [
      'phase8-panel',
      'phase9-permission-panel',
      'phase5a-panel',
      'phase6-panel',
      'phase7-panel',
      'phase7a-panel',
      'phase10-panel',
      'phase10i-sort-controls',
      'stable-monitoring-alerts-panel'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    Array.from(document.querySelectorAll('section.card, div.card, .wide-card')).forEach((card) => {
      const t = text(card);
      if (
        t.includes('Phase 9 Permissions') ||
        t.includes('Phase 8 Monitoring Alerts') ||
        t.includes('Phase 5A Gmail Workflow') ||
        t.includes('Phase 6 Employer Response Form') ||
        t.includes('Phase 7 Completed Packet') ||
        t.includes('Phase 7A FMCSA PDF Mapping') ||
        t.includes('PDF Import to Applicant Database') ||
        t.includes('Medical PDF Upload & Scan')
      ) {
        card.remove();
      }
    });
  }

  function ensurePanel() {
    const header = Array.from(document.querySelectorAll('.page-header h1')).find((h) => text(h) === 'Monitoring');
    if (!header) return null;

    let panel = document.getElementById('monitoring-alerts-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'monitoring-alerts-panel';
      panel.className = 'card wide-card monitoring-alerts-panel';
      header.closest('.page-header').insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;

    const c = getCounts();
    panel.innerHTML = `
      <div class="monitoring-alert-title">Monitoring Alerts</div>
      <div class="monitoring-alert-metrics">
        <button type="button" data-monitoring-filter="all"><b>${c.total}</b>Total</button>
        <button type="button" data-monitoring-filter="on"><b>${c.on}</b>On Monitoring</button>
        <button type="button" data-monitoring-filter="off"><b>${c.off}</b>Off Monitoring</button>
        <button type="button" data-monitoring-filter="expired"><b>${c.expired}</b>Expired Medical</button>
        <button type="button" data-monitoring-filter="exp30"><b>${c.exp30}</b>Expiring 30 Days</button>
        <button type="button" data-monitoring-filter="exp60"><b>${c.exp60}</b>Expiring 60 Days</button>
        <button type="button" data-monitoring-filter="blank"><b>${c.blank}</b>Blank Med Expire</button>
        <button type="button" data-monitoring-filter="mvr"><b>${c.mvr}</b>MVR Attention</button>
      </div>
      <div class="monitoring-alert-actions">
        <button type="button" data-monitoring-sort="file">Sort File #</button>
        <button type="button" data-monitoring-sort="name">Sort Name</button>
        <button type="button" data-monitoring-sort="order">Sort Order Date</button>
        <button type="button" data-monitoring-sort="med">Sort Med Expire</button>
        <button type="button" data-monitoring-copy>Copy Summary</button>
        <button type="button" data-monitoring-download>Download Current View CSV</button>
        <button type="button" data-monitoring-recalculate>Recalculate Alerts</button>
      </div>
    `;

    applyFilter(localStorage.getItem(FILTER_KEY) || 'all');
  }

  function decorateRows() {
    getRows().forEach((row) => {
      const c = cells(row);
      const state = rowState(row);
      row.classList.toggle('monitoring-row-expired', state === 'expired');
      row.classList.toggle('monitoring-row-warning', state === 'exp30');
      row.classList.toggle('monitoring-row-info', state === 'exp60');

      if (c[5]) {
        let badge = c[5].querySelector('.monitoring-med-badges');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'monitoring-med-badges';
          c[5].appendChild(badge);
        }

        const d = rowData(row);
        if (state === 'expired') badge.innerHTML = '<span class="monitoring-med-badge danger">Medical expired</span>';
        else if (state === 'exp30') badge.innerHTML = `<span class="monitoring-med-badge warn">Medical expires ${d.medDays} days</span>`;
        else if (state === 'exp60') badge.innerHTML = `<span class="monitoring-med-badge info">Medical expires ${d.medDays} days</span>`;
        else badge.innerHTML = '';
      }
    });
  }

  function addStyles() {
    if (document.getElementById('monitoring-alerts-final-style')) return;

    const style = document.createElement('style');
    style.id = 'monitoring-alerts-final-style';
    style.textContent = `
      body.monitoring-clean-page #phase9-permission-panel,
      body.monitoring-clean-page #phase8-panel,
      body.monitoring-clean-page #phase5a-panel,
      body.monitoring-clean-page #phase6-panel,
      body.monitoring-clean-page #phase7-panel,
      body.monitoring-clean-page #phase7a-panel,
      body.monitoring-clean-page #phase10-panel,
      body.monitoring-clean-page #phase10i-sort-controls,
      body.monitoring-clean-page #stable-monitoring-alerts-panel { display: none !important; }

      .monitoring-alerts-panel {
        margin-bottom: 16px;
        padding: 16px;
        border-left: 5px solid #0ea5e9;
      }

      .monitoring-alert-title {
        font-weight: 900;
        margin-bottom: 10px;
        font-size: 17px;
      }

      .monitoring-alert-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(130px, 1fr));
        gap: 9px;
      }

      .monitoring-alert-metrics button {
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        border-radius: 12px;
        padding: 9px 12px;
        text-align: left;
        font-weight: 900;
      }

      .monitoring-alert-metrics button:hover,
      .monitoring-alert-metrics button.active {
        background: #e0f2fe;
        border-color: #0ea5e9;
      }

      .monitoring-alert-metrics b {
        display: block;
        font-size: 23px;
        line-height: 1.1;
      }

      .monitoring-alert-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .monitoring-alert-actions button {
        border: 1px solid #0ea5e9;
        background: #f0f9ff;
        color: #0369a1;
        border-radius: 999px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 900;
      }

      .monitoring-alert-actions button:hover {
        background: #e0f2fe;
      }

      .monitoring-sortable {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }

      .monitoring-sortable:hover {
        background: #eef6ff !important;
      }

      .monitoring-sort-arrow {
        color: #0ea5e9;
        font-weight: 900;
        margin-left: 4px;
      }

      .monitoring-sort-arrow.muted {
        color: #94a3b8;
      }

      .monitoring-med-badges {
        margin-top: 5px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .monitoring-med-badge {
        border-radius: 999px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 900;
        display: inline-flex;
      }

      .monitoring-med-badge.danger {
        background: #fee2e2;
        color: #991b1b;
      }

      .monitoring-med-badge.warn {
        background: #fef3c7;
        color: #92400e;
      }

      .monitoring-med-badge.info {
        background: #dbeafe;
        color: #1d4ed8;
      }

      .monitoring-row-expired td {
        box-shadow: inset 4px 0 0 #dc2626;
      }

      .monitoring-row-warning td {
        box-shadow: inset 4px 0 0 #f59e0b;
      }

      .monitoring-row-info td {
        box-shadow: inset 4px 0 0 #3b82f6;
      }

      .monitoring-alert-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10020;
        background: #111827;
        color: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 18px 45px rgba(15,23,42,.25);
        font-size: 14px;
        max-width: 420px;
      }

      @media(max-width: 1100px) {
        .monitoring-alert-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media(max-width: 680px) {
        .monitoring-alert-metrics { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const filter = event.target && event.target.closest ? event.target.closest('[data-monitoring-filter]') : null;
    if (filter) {
      applyFilter(filter.dataset.monitoringFilter || 'all');
      return;
    }

    const sort = event.target && event.target.closest ? event.target.closest('[data-monitoring-sort]') : null;
    if (sort) {
      sortRows(sort.dataset.monitoringSort);
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-monitoring-copy]')) {
      copySummary();
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-monitoring-download]')) {
      downloadCsv();
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-monitoring-recalculate]')) {
      renderPanel();
      toast('Monitoring alerts recalculated.');
    }
  });

  function makeSignature() {
    return getRows().map((row) => {
      const d = rowData(row);
      return [d.fileNumber, d.name, d.orderDate, d.monitoring, d.mvrStatus, d.medExpire, d.notes].join('|');
    }).join('~').slice(0, 50000);
  }

  function refresh(force) {
    const active = isMonitoringPage();
    document.body.classList.toggle('monitoring-clean-page', active);
    if (!active) return;

    addStyles();
    removeConflicts();
    updateHeaders();
    decorateRows();

    const sig = makeSignature();
    if (force || sig !== lastSignature || !document.getElementById('monitoring-alerts-panel')) {
      lastSignature = sig;
      renderPanel();
    }

    if (sortKey) sortRows(sortKey, sortDir);
  }

  const observer = new MutationObserver(() => {
    if (isMonitoringPage()) removeConflicts();
  });

  function boot() {
    addStyles();
    observer.observe(document.body, { childList: true, subtree: true });
    refresh(true);
    setInterval(() => refresh(false), 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
