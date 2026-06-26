(function () {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const FILTERS = ['All', 'Needs Email', 'Emp Sent', 'Due Today', 'Overdue', 'Emp Complete', 'Completed'];

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function todayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function formatDate(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getCompanyId() {
    const select = document.querySelector('.company-switcher select');
    return select && select.value ? select.value : '1';
  }

  function getFileNumberFromRow(row) {
    const firstCell = row && row.querySelector('td');
    return text(firstCell).replace(/[^0-9A-Za-z\-_.]/g, '').trim();
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    }));
    const bodyText = await response.text();
    let data = {};
    try { data = bodyText ? JSON.parse(bodyText) : {}; } catch { data = {}; }
    if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
    return data;
  }

  async function getReports() {
    const companyId = getCompanyId();
    const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`);
    return Array.isArray(data.reports) ? data.reports : [];
  }

  async function findReport(fileNumber) {
    const reports = await getReports();
    return reports.find((report) => String(report.fileNumber || '').trim() === String(fileNumber || '').trim());
  }

  function makeNote(existingNotes, line) {
    const notes = String(existingNotes || '').trim();
    if (notes.includes(line)) return notes;
    return [notes, line].filter(Boolean).join('\n');
  }

  async function saveReport(report, patch) {
    const companyId = getCompanyId();
    const updated = Object.assign({}, report, patch);
    const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updated)
    });
    return data.report || updated;
  }

  function updateRow(row, report) {
    const cells = row.querySelectorAll('td');
    if (cells[3]) cells[3].innerHTML = `<span class="status-chip ${String(report.status || '').replaceAll(' ', '-').toLowerCase()}">${report.status || ''}</span>`;
    if (cells[4]) cells[4].textContent = report.followUpDate || '';
    if (cells[6]) cells[6].textContent = report.notes || '';
    row.dataset.phase4cStatus = report.status || '';
    row.dataset.phase4cFollowUp = report.followUpDate || '';
    row.classList.add('phase4c-updated-row');
    setTimeout(() => row.classList.remove('phase4c-updated-row'), 2200);
    refreshCommandCenter();
  }

  function rowInfo(row) {
    const cells = row.querySelectorAll('td');
    const status = text(cells[3]);
    const followUp = text(cells[4]);
    const employerEmail = cells[5] ? text(cells[5]) : '';
    let dueState = '';
    if (followUp) {
      const due = new Date(followUp);
      const today = todayDate();
      if (!Number.isNaN(due.getTime())) {
        const dueOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        if (dueOnly.getTime() < today.getTime() && status !== 'Completed') dueState = 'Overdue';
        if (dueOnly.getTime() === today.getTime() && status !== 'Completed') dueState = 'Due Today';
      }
    }
    return { status, followUp, employerEmail, dueState };
  }

  function toast(message) {
    let box = document.getElementById('phase4c-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase4c-toast';
      box.className = 'phase4c-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => { box.remove(); }, 4500);
  }

  async function action(row, kind) {
    const fileNumber = getFileNumberFromRow(row);
    if (!fileNumber) return toast('Could not find the file number for this row.');
    const report = await findReport(fileNumber);
    if (!report || !report.id) return toast(`Could not find file #${fileNumber} in the database.`);

    const today = formatDate(new Date());
    let patch = {};
    let message = '';

    if (kind === 'sent') {
      const followUpDate = report.followUpDate || formatDate(addDays(new Date(), 5));
      patch = {
        status: 'Emp Sent',
        followUpDate,
        notes: makeNote(report.notes, `Marked employer request sent ${today}. Follow up ${followUpDate}.`)
      };
      message = `File #${fileNumber} marked Emp Sent.`;
    }

    if (kind === 'empComplete') {
      patch = {
        status: 'Emp Complete',
        followUpDate: report.followUpDate || today,
        notes: makeNote(report.notes, `Employer response marked complete ${today}.`)
      };
      message = `File #${fileNumber} marked Emp Complete.`;
    }

    if (kind === 'completed') {
      patch = {
        status: 'Completed',
        followUpDate: '',
        notes: makeNote(report.notes, `Safety Performance report marked completed ${today}.`)
      };
      message = `File #${fileNumber} marked Completed.`;
    }

    if (kind === 'snooze') {
      const followUpDate = formatDate(addDays(new Date(), 5));
      patch = {
        followUpDate,
        notes: makeNote(report.notes, `Follow-up moved to ${followUpDate}.`)
      };
      message = `File #${fileNumber} follow-up moved to ${followUpDate}.`;
    }

    const saved = await saveReport(report, patch);
    updateRow(row, saved);
    toast(message);
  }

  function shouldShow(row, filter) {
    const info = rowInfo(row);
    if (filter === 'All') return true;
    if (filter === 'Needs Email') return info.status === 'S1 Complete' || !info.status;
    if (filter === 'Due Today') return info.dueState === 'Due Today';
    if (filter === 'Overdue') return info.dueState === 'Overdue';
    return info.status === filter;
  }

  function applyFilter(filter) {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    rows.forEach((row) => {
      row.style.display = shouldShow(row, filter) ? '' : 'none';
    });
    document.querySelectorAll('.phase4c-filter').forEach((button) => {
      button.classList.toggle('active', button.dataset.filter === filter);
    });
  }

  function countRows() {
    const rows = Array.from(document.querySelectorAll('table tbody tr')).filter((row) => row.querySelectorAll('td').length >= 7);
    const counts = {
      total: rows.length,
      needsEmail: 0,
      empSent: 0,
      dueToday: 0,
      overdue: 0,
      empComplete: 0,
      completed: 0
    };
    rows.forEach((row) => {
      const info = rowInfo(row);
      if (info.status === 'S1 Complete' || !info.status) counts.needsEmail += 1;
      if (info.status === 'Emp Sent') counts.empSent += 1;
      if (info.dueState === 'Due Today') counts.dueToday += 1;
      if (info.dueState === 'Overdue') counts.overdue += 1;
      if (info.status === 'Emp Complete') counts.empComplete += 1;
      if (info.status === 'Completed') counts.completed += 1;
    });
    return counts;
  }

  function addActionButtons(row) {
    if (row.querySelector('.phase4c-row-actions')) return;
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) return;

    const holder = document.createElement('div');
    holder.className = 'phase4c-row-actions';
    holder.innerHTML = `
      <button type="button" data-phase4c-action="sent">Mark Sent</button>
      <button type="button" data-phase4c-action="snooze">+5 Days</button>
      <button type="button" data-phase4c-action="empComplete">Emp Complete</button>
      <button type="button" data-phase4c-action="completed">Completed</button>
    `;
    cells[7].appendChild(holder);
  }

  function styleRows() {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    rows.forEach((row) => {
      const info = rowInfo(row);
      row.classList.toggle('phase4c-overdue-row', info.dueState === 'Overdue');
      row.classList.toggle('phase4c-due-row', info.dueState === 'Due Today');
      addActionButtons(row);
    });
  }

  function commandCenterHtml(counts) {
    return `
      <div class="phase4c-metrics">
        <span><b>${counts.total}</b>Total</span>
        <span><b>${counts.needsEmail}</b>Needs Email</span>
        <span><b>${counts.empSent}</b>Emp Sent</span>
        <span><b>${counts.dueToday}</b>Due Today</span>
        <span><b>${counts.overdue}</b>Overdue</span>
        <span><b>${counts.empComplete}</b>Emp Complete</span>
        <span><b>${counts.completed}</b>Completed</span>
      </div>
      <div class="phase4c-filters">
        ${FILTERS.map((filter) => `<button type="button" class="phase4c-filter" data-filter="${filter}">${filter}</button>`).join('')}
      </div>
      <p class="phase4c-note">Phase 4C: filter employer follow-ups and update report status without opening the edit form.</p>
    `;
  }

  function ensureCommandCenter() {
    const headers = Array.from(document.querySelectorAll('.page-header h1'));
    const safetyHeader = headers.find((h) => text(h) === 'Safety Performance Reports');
    if (!safetyHeader) return null;
    const header = safetyHeader.closest('.page-header');
    if (!header) return null;

    let panel = document.getElementById('phase4c-command-center');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'phase4c-command-center';
      panel.className = 'card wide-card phase4c-panel';
      header.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function refreshCommandCenter() {
    const panel = ensureCommandCenter();
    if (!panel) return;
    const counts = countRows();
    const active = document.querySelector('.phase4c-filter.active');
    const activeFilter = active ? active.dataset.filter : 'All';
    panel.innerHTML = commandCenterHtml(counts);
    applyFilter(activeFilter);
  }

  function addStyles() {
    if (document.getElementById('phase4c-style')) return;
    const style = document.createElement('style');
    style.id = 'phase4c-style';
    style.textContent = `
      .phase4c-panel { margin-bottom: 16px; padding: 16px; }
      .phase4c-metrics { display: grid; grid-template-columns: repeat(7, minmax(100px, 1fr)); gap: 10px; }
      .phase4c-metrics span { border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 10px; color: #475569; font-size: 12px; font-weight: 800; text-transform: uppercase; }
      .phase4c-metrics b { display: block; color: #111827; font-size: 22px; line-height: 1.1; }
      .phase4c-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .phase4c-filter, .phase4c-row-actions button { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 800; }
      .phase4c-filter.active, .phase4c-filter:hover, .phase4c-row-actions button:hover { background: #ecfdf5; border-color: #22c55e; }
      .phase4c-note { margin: 10px 0 0; color: #64748b; font-size: 13px; }
      .phase4c-row-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; min-width: 250px; }
      .phase4c-overdue-row td { background: #fef2f2 !important; }
      .phase4c-due-row td { background: #fff7ed !important; }
      .phase4c-updated-row td { background: #dcfce7 !important; }
      .phase4c-toast { position: fixed; right: 18px; bottom: 18px; z-index: 9999; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 380px; }
      @media(max-width: 1200px) { .phase4c-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const filterButton = event.target && event.target.closest ? event.target.closest('.phase4c-filter') : null;
    if (filterButton) {
      applyFilter(filterButton.dataset.filter || 'All');
      return;
    }

    const actionButton = event.target && event.target.closest ? event.target.closest('[data-phase4c-action]') : null;
    if (!actionButton) return;
    const row = actionButton.closest('tr');
    if (!row) return;

    const kind = actionButton.dataset.phase4cAction;
    action(row, kind).catch((error) => {
      console.error(error);
      toast(error.message || 'Could not update this report.');
    });
  });

  function tick() {
    const onSafetyPage = Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Safety Performance Reports');
    if (!onSafetyPage) return;
    addStyles();
    styleRows();
    refreshCommandCenter();
  }

  let lastRowCount = 0;
  setInterval(() => {
    const rowCount = document.querySelectorAll('table tbody tr').length;
    const onSafetyPage = Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Safety Performance Reports');
    if (onSafetyPage && rowCount !== lastRowCount) {
      lastRowCount = rowCount;
      tick();
    } else if (onSafetyPage) {
      styleRows();
    }
  }, 1500);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();
})();
