(function () {
  'use strict';

  const STYLE_ID = 'phase12a149-safety-horizontal-scroll-style';
  const TABLE_CLASS = 'phase12a149-safety-table';
  const CONTAINER_CLASS = 'phase12a149-safety-scroll-container';
  let scheduled = false;

  function text(value) {
    return String(value || '')
      .replace(/[↕↑↓▲▼]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${CONTAINER_CLASS} {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: visible !important;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        scrollbar-gutter: stable;
        touch-action: pan-x pan-y;
      }

      .${CONTAINER_CLASS}::-webkit-scrollbar {
        height: 12px;
      }

      .${CONTAINER_CLASS}::-webkit-scrollbar-track {
        background: #e2e8f0;
        border-radius: 999px;
      }

      .${CONTAINER_CLASS}::-webkit-scrollbar-thumb {
        background: #64748b;
        border: 2px solid #e2e8f0;
        border-radius: 999px;
      }

      .${CONTAINER_CLASS}::-webkit-scrollbar-thumb:hover {
        background: #334155;
      }

      table.${TABLE_CLASS} {
        width: 100% !important;
        min-width: 1120px !important;
        border-collapse: collapse;
      }

      table.${TABLE_CLASS}.phase12a149-safety-admin-table {
        min-width: 1520px !important;
      }

      table.${TABLE_CLASS} th,
      table.${TABLE_CLASS} td {
        white-space: nowrap;
      }

      table.${TABLE_CLASS} td.phase12a149-wrap-cell,
      table.${TABLE_CLASS} td.notes-cell,
      table.${TABLE_CLASS} .notes-cell {
        white-space: normal !important;
        min-width: 220px;
        max-width: 360px;
      }

      @media (max-width: 900px) {
        table.${TABLE_CLASS} {
          min-width: 1050px !important;
        }

        table.${TABLE_CLASS}.phase12a149-safety-admin-table {
          min-width: 1450px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function headersFor(table) {
    return Array.from(table.querySelectorAll('thead th')).map((th) => text(th.textContent));
  }

  function isSafetyTable(table) {
    const headers = headersFor(table);
    if (!headers.length) return false;

    const hasFile = headers.some((header) => header === 'file #' || header.includes('file number'));
    const hasApplicant = headers.some((header) => header.includes('applicant'));
    const hasStatus = headers.some((header) => header === 'status' || header.includes('status'));
    const hasSafetyDetail = headers.some((header) =>
      header.includes('previous employer') ||
      header.includes('follow up') ||
      header === 'links' ||
      header === 'pdf' ||
      header.includes('client notes')
    );
    const isMonitoring = headers.some((header) => header === 'monitoring' || header.includes('mvr status'));

    return hasFile && hasApplicant && hasStatus && hasSafetyDetail && !isMonitoring;
  }

  function findScrollContainer(table) {
    return table.closest('.table-wrap, .table-card, .phase12a24-table-wrap, .phase12a46-table-wrap')
      || table.parentElement;
  }

  function enhanceTable(table) {
    if (!isSafetyTable(table)) return;

    const headers = headersFor(table);
    const isAdminTable = headers.some((header) => header === 'links' || header.includes('follow up'));
    const container = findScrollContainer(table);
    if (!container) return;

    table.classList.add(TABLE_CLASS);
    table.classList.toggle('phase12a149-safety-admin-table', isAdminTable);
    container.classList.add(CONTAINER_CLASS);
    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Safety Performance reports. Scroll left and right to view all columns.');

    const headersNow = headersFor(table);
    const notesIndex = headersNow.findIndex((header) => header.includes('notes'));
    if (notesIndex >= 0) {
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        const cell = row.children[notesIndex];
        if (cell) cell.classList.add('phase12a149-wrap-cell');
      });
    }
  }

  function enhanceAll() {
    scheduled = false;
    addStyles();
    document.querySelectorAll('table').forEach(enhanceTable);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhanceAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll, { once: true });
  } else {
    enhanceAll();
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleEnhance);
})();
