(function () {
  const COMPANY_NAME = 'SaffHire Background Screening';
  const SUPPORT_EMAIL = 'support@saffhire.com';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function getRows() {
    return Array.from(document.querySelectorAll('table tbody tr')).filter((row) => row.querySelectorAll('td').length >= 8);
  }

  function getCells(row) {
    return Array.from(row.querySelectorAll('td'));
  }

  function getCompanyId() {
    const select = document.querySelector('.company-switcher select');
    return select && select.value ? select.value : '1';
  }

  function isoDate(date) {
    const d = new Date(date);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return isoDate(d);
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    }));
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
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

  function rowData(row) {
    const cells = getCells(row);
    const employerText = text(cells[5]);
    const emailMatch = employerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return {
      fileNumber: text(cells[0]).replace(/[^0-9A-Za-z\-_.]/g, ''),
      applicant: text(cells[1]),
      status: text(cells[3]),
      followUp: text(cells[4]),
      employer: employerText.split('\n')[0] || '',
      employerEmail: emailMatch ? emailMatch[0] : '',
      notes: text(cells[6]),
    };
  }

  function buildEmail(row) {
    const data = rowData(row);
    const subject = `Safety Performance Information Request${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`;
    const body = [
      'Hello,',
      '',
      `${COMPANY_NAME} is requesting Safety Performance information for the applicant listed below.`,
      '',
      `Applicant: ${data.applicant || '[Applicant Name]'}`,
      data.fileNumber ? `File Number: ${data.fileNumber}` : '',
      data.employer ? `Previous Employer Listed: ${data.employer}` : '',
      '',
      'Please reply with any available information for:',
      '1. Employment dates',
      '2. Job title / position',
      '3. Whether the applicant drove a motor vehicle',
      '4. Vehicle type(s), if applicable',
      '5. Accident history, if applicable',
      '6. DOT drug and alcohol testing information, if applicable',
      '7. Name/title of the person providing the information',
      '8. Date completed',
      '',
      'If this request should be sent to a different department, please reply with the correct contact information.',
      '',
      'Thank you,',
      COMPANY_NAME,
      SUPPORT_EMAIL
    ].filter(Boolean).join('\n');
    return { to: data.employerEmail, subject, body, fileNumber: data.fileNumber };
  }

  function gmailUrl(draft) {
    return 'https://mail.google.com/mail/?view=cm&fs=1'
      + `&to=${encodeURIComponent(draft.to || '')}`
      + `&su=${encodeURIComponent(draft.subject || '')}`
      + `&body=${encodeURIComponent(draft.body || '')}`;
  }

  function toast(message, danger) {
    let box = document.getElementById('phase5a-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase5a-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase5a-toast danger' : 'phase5a-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }

  async function copyDraft(draft) {
    const full = `To: ${draft.to || '[enter email]'}\nSubject: ${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(full);
      toast('Gmail draft copied.');
    } catch {
      window.prompt('Copy this draft:', full);
    }
  }

  function getModal() {
    let modal = document.getElementById('phase5a-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase5a-modal';
    modal.className = 'phase5a-modal hidden';
    modal.innerHTML = `
      <div class="phase5a-modal-card">
        <div class="phase5a-modal-head">
          <h2>Open Safety Request in Gmail</h2>
          <button type="button" data-phase5a-close>×</button>
        </div>
        <div class="phase5a-field"><span>To</span><input data-phase5a-to /></div>
        <div class="phase5a-field"><span>Subject</span><input data-phase5a-subject /></div>
        <div class="phase5a-field"><span>Message</span><textarea data-phase5a-body rows="14"></textarea></div>
        <div class="phase5a-warning">
          This opens a Gmail compose window. You still click Send in Gmail. The app will mark the report Emp Sent when Gmail is opened.
        </div>
        <div class="phase5a-modal-actions">
          <button type="button" data-phase5a-copy>Copy Draft</button>
          <button type="button" data-phase5a-gmail>Open Gmail + Mark Sent</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(row) {
    const modal = getModal();
    const draft = buildEmail(row);
    modal.__row = row;
    modal.__draft = draft;
    modal.querySelector('[data-phase5a-to]').value = draft.to || '';
    modal.querySelector('[data-phase5a-subject]').value = draft.subject || '';
    modal.querySelector('[data-phase5a-body]').value = draft.body || '';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    getModal().classList.add('hidden');
  }

  function draftFromModal() {
    const modal = getModal();
    return {
      row: modal.__row,
      original: modal.__draft || {},
      to: modal.querySelector('[data-phase5a-to]').value.trim(),
      subject: modal.querySelector('[data-phase5a-subject]').value.trim(),
      body: modal.querySelector('[data-phase5a-body]').value.trim(),
      fileNumber: (modal.__draft || {}).fileNumber || ''
    };
  }

  function appendNote(notes, line) {
    const current = String(notes || '').trim();
    if (current.includes(line)) return current;
    return [current, line].filter(Boolean).join('\n');
  }

  async function markSent(row, draft) {
    const report = await findReport(draft.fileNumber);
    if (!report || !report.id) throw new Error(`Could not find file #${draft.fileNumber} in the database.`);

    const today = isoDate(new Date());
    const followUp = report.followUpDate || addDays(5);
    const note = `Gmail compose opened for ${draft.to || 'employer'} on ${today}. Follow up ${followUp}.`;

    const updated = Object.assign({}, report, {
      status: 'Emp Sent',
      followUpDate: followUp,
      notes: appendNote(report.notes, note)
    });

    const companyId = getCompanyId();
    const saved = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updated)
    });

    const cells = getCells(row);
    if (cells[3]) cells[3].innerHTML = '<span class="status-chip emp-sent">Emp Sent</span>';
    if (cells[4]) cells[4].textContent = followUp;
    if (cells[6]) cells[6].textContent = (saved.report && saved.report.notes) || updated.notes || '';
    row.classList.add('phase5a-sent-row');
    setTimeout(() => row.classList.remove('phase5a-sent-row'), 2500);
  }

  async function openGmailAndMarkSent() {
    const draft = draftFromModal();
    if (!draft.to) {
      toast('Recipient email is blank. Add an email or use Copy Draft.', true);
      return;
    }
    if (!draft.subject || !draft.body) {
      toast('Subject and message are required.', true);
      return;
    }

    await copyDraft(draft);
    const win = window.open(gmailUrl(draft), '_blank', 'noopener,noreferrer');
    if (!win) {
      toast('Popup blocked. Draft copied. Allow popups or open Gmail manually.', true);
      return;
    }

    try {
      await markSent(draft.row, draft);
      closeModal();
      toast('Gmail opened. Report marked Emp Sent with a follow-up date.');
    } catch (error) {
      toast(error.message || 'Gmail opened, but report could not be updated.', true);
    }
  }

  function addGmailButtons() {
    getRows().forEach((row) => {
      const cells = getCells(row);
      if (!cells[7] || cells[7].querySelector('.phase5a-gmail-row')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'phase5a-gmail-row';
      button.textContent = 'Open Gmail';
      button.addEventListener('click', () => openModal(row));
      cells[7].appendChild(button);
    });
  }

  function addPanel() {
    const safetyHeader = Array.from(document.querySelectorAll('.page-header h1')).find((h) => text(h) === 'Safety Performance Reports');
    if (!safetyHeader || document.getElementById('phase5a-panel')) return;
    const after = document.getElementById('phase4d-panel') || document.getElementById('phase4c-command-center') || safetyHeader.closest('.page-header');
    const panel = document.createElement('section');
    panel.id = 'phase5a-panel';
    panel.className = 'card wide-card phase5a-panel';
    panel.innerHTML = `
      <h2>Phase 5A Gmail Workflow</h2>
      <p>Use <b>Open Gmail</b> to review the message, open Gmail compose, and mark the report Emp Sent with a 5-day follow-up date.</p>
      <p class="phase5a-small">No Resend setup, no sender DNS, and no new Vercel ENV keys are needed.</p>
    `;
    after.insertAdjacentElement('afterend', panel);
  }

  function addStyles() {
    if (document.getElementById('phase5a-style')) return;
    const style = document.createElement('style');
    style.id = 'phase5a-style';
    style.textContent = `
      .phase5a-panel { margin-bottom: 16px; padding: 16px; border-left: 5px solid #ea4335; }
      .phase5a-panel h2 { margin: 0 0 8px; }
      .phase5a-small { color: #64748b; font-size: 13px; }
      .phase5a-gmail-row { border: 1px solid #ea4335; background: #fff5f5; color: #b91c1c; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; margin-top: 8px; }
      .phase5a-gmail-row:hover { background: #fee2e2; }
      .phase5a-sent-row td { background: #dcfce7 !important; }
      .phase5a-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10002; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 420px; }
      .phase5a-toast.danger { background: #991b1b; }
      .phase5a-modal { position: fixed; inset: 0; z-index: 10001; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; padding: 18px; }
      .phase5a-modal.hidden { display: none; }
      .phase5a-modal-card { width: min(760px, 96vw); max-height: 92vh; overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); padding: 18px; }
      .phase5a-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
      .phase5a-modal-head h2 { margin: 0; }
      .phase5a-modal-head button { border: 0; background: #f1f5f9; width: 34px; height: 34px; border-radius: 999px; font-size: 22px; }
      .phase5a-field span { display: block; font-size: 12px; font-weight: 900; color: #475569; margin: 10px 0 5px; }
      .phase5a-field input, .phase5a-field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase5a-warning { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 12px; padding: 10px; margin-top: 12px; font-size: 13px; }
      .phase5a-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .phase5a-modal-actions button { border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 900; }
      [data-phase5a-copy] { background: #111827; color: #fff; }
      [data-phase5a-gmail] { background: #ea4335; color: #fff; }
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    const onSafetyPage = Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Safety Performance Reports');
    if (!onSafetyPage) return;
    addStyles();
    addPanel();
    addGmailButtons();
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-phase5a-close]')) closeModal();
    if (event.target && event.target.closest && event.target.closest('[data-phase5a-copy]')) copyDraft(draftFromModal());
    if (event.target && event.target.closest && event.target.closest('[data-phase5a-gmail]')) {
      openGmailAndMarkSent().catch((error) => toast(error.message || 'Could not open Gmail.', true));
    }
  });

  setInterval(refresh, 1400);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
