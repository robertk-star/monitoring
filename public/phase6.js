(function () {
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
      notes: text(cells[6])
    };
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

  function toast(message, danger) {
    let box = document.getElementById('phase6-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase6-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase6-toast danger' : 'phase6-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      toast(message || 'Copied.');
    } catch {
      window.prompt('Copy this:', value);
    }
  }

  async function generateLink(row) {
    const data = rowData(row);
    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);

    const payload = {
      companyId: getCompanyId(),
      fileNumber: data.fileNumber
    };

    const result = await api('/api/index?path=' + encodeURIComponent('safety-response-link'), {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const link = result.formUrl;
    if (!link) return toast('The app did not return a form link.', true);

    showLinkModal(row, link, data, result.expiresAt);
  }

  function buildRequestDraft(link, data) {
    const subject = `Safety Performance Form Request${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`;
    const body = [
      'Hello,',
      '',
      'SaffHire Background Screening is requesting Safety Performance information for the applicant listed below.',
      '',
      `Applicant: ${data.applicant || '[Applicant Name]'}`,
      data.fileNumber ? `File Number: ${data.fileNumber}` : '',
      '',
      'Please complete the secure form here:',
      link,
      '',
      'If this request should be handled by another department, please reply with the correct contact information.',
      '',
      'Thank you,',
      'SaffHire Background Screening'
    ].filter(Boolean).join('\n');

    return {
      to: data.employerEmail || '',
      subject,
      body,
      full: `To: ${data.employerEmail || '[enter employer email]'}\nSubject: ${subject}\n\n${body}`,
      gmailUrl: 'https://mail.google.com/mail/?view=cm&fs=1'
        + `&to=${encodeURIComponent(data.employerEmail || '')}`
        + `&su=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`
    };
  }

  function getModal() {
    let modal = document.getElementById('phase6-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase6-modal';
    modal.className = 'phase6-modal hidden';
    modal.innerHTML = `
      <div class="phase6-modal-card">
        <div class="phase6-modal-head">
          <h2>Employer Response Form Link</h2>
          <button type="button" data-phase6-close>×</button>
        </div>
        <div class="phase6-link-box">
          <span>Secure Form Link</span>
          <textarea data-phase6-link rows="3" readonly></textarea>
        </div>
        <div class="phase6-link-meta" data-phase6-meta></div>
        <div class="phase6-modal-actions">
          <button type="button" data-phase6-copy-link>Copy Link</button>
          <button type="button" data-phase6-copy-draft>Copy Email Draft</button>
          <button type="button" data-phase6-open-form>Open Form</button>
          <button type="button" data-phase6-open-gmail>Open Gmail</button>
        </div>
        <p class="phase6-note">The employer can complete this form without logging in. The link expires automatically.</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function showLinkModal(row, link, data, expiresAt) {
    const modal = getModal();
    modal.__link = link;
    modal.__data = data;
    modal.__row = row;
    modal.querySelector('[data-phase6-link]').value = link;
    modal.querySelector('[data-phase6-meta]').textContent = expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : 'Expires in 14 days.';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    getModal().classList.add('hidden');
  }

  function addButtons() {
    getRows().forEach((row) => {
      const cells = getCells(row);
      if (!cells[7] || cells[7].querySelector('.phase6-link-button')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'phase6-link-button';
      button.textContent = 'Response Link';
      button.addEventListener('click', () => {
        generateLink(row).catch((error) => toast(error.message || 'Could not generate link.', true));
      });
      cells[7].appendChild(button);
    });
  }

  function addPanel() {
    const safetyHeader = Array.from(document.querySelectorAll('.page-header h1')).find((h) => text(h) === 'Safety Performance Reports');
    if (!safetyHeader || document.getElementById('phase6-panel')) return;
    const after = document.getElementById('phase5a-panel') || document.getElementById('phase4d-panel') || document.getElementById('phase4c-command-center') || safetyHeader.closest('.page-header');
    const panel = document.createElement('section');
    panel.id = 'phase6-panel';
    panel.className = 'card wide-card phase6-panel';
    panel.innerHTML = `
      <h2>Phase 6 Employer Response Form</h2>
      <p>Use <b>Response Link</b> to create a secure form link for a previous employer. When they submit the form, the answers save back to the Safety Performance report and the status changes to <b>Emp Complete</b>.</p>
    `;
    after.insertAdjacentElement('afterend', panel);
  }

  function addStyles() {
    if (document.getElementById('phase6-style')) return;
    const style = document.createElement('style');
    style.id = 'phase6-style';
    style.textContent = `
      .phase6-panel { margin-bottom: 16px; padding: 16px; border-left: 5px solid #16a34a; }
      .phase6-panel h2 { margin: 0 0 8px; }
      .phase6-link-button { border: 1px solid #16a34a; background: #f0fdf4; color: #166534; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; margin-top: 8px; }
      .phase6-link-button:hover { background: #dcfce7; }
      .phase6-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10004; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 420px; }
      .phase6-toast.danger { background: #991b1b; }
      .phase6-modal { position: fixed; inset: 0; z-index: 10003; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; padding: 18px; }
      .phase6-modal.hidden { display: none; }
      .phase6-modal-card { width: min(760px, 96vw); max-height: 92vh; overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); padding: 18px; }
      .phase6-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
      .phase6-modal-head h2 { margin: 0; }
      .phase6-modal-head button { border: 0; background: #f1f5f9; width: 34px; height: 34px; border-radius: 999px; font-size: 22px; }
      .phase6-link-box span { display: block; font-size: 12px; font-weight: 900; color: #475569; margin: 10px 0 5px; }
      .phase6-link-box textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase6-link-meta { color: #475569; font-size: 13px; margin-top: 8px; }
      .phase6-modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .phase6-modal-actions button { border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 900; background: #111827; color: #fff; }
      [data-phase6-open-gmail] { background: #ea4335 !important; }
      [data-phase6-open-form] { background: #16a34a !important; }
      .phase6-note { margin: 12px 0 0; color: #64748b; font-size: 13px; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-phase6-close]')) closeModal();

    const modal = getModal();
    const link = modal.__link;
    const data = modal.__data || {};
    const draft = link ? buildRequestDraft(link, data) : null;

    if (event.target && event.target.closest && event.target.closest('[data-phase6-copy-link]')) {
      if (link) copyText(link, 'Response link copied.');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-copy-draft]')) {
      if (draft) copyText(draft.full, 'Employer form email draft copied.');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-open-form]')) {
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-open-gmail]')) {
      if (!draft) return;
      copyText(draft.full, 'Employer form email draft copied.');
      window.open(draft.gmailUrl, '_blank', 'noopener,noreferrer');
    }
  });

  function refresh() {
    const onSafetyPage = Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Safety Performance Reports');
    if (!onSafetyPage) return;
    addStyles();
    addPanel();
    addButtons();
  }

  setInterval(refresh, 1400);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
