(function () {
  const ONE_DAY = 24 * 60 * 60 * 1000;

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

  function todayString() {
    return formatDate(new Date());
  }

  function nextFollowUpDate() {
    return formatDate(addDays(new Date(), 5));
  }

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
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

  async function findReport(fileNumber) {
    const companyId = getCompanyId();
    const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`);
    const reports = Array.isArray(data.reports) ? data.reports : [];
    return reports.find((report) => String(report.fileNumber || '').trim() === String(fileNumber || '').trim());
  }

  async function markEmailSent(row) {
    const fileNumber = getFileNumberFromRow(row);
    if (!fileNumber) return;

    const report = await findReport(fileNumber);
    if (!report || !report.id) return;

    const companyId = getCompanyId();
    const followUpDate = report.followUpDate || nextFollowUpDate();
    const noteLine = `Employer email draft opened ${todayString()}. Follow up set for ${followUpDate}.`;
    const existingNotes = String(report.notes || '').trim();
    const notes = existingNotes.includes(noteLine) ? existingNotes : [existingNotes, noteLine].filter(Boolean).join('\n');
    const updated = Object.assign({}, report, {
      status: 'Emp Sent',
      followUpDate,
      notes
    });

    const saved = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updated)
    });

    updateRow(row, saved.report || updated);
    toastLite(`Marked file #${fileNumber} as Emp Sent. Follow up: ${followUpDate}`);
  }

  function updateRow(row, report) {
    const cells = row.querySelectorAll('td');
    if (cells[3]) {
      cells[3].innerHTML = `<span class="status-chip emp-sent">Emp Sent</span>`;
    }
    if (cells[4]) cells[4].textContent = report.followUpDate || '';
    if (cells[6]) cells[6].textContent = report.notes || '';
    row.classList.add('phase4b-sent-row');
  }

  function toastLite(message) {
    let box = document.getElementById('phase4b-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase4b-toast';
      box.style.position = 'fixed';
      box.style.right = '18px';
      box.style.bottom = '18px';
      box.style.zIndex = '9999';
      box.style.background = '#111827';
      box.style.color = '#fff';
      box.style.borderRadius = '12px';
      box.style.padding = '12px 14px';
      box.style.boxShadow = '0 18px 45px rgba(15,23,42,.25)';
      box.style.fontSize = '14px';
      box.style.maxWidth = '360px';
      document.body.appendChild(box);
    }
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => { box.remove(); }, 4500);
  }

  function applyFollowUpStyles() {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const today = new Date(formatDate(new Date())).getTime();
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return;
      const status = text(cells[3]);
      const followUp = text(cells[4]);
      row.classList.remove('phase4b-due-row', 'phase4b-overdue-row');
      if (!followUp || status === 'Completed') return;
      const due = new Date(followUp).getTime();
      if (Number.isNaN(due)) return;
      if (due < today) row.classList.add('phase4b-overdue-row');
      else if (due === today) row.classList.add('phase4b-due-row');
    });
  }

  function addStyles() {
    if (document.getElementById('phase4b-style')) return;
    const style = document.createElement('style');
    style.id = 'phase4b-style';
    style.textContent = `
      tr.phase4b-sent-row td { background: #ecfdf5 !important; }
      tr.phase4b-due-row td { background: #fff7ed !important; }
      tr.phase4b-overdue-row td { background: #fef2f2 !important; }
      .phase4b-helper-note { margin-top: 8px; color: #475569; font-size: 13px; }
    `;
    document.head.appendChild(style);
  }

  function addHelperNote() {
    const headers = Array.from(document.querySelectorAll('.page-header h1'));
    const safetyHeader = headers.find((h) => text(h) === 'Safety Performance Reports');
    if (!safetyHeader) return;
    const parent = safetyHeader.parentElement;
    if (!parent || parent.querySelector('.phase4b-helper-note')) return;
    const note = document.createElement('p');
    note.className = 'phase4b-helper-note';
    note.textContent = 'Phase 4B: Email marks the record Emp Sent, adds a 5-day follow-up, and appends a sent note.';
    parent.appendChild(note);
  }

  document.addEventListener('click', function (event) {
    const button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!button) return;
    const label = text(button);
    if (label !== 'Email') return;
    const row = button.closest('tr');
    if (!row) return;
    setTimeout(() => {
      markEmailSent(row).catch((error) => {
        console.error(error);
        toastLite(`Email draft opened, but status update failed: ${error.message}`);
      });
    }, 700);
  }, true);

  function tick() {
    addStyles();
    addHelperNote();
    applyFollowUpStyles();
  }

  setInterval(tick, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();
})();
