(function () {
  const FILTER_KEY = 'saffhire_monitoring_final_filter';
  let sortKey = '';
  let sortDir = 'asc';
  let lastRenderKey = '';

  function txt(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function pageTitle() {
    const h1 = document.querySelector('.page-header h1');
    return txt(h1);
  }

  function onMonitoring() {
    return pageTitle() === 'Monitoring';
  }

  function table() {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.find((t) => {
      const headers = Array.from(t.querySelectorAll('thead th')).map((th) => txt(th).toLowerCase());
      return headers.some((h) => h.includes('file')) &&
        headers.some((h) => h.includes('name')) &&
        headers.some((h) => h.includes('order')) &&
        headers.some((h) => h.includes('monitor')) &&
        headers.some((h) => h.includes('med'));
    }) || null;
  }

  function rows() {
    const t = table();
    if (!t) return [];
    return Array.from(t.querySelectorAll('tbody tr')).filter((r) => r.querySelectorAll('td').length >= 7);
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
    return txt(cell);
  }

  function data(row) {
    const c = cells(row);
    const med = value(c[5]);
    const medDate = parseDate(med);
    return {
      file: txt(c[0]),
      name: txt(c[1]),
      order: txt(c[2]),
      monitoring: value(c[3]),
      mvr: txt(c[4]),
      med,
      medDate,
      medDays: medDate ? Math.ceil((medDate.getTime() - today().getTime()) / 86400000) : null,
      notes: value(c[6])
    };
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

  function state(row) {
    const d = data(row);
    if (d.monitoring !== 'On') return 'off';
    if (!d.medDate) return 'blank';
    if (d.medDays < 0) return 'expired';
    if (d.medDays <= 30) return 'exp30';
    if (d.medDays <= 60) return 'exp60';
    if (/pending|review|needed|expired|attention/i.test(d.mvr || '')) return 'mvr';
    return 'ok';
  }

  function getCounts() {
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

  function shouldShow(row, filter) {
    const d = data(row);
    const s = state(row);
    if (filter === 'all') return true;
    if (filter === 'on') return d.monitoring === 'On';
    if (filter === 'off') return d.monitoring !== 'On';
    if (filter === 'expired') return s === 'expired';
    if (filter === 'exp30') return s === 'exp30';
    if (filter === 'exp60') return s === 'exp60';
    if (filter === 'blank') return s === 'blank';
    if (filter === 'mvr') return s === 'mvr';
    return true;
  }

  function applyFilter(filter) {
    localStorage.setItem(FILTER_KEY, filter);
    rows().forEach((row) => {
      row.style.display = shouldShow(row, filter) ? '' : 'none';
    });
    document.querySelectorAll('[data-mf-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mfFilter === filter);
    });
  }

  function numeric(v) {
    const n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function sortVal(row, key) {
    const d = data(row);
    if (key === 'file') return numeric(d.file);
    if (key === 'name') return d.name.toLowerCase();
    if (key === 'order') return d.order ? (parseDate(d.order)?.getTime() || 0) : 0;
    if (key === 'med') return d.medDate ? d.medDate.getTime() : 0;
    return '';
  }

  function doSort(key, forcedDir) {
    const t = table();
    if (!t) return;
    const tbody = t.querySelector('tbody');
    if (!tbody) return;

    const nextDir = forcedDir || (sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    sortKey = key;
    sortDir = nextDir;

    const list = rows();
    list.sort((a, b) => {
      const av = sortVal(a, key);
      const bv = sortVal(b, key);
      if (typeof av === 'number' && typeof bv === 'number') return nextDir === 'asc' ? av - bv : bv - av;
      const result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return nextDir === 'asc' ? result : -result;
    });

    list.forEach((row) => tbody.appendChild(row));
    markHeaders();
    applyFilter(localStorage.getItem(FILTER_KEY) || 'all');
  }

  function markHeaders() {
    const t = table();
    if (!t) return;
    const ths = Array.from(t.querySelectorAll('thead th'));
    const map = { file: 0, name: 1, order: 2, med: 5 };
    Object.entries(map).forEach(([key, idx]) => {
      const th = ths[idx];
      if (!th) return;
      const label = th.dataset.mfLabel || txt(th).replace(/[↕↑↓]/g, '').trim();
      th.dataset.mfLabel = label;
      th.innerHTML = `${label} <span class="mf-sort-arrow ${sortKey === key ? '' : 'muted'}">${sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>`;
      th.classList.add('mf-sortable');
      if (!th.dataset.mfReady) {
        th.dataset.mfReady = 'true';
        th.addEventListener('click', () => doSort(key));
      }
    });
  }

  function cleanupConflictingCards() {
    if (!onMonitoring()) return;

    [
      'phase9-permission-panel',
      'phase8-panel',
      'phase5a-panel',
      'phase6-panel',
      'phase7-panel',
      'phase7a-panel',
      'phase10-panel',
      'phase10i-sort-controls'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    Array.from(document.querySelectorAll('section.card, div.card, .wide-card')).forEach((card) => {
      const t = txt(card);
      if (
        t.includes('Phase 9 Permissions') ||
        t.includes('Phase 8 Monitoring Alerts') ||
        t.includes('Phase 5A Gmail Workflow') ||
        t.includes('Phase 6 Employer Response Form') ||
        t.includes('Phase 7 Completed Packet') ||
        t.includes('Phase 7A FMCSA PDF Mapping') ||
        t.includes('PDF Import to Applicant Database') ||
        t.includes('Medical PDF Upload & Scan')
      ) card.remove();
    });
  }

  function panel() {
    let p = document.getElementById('monitoring-final-alerts');
    const h = Array.from(document.querySelectorAll('.page-header h1')).find((x) => txt(x) === 'Monitoring');
    if (!h) return null;
    if (!p) {
      p = document.createElement('section');
      p.id = 'monitoring-final-alerts';
      p.className = 'card wide-card monitoring-final-card';
      h.closest('.page-header').insertAdjacentElement('afterend', p);
    }
    return p;
  }

  function renderPanel() {
    const p = panel();
    if (!p) return;
    const c = getCounts();
    p.innerHTML = `
      <div class="mf-title">Monitoring Alerts</div>
      <div class="mf-metrics">
        <button type="button" data-mf-filter="all"><b>${c.total}</b>Total</button>
        <button type="button" data-mf-filter="on"><b>${c.on}</b>On Monitoring</button>
        <button type="button" data-mf-filter="off"><b>${c.off}</b>Off Monitoring</button>
        <button type="button" data-mf-filter="expired"><b>${c.expired}</b>Expired Medical</button>
        <button type="button" data-mf-filter="exp30"><b>${c.exp30}</b>Expiring 30 Days</button>
        <button type="button" data-mf-filter="exp60"><b>${c.exp60}</b>Expiring 60 Days</button>
        <button type="button" data-mf-filter="blank"><b>${c.blank}</b>Blank Med Expire</button>
        <button type="button" data-mf-filter="mvr"><b>${c.mvr}</b>MVR Attention</button>
      </div>
      <div class="mf-actions">
        <button type="button" data-mf-sort="file">Sort File #</button>
        <button type="button" data-mf-sort="name">Sort Name</button>
        <button type="button" data-mf-sort="order">Sort Order Date</button>
        <button type="button" data-mf-sort="med">Sort Med Expire</button>
        <button type="button" data-mf-recalc>Recalculate Alerts</button>
      </div>
    `;
    applyFilter(localStorage.getItem(FILTER_KEY) || 'all');
  }

  function decorateRows() {
    rows().forEach((row) => {
      const c = cells(row);
      const s = state(row);
      row.classList.toggle('mf-row-expired', s === 'expired');
      row.classList.toggle('mf-row-warning', s === 'exp30');
      row.classList.toggle('mf-row-info', s === 'exp60');

      if (c[5]) {
        let badge = c[5].querySelector('.mf-badges');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'mf-badges';
          c[5].appendChild(badge);
        }

        const d = data(row);
        if (s === 'expired') badge.innerHTML = '<span class="mf-badge danger">Medical expired</span>';
        else if (s === 'exp30') badge.innerHTML = `<span class="mf-badge warn">Medical expires ${d.medDays} days</span>`;
        else if (s === 'exp60') badge.innerHTML = `<span class="mf-badge info">Medical expires ${d.medDays} days</span>`;
        else badge.innerHTML = '';
      }
    });
  }

  function addStyles() {
    if (document.getElementById('monitoring-final-style')) return;
    const style = document.createElement('style');
    style.id = 'monitoring-final-style';
    style.textContent = `
      body.monitoring-final-page #phase9-permission-panel,
      body.monitoring-final-page #phase8-panel,
      body.monitoring-final-page #phase5a-panel,
      body.monitoring-final-page #phase6-panel,
      body.monitoring-final-page #phase7-panel,
      body.monitoring-final-page #phase7a-panel,
      body.monitoring-final-page #phase10-panel,
      body.monitoring-final-page #phase10i-sort-controls { display: none !important; }
      .monitoring-final-card { margin-bottom: 16px; padding: 16px; border-left: 5px solid #0ea5e9; }
      .mf-title { font-weight: 900; margin-bottom: 10px; font-size: 17px; }
      .mf-metrics { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 9px; }
      .mf-metrics button { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 12px; padding: 9px 12px; text-align: left; font-weight: 900; }
      .mf-metrics button:hover, .mf-metrics button.active { background: #e0f2fe; border-color: #0ea5e9; }
      .mf-metrics b { display: block; font-size: 23px; line-height: 1.1; }
      .mf-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .mf-actions button { border: 1px solid #0ea5e9; background: #f0f9ff; color: #0369a1; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; }
      .mf-actions button:hover { background: #e0f2fe; }
      .mf-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
      .mf-sortable:hover { background: #eef6ff !important; }
      .mf-sort-arrow { color: #0ea5e9; font-weight: 900; margin-left: 4px; }
      .mf-sort-arrow.muted { color: #94a3b8; }
      .mf-badges { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px; }
      .mf-badge { border-radius: 999px; padding: 3px 7px; font-size: 11px; font-weight: 900; display: inline-flex; }
      .mf-badge.danger { background: #fee2e2; color: #991b1b; }
      .mf-badge.warn { background: #fef3c7; color: #92400e; }
      .mf-badge.info { background: #dbeafe; color: #1d4ed8; }
      .mf-row-expired td { box-shadow: inset 4px 0 0 #dc2626; }
      .mf-row-warning td { box-shadow: inset 4px 0 0 #f59e0b; }
      .mf-row-info td { box-shadow: inset 4px 0 0 #3b82f6; }
      @media(max-width: 1100px) { .mf-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media(max-width: 680px) { .mf-metrics { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const filter = event.target && event.target.closest ? event.target.closest('[data-mf-filter]') : null;
    if (filter) {
      applyFilter(filter.dataset.mfFilter || 'all');
      return;
    }

    const sort = event.target && event.target.closest ? event.target.closest('[data-mf-sort]') : null;
    if (sort) {
      doSort(sort.dataset.mfSort);
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-mf-recalc]')) {
      refresh(true);
    }
  });

  function signature() {
    return rows().map((row) => {
      const d = data(row);
      return [d.file, d.name, d.order, d.monitoring, d.med, d.mvr, d.notes].join('|');
    }).join('~').slice(0, 50000);
  }

  function refresh(force) {
    const active = onMonitoring();
    document.body.classList.toggle('monitoring-final-page', active);
    if (!active) return;

    addStyles();
    cleanupConflictingCards();
    decorateRows();
    markHeaders();

    const sig = signature();
    if (force || sig !== lastRenderKey || !document.getElementById('monitoring-final-alerts')) {
      lastRenderKey = sig;
      renderPanel();
    }

    if (sortKey) doSort(sortKey, sortDir);
  }

  const observer = new MutationObserver(() => {
    if (onMonitoring()) cleanupConflictingCards();
  });

  function boot() {
    addStyles();
    observer.observe(document.body, { childList: true, subtree: true });
    refresh(true);
    setInterval(() => refresh(false), 750);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
