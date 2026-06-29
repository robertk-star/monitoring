(function () {
  const STORAGE_KEY = 'saffhire_phase8_filter';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isMonitoringPage() {
    return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Monitoring');
  }

  function getMonitoringTable() {
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
    const table = getMonitoringTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.querySelectorAll('td').length >= 7);
  }

  function getCells(row) {
    return Array.from(row.querySelectorAll('td'));
  }

  function controlValue(container) {
    if (!container) return '';
    const input = container.querySelector('input');
    if (input) return String(input.value || '').trim();
    const select = container.querySelector('select');
    if (select) return String(select.value || '').trim();
    const textarea = container.querySelector('textarea');
    if (textarea) return String(textarea.value || '').trim();
    return text(container);
  }

  function parseDate(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '—') return null;

    const us = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (us) {
      const year = us[3].length === 2 ? Number('20' + us[3]) : Number(us[3]);
      return new Date(year, Number(us[1]) - 1, Number(us[2]));
    }

    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function todayOnly() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function daysUntil(date) {
    if (!date) return null;
    return Math.ceil((date.getTime() - todayOnly().getTime()) / 86400000);
  }

  function rowData(row) {
    const cells = getCells(row);
    const medExpire = controlValue(cells[5]);
    const medDate = parseDate(medExpire);
    const days = daysUntil(medDate);

    return {
      fileNumber: text(cells[0]),
      name: text(cells[1]),
      orderDate: text(cells[2]),
      monitorStatus: controlValue(cells[3]),
      mvrStatus: text(cells[4]),
      medExpire,
      medDate,
      medDays: days,
      notes: controlValue(cells[6])
    };
  }

  function state(row) {
    const data = rowData(row);
    if (data.monitorStatus !== 'On') return 'off';
    if (!data.medDate) return 'missing-med';
    if (data.medDays < 0) return 'expired-med';
    if (data.medDays <= 30) return 'expiring-30';
    if (data.medDays <= 60) return 'expiring-60';
    if (/pending|review|needed|expired|attention/i.test(data.mvrStatus || '')) return 'mvr-attention';
    return 'ok';
  }

  function countRows() {
    const counts = {
      total: 0,
      on: 0,
      off: 0,
      expiredMed: 0,
      expiring30: 0,
      expiring60: 0,
      missingMed: 0,
      mvrAttention: 0
    };

    getRows().forEach((row) => {
      const data = rowData(row);
      const s = state(row);
      counts.total += 1;

      if (data.monitorStatus === 'On') counts.on += 1;
      else counts.off += 1;

      if (s === 'expired-med') counts.expiredMed += 1;
      if (s === 'expiring-30') counts.expiring30 += 1;
      if (s === 'expiring-60') counts.expiring60 += 1;
      if (s === 'missing-med') counts.missingMed += 1;
      if (s === 'mvr-attention') counts.mvrAttention += 1;
    });

    return counts;
  }

  function shouldShow(row, filter) {
    const data = rowData(row);
    const s = state(row);

    if (filter === 'all') return true;
    if (filter === 'on') return data.monitorStatus === 'On';
    if (filter === 'off') return data.monitorStatus !== 'On';
    if (filter === 'expired-med') return s === 'expired-med';
    if (filter === 'expiring-30') return s === 'expiring-30';
    if (filter === 'expiring-60') return s === 'expiring-60';
    if (filter === 'missing-med') return s === 'missing-med';
    if (filter === 'mvr-attention') return s === 'mvr-attention';

    return true;
  }

  function applyFilter(filter) {
    localStorage.setItem(STORAGE_KEY, filter);
    getRows().forEach((row) => {
      row.style.display = shouldShow(row, filter) ? '' : 'none';
    });
    document.querySelectorAll('[data-phase8-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.phase8Filter === filter);
    });
  }

  function csvEscape(value) {
    return '"' + String(value ?? '').replaceAll('"', '""') + '"';
  }

  function visibleRowsData() {
    return getRows()
      .filter((row) => row.style.display !== 'none')
      .map(rowData);
  }

  function downloadCsv() {
    const rows = visibleRowsData();
    const header = ['File Number', 'Name', 'Order Date', 'Monitoring', 'MVR Status', 'Med Expire', 'Days Until Med Expire', 'Notes'];
    const csv = [header, ...rows.map((r) => [r.fileNumber, r.name, r.orderDate, r.monitorStatus, r.mvrStatus, r.medExpire, r.medDays ?? '', r.notes])]
      .map((line) => line.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `monitoring-alerts-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const counts = countRows();
    const summary = [
      'SaffHire Monitoring Summary',
      `Total Applicants: ${counts.total}`,
      `On Monitoring: ${counts.on}`,
      `Off Monitoring: ${counts.off}`,
      `Expired Medical Cards: ${counts.expiredMed}`,
      `Expiring in 30 Days: ${counts.expiring30}`,
      `Expiring in 60 Days: ${counts.expiring60}`,
      `Missing Medical Date: ${counts.missingMed}`,
      `MVR Needs Attention: ${counts.mvrAttention}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      toast('Monitoring summary copied.');
    } catch {
      window.prompt('Copy this summary:', summary);
    }
  }

  function toast(message, danger) {
    let box = document.getElementById('phase8-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase8-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase8-toast danger' : 'phase8-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 5000);
  }

  function badgeHtml(row) {
    const s = state(row);
    const data = rowData(row);

    if (s === 'expired-med') return '<span class="phase8-badge danger">Medical expired</span>';
    if (s === 'expiring-30') return `<span class="phase8-badge warn">Medical expires ${data.medDays} days</span>`;
    if (s === 'expiring-60') return `<span class="phase8-badge info">Medical expires ${data.medDays} days</span>`;
    if (s === 'missing-med') return '<span class="phase8-badge danger">Missing medical date</span>';
    if (s === 'mvr-attention') return '<span class="phase8-badge warn">MVR attention</span>';
    if (s === 'ok') return '<span class="phase8-badge ok">OK</span>';

    return '<span class="phase8-badge neutral">Off monitoring</span>';
  }

  function decorateRows() {
    getRows().forEach((row) => {
      const cells = getCells(row);
      const s = state(row);

      row.classList.toggle('phase8-row-expired', s === 'expired-med');
      row.classList.toggle('phase8-row-warning', s === 'expiring-30' || s === 'missing-med' || s === 'mvr-attention');
      row.classList.toggle('phase8-row-info', s === 'expiring-60');

      if (cells[5]) {
        let holder = cells[5].querySelector('.phase8-badges');
        if (!holder) {
          holder = document.createElement('div');
          holder.className = 'phase8-badges';
          cells[5].appendChild(holder);
        }
        holder.innerHTML = badgeHtml(row);
      }

      if (cells[7] && !cells[7].querySelector('.phase8-row-tools')) {
        const holder = document.createElement('div');
        holder.className = 'phase8-row-tools';
        holder.innerHTML = '<button type="button" data-phase8-copy-row>Copy Row</button>';
        cells[7].appendChild(holder);
      }
    });
  }

  async function copyRow(row) {
    const data = rowData(row);
    const details = [
      `File #: ${data.fileNumber}`,
      `Name: ${data.name}`,
      `Monitoring: ${data.monitorStatus}`,
      `MVR Status: ${data.mvrStatus}`,
      `Med Expire: ${data.medExpire}`,
      `Days Until Med Expire: ${data.medDays ?? ''}`,
      `Notes: ${data.notes}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(details);
      toast('Monitoring row copied.');
    } catch {
      window.prompt('Copy this row:', details);
    }
  }

  function panelHtml(counts) {
    return `
      <div class="phase8-title">Phase 8 Monitoring Alerts</div>
      <div class="phase8-metrics">
        <button type="button" data-phase8-filter="all"><b>${counts.total}</b>Total</button>
        <button type="button" data-phase8-filter="on"><b>${counts.on}</b>On Monitoring</button>
        <button type="button" data-phase8-filter="off"><b>${counts.off}</b>Off Monitoring</button>
        <button type="button" data-phase8-filter="expired-med"><b>${counts.expiredMed}</b>Expired Medical</button>
        <button type="button" data-phase8-filter="expiring-30"><b>${counts.expiring30}</b>Expiring 30 Days</button>
        <button type="button" data-phase8-filter="expiring-60"><b>${counts.expiring60}</b>Expiring 60 Days</button>
        <button type="button" data-phase8-filter="missing-med"><b>${counts.missingMed}</b>Missing Medical</button>
        <button type="button" data-phase8-filter="mvr-attention"><b>${counts.mvrAttention}</b>MVR Attention</button>
      </div>
      <div class="phase8-actions">
        <button type="button" data-phase8-copy-summary>Copy Summary</button>
        <button type="button" data-phase8-download-csv>Download Current View CSV</button>
        <button type="button" data-phase8-recalculate>Recalculate Alerts</button>
      </div>
      <p class="phase8-note">Alerts now read the actual Monitoring select/input values, including Med Expire fields updated from PDFs.</p>
    `;
  }

  function ensurePanel() {
    const header = Array.from(document.querySelectorAll('.page-header h1')).find((h) => text(h) === 'Monitoring');
    if (!header) return null;

    let panel = document.getElementById('phase8-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'phase8-panel';
      panel.className = 'card wide-card phase8-panel';
      header.closest('.page-header').insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function refreshPanel() {
    const panel = ensurePanel();
    if (!panel) return;

    const active = localStorage.getItem(STORAGE_KEY) || 'all';
    panel.innerHTML = panelHtml(countRows());
    applyFilter(active);
  }

  function addStyles() {
    if (document.getElementById('phase8-style')) return;

    const style = document.createElement('style');
    style.id = 'phase8-style';
    style.textContent = `
      .phase8-panel { margin-bottom: 16px; padding: 16px; border-left: 5px solid #0ea5e9; }
      .phase8-title { font-weight: 900; margin-bottom: 10px; font-size: 17px; }
      .phase8-metrics { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 9px; }
      .phase8-metrics button { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 12px; padding: 9px 12px; text-align: left; font-weight: 900; }
      .phase8-metrics button:hover, .phase8-metrics button.active { background: #e0f2fe; border-color: #0ea5e9; }
      .phase8-metrics b { display: block; font-size: 23px; line-height: 1.1; }
      .phase8-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .phase8-actions button, .phase8-row-tools button { border: 1px solid #0ea5e9; background: #f0f9ff; color: #0369a1; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; }
      .phase8-actions button:hover, .phase8-row-tools button:hover { background: #e0f2fe; }
      .phase8-note { margin: 10px 0 0; color: #64748b; font-size: 13px; }
      .phase8-badges { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px; }
      .phase8-badge { border-radius: 999px; padding: 3px 7px; font-size: 11px; font-weight: 900; display: inline-flex; }
      .phase8-badge.danger { background: #fee2e2; color: #991b1b; }
      .phase8-badge.warn { background: #fef3c7; color: #92400e; }
      .phase8-badge.info { background: #dbeafe; color: #1d4ed8; }
      .phase8-badge.ok { background: #dcfce7; color: #166534; }
      .phase8-badge.neutral { background: #f1f5f9; color: #475569; }
      .phase8-row-tools { margin-top: 6px; }
      .phase8-row-expired td { box-shadow: inset 4px 0 0 #dc2626; }
      .phase8-row-warning td { box-shadow: inset 4px 0 0 #f59e0b; }
      .phase8-row-info td { box-shadow: inset 4px 0 0 #3b82f6; }
      .phase8-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10008; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 420px; }
      .phase8-toast.danger { background: #991b1b; }
      @media(max-width: 1100px) { .phase8-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media(max-width: 680px) { .phase8-metrics { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const filter = event.target && event.target.closest ? event.target.closest('[data-phase8-filter]') : null;
    if (filter) {
      applyFilter(filter.dataset.phase8Filter || 'all');
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-phase8-copy-summary]')) {
      copySummary();
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-phase8-download-csv]')) {
      downloadCsv();
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-phase8-recalculate]')) {
      refresh();
      toast('Monitoring alerts recalculated.');
      return;
    }

    const copyRowButton = event.target && event.target.closest ? event.target.closest('[data-phase8-copy-row]') : null;
    if (copyRowButton) {
      const row = copyRowButton.closest('tr');
      if (row) copyRow(row);
    }
  });

  function refresh() {
    if (!isMonitoringPage()) return;
    addStyles();
    decorateRows();
    refreshPanel();
  }

  let lastSignature = '';
  setInterval(() => {
    if (!isMonitoringPage()) return;
    const signature = getRows().map((row) => {
      const data = rowData(row);
      return [data.fileNumber, data.monitorStatus, data.medExpire, data.mvrStatus, data.notes].join('|');
    }).join('~').slice(0, 12000);

    if (signature !== lastSignature) {
      lastSignature = signature;
      refresh();
    }
  }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
