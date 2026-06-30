(function () {
  let currentSortKey = '';
  let currentSortDir = 'asc';
  let attachTimer = null;

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

  function cleanHeaderText(value) {
    return String(value || '').replace(/[↕↑↓▲▼]/g, '').trim().toLowerCase();
  }

  function getMonitoringTable() {
    if (!isMonitoringPage()) return null;

    const tables = Array.from(document.querySelectorAll('table'));
    return tables.find((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => cleanHeaderText(text(th)));
      return headers.includes('file #') &&
        headers.includes('name') &&
        headers.includes('order date') &&
        headers.includes('monitoring') &&
        headers.includes('med expire');
    }) || null;
  }

  function cellValue(row, index) {
    const cell = row.querySelectorAll('td')[index];
    if (!cell) return '';

    const input = cell.querySelector('input');
    if (input) return String(input.value || '').trim();

    const select = cell.querySelector('select');
    if (select) return String(select.value || '').trim();

    const textarea = cell.querySelector('textarea');
    if (textarea) return String(textarea.value || '').trim();

    return text(cell);
  }

  function parseDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;

    let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();

    m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? Number('20' + m[3]) : Number(m[3]);
      return new Date(year, Number(m[1]) - 1, Number(m[2])).getTime();
    }

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function parseFile(value) {
    const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function sortValue(row, key) {
    if (key === 'file') return parseFile(cellValue(row, 0));
    if (key === 'name') return cellValue(row, 1).toLowerCase();
    if (key === 'order') return parseDate(cellValue(row, 2));
    if (key === 'med') return parseDate(cellValue(row, 5));
    return '';
  }

  function compare(a, b, key, dir) {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);

    let result;
    if (typeof av === 'number' && typeof bv === 'number') {
      result = av - bv;
    } else {
      result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    }

    return dir === 'asc' ? result : -result;
  }

  function rowsFor(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return [];
    return Array.from(tbody.children).filter((row) => row.tagName === 'TR' && row.querySelectorAll('td').length >= 7);
  }

  function sortTable(key) {
    const table = getMonitoringTable();
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = rowsFor(table);
    if (!rows.length) return;

    const dir = currentSortKey === key && currentSortDir === 'asc' ? 'desc' : 'asc';
    currentSortKey = key;
    currentSortDir = dir;

    const sorted = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const result = compare(a.row, b.row, key, dir);
        return result || a.index - b.index;
      });

    const fragment = document.createDocumentFragment();
    sorted.forEach(({ row }) => fragment.appendChild(row));
    tbody.appendChild(fragment);

    markHeaders(table);
  }

  function headerConfig() {
    return [
      { index: 0, key: 'file', label: 'FILE #' },
      { index: 1, key: 'name', label: 'NAME' },
      { index: 2, key: 'order', label: 'ORDER DATE' },
      { index: 5, key: 'med', label: 'MED EXPIRE' }
    ];
  }

  function markHeaders(table) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    headerConfig().forEach(({ index, key, label }) => {
      const th = headers[index];
      if (!th) return;

      const arrow = currentSortKey === key ? (currentSortDir === 'asc' ? '↑' : '↓') : '↕';
      const muted = currentSortKey === key ? '' : ' muted';

      th.innerHTML = `${label} <span class="safe-sort-arrow${muted}">${arrow}</span>`;
      th.classList.add('safe-sort-header');
      th.setAttribute('data-safe-sort-key', key);
      th.setAttribute('title', `Sort by ${label}`);
    });
  }

  function attach() {
    if (!isMonitoringPage()) return;

    const table = getMonitoringTable();
    if (!table) return;

    if (table.getAttribute('data-safe-sort-ready') !== 'true') {
      table.setAttribute('data-safe-sort-ready', 'true');
      table.addEventListener('click', function (event) {
        const header = event.target && event.target.closest ? event.target.closest('th[data-safe-sort-key]') : null;
        if (!header) return;

        event.preventDefault();
        event.stopPropagation();

        sortTable(header.getAttribute('data-safe-sort-key'));
      });
    }

    markHeaders(table);

    // Remove old alert-card sort buttons if they exist. Sorting belongs in headers only.
    document.querySelectorAll('[data-monitoring-sort], [data-mf-sort], [data-stable-sort], [data-phase10i-sort]').forEach((button) => button.remove());
  }

  function addStyles() {
    if (document.getElementById('safe-header-sort-style')) return;

    const style = document.createElement('style');
    style.id = 'safe-header-sort-style';
    style.textContent = `
      .safe-sort-header {
        cursor: pointer !important;
        user-select: none;
        white-space: nowrap;
      }
      .safe-sort-header:hover {
        background: #e0f2fe !important;
        color: #0f172a !important;
      }
      .safe-sort-arrow {
        display: inline-block;
        margin-left: 5px;
        font-weight: 900;
        color: #0ea5e9;
      }
      .safe-sort-arrow.muted {
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    addStyles();

    if (attachTimer) clearInterval(attachTimer);
    attachTimer = setInterval(attach, 1000);
    attach();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
