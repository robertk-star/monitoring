(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function cleanHeader(value) {
    return String(value || '')
      .replace(/[↕↑↓▲▼]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isSafetyPage() {
    const titles = Array.from(document.querySelectorAll('.page-header h1, h1, .head h2'))
      .map((el) => text(el))
      .filter(Boolean);

    // Keep Phase 6 actions off the PDF Import / Applicant Database page.
    // Only the actual Safety Performance Reports page should receive response-link
    // buttons and the live TazWorks refresh behavior.
    return titles.some((title) => /safety\s+performance\s+reports?/i.test(title));
  }

  function isSettingsPage() {
    const titles = Array.from(document.querySelectorAll('.page-header h1, h1, .head h2'))
      .map((el) => text(el))
      .filter(Boolean);
    return titles.some((title) => /^settings$/i.test(title));
  }

  function isMonitoringPage() {
    const titles = Array.from(document.querySelectorAll('.page-header h1, h1, .head h2'))
      .map((el) => text(el))
      .filter(Boolean);
    return titles.some((title) => /^monitoring$/i.test(title));
  }


  function isSafetyEditPage() {
    const titles = Array.from(document.querySelectorAll('.page-header h1, h1, .head h2'))
      .map((el) => text(el))
      .filter(Boolean);
    return titles.some((title) => /safety\s+performance\s+submission/i.test(title));
  }

  function safetyTables() {
    if (!isSafetyPage()) return [];

    return Array.from(document.querySelectorAll('table')).filter((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => cleanHeader(text(th)));
      return headers.some((h) => h.includes('file')) &&
        (headers.some((h) => h.includes('employer') || h.includes('previous')) || headers.some((h) => h.includes('status')));
    });
  }

  function indexes(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => cleanHeader(text(th)));
    const find = (names) => {
      for (const name of names) {
        const idx = headers.findIndex((h) => h === name || h.includes(name));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    return {
      file: find(['file #', 'file', 'reference', 'referenceid']),
      applicant: find(['applicant', 'applicant name', 'name']),
      created: find(['created', 'created date', 'date created']),
      status: find(['status']),
      followUp: find(['follow up', 'followup']),
      employer: find(['previous employer', 'employer', 'company']),
      notes: find(['notes']),
      actions: find(['links', 'actions', 'response'])
    };
  }

  let phase12a80EmailSettingsActive = false;
  let phase12a80CompanyId = '';

  function getCompanyId() {
    const select = document.querySelector('.company-switcher select');
    if (select && select.value) {
      phase12a80CompanyId = select.value;
      return select.value;
    }
    return phase12a80CompanyId || '1';
  }

  function cellValue(row, index) {
    if (index < 0 || !row.children[index]) return '';
    return text(row.children[index]);
  }

  function rowData(row) {
    const table = row.closest('table');
    const idx = indexes(table);
    const cells = Array.from(row.children);
    const employerText = cellValue(row, idx.employer);
    const emailMatch = employerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    let fileNumber = cellValue(row, idx.file);
    if (!fileNumber && cells[0]) fileNumber = text(cells[0]);

    return {
      fileNumber: String(fileNumber || '').replace(/[^0-9A-Za-z\-_.]/g, ''),
      applicant: cellValue(row, idx.applicant),
      status: cellValue(row, idx.status),
      followUp: cellValue(row, idx.followUp),
      employer: employerText.split('\n')[0] || '',
      employerEmail: emailMatch ? emailMatch[0] : '',
      notes: cellValue(row, idx.notes)
    };
  }



  function parseSortDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const time = Date.parse(raw);
    if (!Number.isNaN(time)) return time;
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!match) return 0;
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    return new Date(year, Number(match[1]) - 1, Number(match[2])).getTime();
  }

  function sortValue(row, key) {
    const idx = indexes(row.closest('table'));
    if (key === 'file') {
      const raw = cellValue(row, idx.file);
      const numeric = Number(String(raw).replace(/[^0-9.]/g, ''));
      return Number.isFinite(numeric) ? numeric : String(raw).toLowerCase();
    }
    if (key === 'created') return parseSortDate(cellValue(row, idx.created));
    if (key === 'followUp') return parseSortDate(cellValue(row, idx.followUp));
    if (key === 'applicant') return cellValue(row, idx.applicant).toLowerCase();
    if (key === 'status') return cellValue(row, idx.status).toLowerCase();
    if (key === 'employer') return rowData(row).employer.toLowerCase();
    return '';
  }

  function applySafetySort(table, key, direction) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'))
      .filter((row) => row.children && row.children.length > 1 && !row.classList.contains('empty'));

    rows.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      let result;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return direction === 'desc' ? -result : result;
    });

    rows.forEach((row) => tbody.appendChild(row));
  }

  function setSortHeaderLabel(th, active, direction) {
    const base = th.dataset.phase6SortLabel || text(th).replace(/[↕↑↓▲▼]/g, '').trim();
    th.dataset.phase6SortLabel = base;
    th.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'phase6-sort-head';
    span.textContent = base;
    const arrow = document.createElement('span');
    arrow.className = 'phase6-sort-arrow';
    arrow.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
    span.appendChild(arrow);
    th.appendChild(span);
  }

  function applyDefaultSafetySort(table) {
    if (!table || table.dataset.phase6ManualSort === '1') return;
    const idx = indexes(table);
    if (idx.file < 0) return;

    // Default Safety Performance view: newest report/order at the top.
    // File numbers track the newest orders, so use File # descending until the
    // user manually clicks a sortable column header.
    table.dataset.phase6SortKey = 'file';
    table.dataset.phase6SortDirection = 'desc';
    applySafetySort(table, 'file', 'desc');
  }

  function updateSafetySortHeaders(table) {
    const activeKey = table.dataset.phase6SortKey || '';
    const activeDirection = table.dataset.phase6SortDirection || 'asc';
    Array.from(table.querySelectorAll('thead th[data-phase6-sortable]')).forEach((header) => {
      setSortHeaderLabel(header, header.dataset.phase6Sortable === activeKey, activeDirection);
    });
  }


  function phase12a88RemoveFollowUpColumn() {
    safetyTables().forEach((table) => {
      let idx = indexes(table);
      while (idx.followUp >= 0) {
        const headers = Array.from(table.querySelectorAll('thead th'));
        const header = headers[idx.followUp];
        if (header) header.remove();
        Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
          if (row.children && row.children[idx.followUp]) row.children[idx.followUp].remove();
        });
        idx = indexes(table);
      }
      if (table.dataset.phase6SortKey === 'followUp') {
        table.dataset.phase6ManualSort = '0';
        table.dataset.phase6SortKey = 'file';
        table.dataset.phase6SortDirection = 'desc';
      }
    });
  }

  function makeSafetyTablesSortable() {
    safetyTables().forEach((table) => {
      const idx = indexes(table);
      const sortable = [
        ['file', idx.file],
        ['applicant', idx.applicant],
        ['created', idx.created],
        ['status', idx.status],
        ['employer', idx.employer]
      ].filter(([, index]) => index >= 0);

      sortable.forEach(([key, index]) => {
        const th = table.querySelectorAll('thead th')[index];
        if (!th) return;
        if (!th.dataset.phase6Sortable) {
          th.dataset.phase6Sortable = key;
          th.title = 'Click to sort';
          th.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            table.dataset.phase6ManualSort = '1';
            const currentKey = table.dataset.phase6SortKey || '';
            const currentDirection = table.dataset.phase6SortDirection || 'asc';
            const nextDirection = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
            table.dataset.phase6SortKey = key;
            table.dataset.phase6SortDirection = nextDirection;
            applySafetySort(table, key, nextDirection);
            updateSafetySortHeaders(table);
          });
        }
      });

      applyDefaultSafetySort(table);
      updateSafetySortHeaders(table);
    });
  }



  function ensureSafetyStatusOptions() {
    if (!isSafetyPage()) return;
    const wanted = ['Consent Needed', 'Consent Given', 'S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed'];
    document.querySelectorAll('select').forEach((select) => {
      const optionTexts = Array.from(select.options || []).map((option) => text(option));
      const looksLikeStatusSelect = optionTexts.some((label) => wanted.includes(label));
      if (!looksLikeStatusSelect) return;
      wanted.forEach((label) => {
        if (!optionTexts.includes(label)) {
          const option = document.createElement('option');
          option.value = label;
          option.textContent = label;
          select.appendChild(option);
        }
      });
    });
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    }));
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.message || raw || `Request failed: ${response.status}`);
    return data;
  }

  async function apiWithFallback(path, options) {
    const parts = String(path || '').split('?');
    const routePath = parts.shift() || '';
    const queryString = parts.length ? '&' + parts.join('?') : '';
    const consolidated = '/api/index?path=' + encodeURIComponent(routePath) + queryString;
    try {
      return await api(consolidated, options);
    } catch (firstError) {
      if (routePath === 'safety-response-link') {
        try {
          return await api('/api/safety-response-link', options);
        } catch {}
      }
      throw firstError;
    }
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


  // PHASE12A78_EFAX_FAX_MODAL START
  function defaultFaxCoverMessage(data) {
    return [
      data.employer ? `Attention: ${data.employer}` : '',
      '',
      'Please see the attached FMCSA Safety Performance report.',
      '',
      `Applicant: ${data.applicant || 'N/A'}`,
      data.fileNumber ? `File Number: ${data.fileNumber}` : '',
      '',
      'Thank you,',
      'SaffHire Background Screening'
    ].filter((line, index, arr) => line || arr[index - 1] !== '').join('\n').trim();
  }


  function defaultFaxSubject(data) {
    return `FMCSA Safety Performance Report${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`;
  }

  function renderFaxTemplate(value, data, extra) {
    const today = new Date().toISOString().slice(0, 10);
    const values = {
      applicantName: data.applicant || '',
      applicant: data.applicant || '',
      fileNumber: data.fileNumber || '',
      previousEmployer: data.employer || '',
      prevEmployer: data.employer || '',
      employer: data.employer || '',
      recipientName: (extra && extra.recipientName) || data.employer || '',
      recipient: (extra && extra.recipientName) || data.employer || '',
      clientName: (extra && extra.clientName) || data.clientName || data.employerName || '',
      clientEmail: (extra && extra.clientEmail) || data.clientEmail || '',
      faxNumber: (extra && extra.faxNumber) || '',
      today,
      date: today
    };
    return String(value || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (_match, key) {
      return values[key] !== undefined ? values[key] : '';
    });
  }

  let phase12a79TemplateCache = null;
  let phase12a79TemplateCacheAt = 0;

  async function loadFaxTemplates(force) {
    const now = Date.now();
    if (!force && phase12a79TemplateCache && now - phase12a79TemplateCacheAt < 30000) return phase12a79TemplateCache;
    const result = await apiWithFallback('email-templates?type=fax&companyId=' + encodeURIComponent(getCompanyId()));
    phase12a79TemplateCache = Array.isArray(result.templates) ? result.templates.filter((template) => template.isActive !== false) : [];
    phase12a79TemplateCacheAt = now;
    return phase12a79TemplateCache;
  }

  function fillFaxTemplateSelect(modal, templates) {
    const select = modal.querySelector('[data-phase12a79-template-select]');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Manual / default message</option>' + (templates || []).map((template) => `<option value="${String(template.id)}">${String(template.name || '').replace(/</g, '&lt;')}</option>`).join('');
    if (current && Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  function applyFaxTemplate(modal) {
    const data = modal.__data || {};
    const select = modal.querySelector('[data-phase12a79-template-select]');
    const selectedId = select ? Number(select.value || 0) : 0;
    const template = (phase12a79TemplateCache || []).find((item) => Number(item.id) === selectedId);
    const recipientName = String(modal.querySelector('[data-phase12a78-recipient-name]')?.value || data.employer || '').trim();
    const faxNumber = normalizeFax(modal.querySelector('[data-phase12a78-fax-number]')?.value || '');
    const subjectInput = modal.querySelector('[data-phase12a79-subject]');
    const bodyInput = modal.querySelector('[data-phase12a78-cover-message]');
    if (template) {
      if (subjectInput) subjectInput.value = renderFaxTemplate(template.subject, data, { recipientName, faxNumber });
      if (bodyInput) bodyInput.value = renderFaxTemplate(template.body, data, { recipientName, faxNumber });
    } else {
      if (subjectInput) subjectInput.value = defaultFaxSubject(data);
      if (bodyInput) bodyInput.value = defaultFaxCoverMessage(data);
    }
  }

  function getFaxModal() {
    let modal = document.getElementById('phase12a78-fax-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase12a78-fax-modal';
    modal.className = 'phase6-modal hidden';
    modal.innerHTML = `
      <div class="phase6-modal-card phase12a78-fax-card">
        <div class="phase6-modal-head">
          <h2>Fax FMCSA Report</h2>
          <button type="button" data-phase12a78-close>×</button>
        </div>
        <p class="phase6-note" data-phase12a78-summary></p>
        <label class="phase12a78-field">
          <span>Email template</span>
          <select data-phase12a79-template-select><option value="">Manual / default message</option></select>
        </label>
        <label class="phase12a78-field">
          <span>Recipient fax number</span>
          <input data-phase12a78-fax-number placeholder="Example: 9725551234" inputmode="tel" />
        </label>
        <label class="phase12a78-field">
          <span>eFax send domain</span>
          <input data-phase12a95-efax-domain value="efaxsend.com" />
        </label>
        <label class="phase12a78-field">
          <span>Recipient / Company</span>
          <input data-phase12a78-recipient-name placeholder="Previous employer or contact name" />
        </label>
        <label class="phase12a78-field">
          <span>Email subject</span>
          <input data-phase12a79-subject placeholder="FMCSA Safety Performance Report" />
        </label>
        <label class="phase12a78-field">
          <span>Email / fax cover body</span>
          <textarea data-phase12a78-cover-message rows="8"></textarea>
        </label>
        <p class="phase6-note">Templates can use <b>{{applicantName}}</b>, <b>{{fileNumber}}</b>, <b>{{previousEmployer}}</b>, <b>{{recipientName}}</b>, and <b>{{today}}</b>.</p>
        <div class="phase6-modal-actions">
          <button type="button" data-phase12a78-close class="phase12a78-secondary">Cancel</button>
          <button type="button" data-phase12a78-send>Download PDF & Open Gmail</button>
        </div>
        <div class="phase12a93-debug hidden" data-phase12a93-debug>
          <div class="phase12a93-debug-head">
            <h3>Fax Debug</h3>
            <button type="button" data-phase12a93-copy-debug>Copy Debug</button>
          </div>
          <pre data-phase12a93-debug-text></pre>
        </div>
        <p class="phase6-note"><b>Important:</b> Gmail will open with the fax email prepared and the FMCSA PDF will download. Attach the downloaded PDF in Gmail before you click Send.</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function showFaxModal(row) {
    const data = rowData(row);
    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);
    const modal = getFaxModal();
    modal.__row = row;
    modal.__data = data;
    modal.querySelector('[data-phase12a78-summary]').textContent = `File #${data.fileNumber} — ${data.applicant || 'Applicant not listed'}`;
    modal.querySelector('[data-phase12a78-fax-number]').value = '';
    modal.querySelector('[data-phase12a78-recipient-name]').value = data.employer || '';
    const domainInput = modal.querySelector('[data-phase12a95-efax-domain]');
    if (domainInput) domainInput.value = localStorage.getItem('phase12a95EfaxDomain') || 'efaxsend.com';
    modal.querySelector('[data-phase12a79-subject]').value = defaultFaxSubject(data);
    modal.querySelector('[data-phase12a78-cover-message]').value = defaultFaxCoverMessage(data);
    const debugBox = modal.querySelector('[data-phase12a93-debug]');
    const debugText = modal.querySelector('[data-phase12a93-debug-text]');
    if (debugBox) debugBox.classList.add('hidden');
    if (debugText) debugText.textContent = '';
    fillFaxTemplateSelect(modal, phase12a79TemplateCache || []);
    loadFaxTemplates().then((templates) => fillFaxTemplateSelect(modal, templates)).catch((error) => toast(error.message || 'Could not load email templates.', true));
    modal.classList.remove('hidden');
    setTimeout(() => modal.querySelector('[data-phase12a78-fax-number]')?.focus(), 50);
  }

  function closeFaxModal() {
    getFaxModal().classList.add('hidden');
  }

  function normalizeFax(value) {
    return String(value || '').replace(/[^0-9]/g, '');
  }

  function formatFaxDebug(result, data) {
    const debug = result && result.debug ? result.debug : {};
    const lines = [
      ['Status', debug.status || result?.status || 'gmail_compose_opened'],
      ['Prepared At', debug.sentAt || debug.preparedAt || new Date().toISOString()],
      ['Gmail To', debug.sentTo || result?.faxEmail || ''],
      ['eFax Domain', debug.efaxDomain || result?.efaxDomain || ''],
      ['Recipient Fax Digits', debug.recipientFaxDigits || ''],
      ['Email Provider', debug.emailProvider || 'gmail_compose'],
      ['Template ID', debug.templateId || 'Manual/default'],
      ['Template Name', debug.templateName || 'Manual/default'],
      ['Applicant', debug.applicantName || data?.applicant || ''],
      ['File #', debug.fileNumber || data?.fileNumber || ''],
      ['Subject', debug.subject || ''],
      ['PDF Downloaded', debug.pdfAttached ? 'Yes' : 'Unknown'],
      ['Attachment Filename', debug.attachmentFilename || ''],
      ['Note', debug.note || 'Gmail was opened with the fax email prepared. Attach the downloaded FMCSA PDF before sending from Gmail.']
    ];
    return lines.map(([label, value]) => `${label}: ${value || '—'}`).join('\n');
  }

  function showFaxDebug(modal, result, data) {
    const box = modal.querySelector('[data-phase12a93-debug]');
    const pre = modal.querySelector('[data-phase12a93-debug-text]');
    if (!box || !pre) return;
    pre.textContent = formatFaxDebug(result, data);
    box.classList.remove('hidden');
  }

  async function copyFaxDebug() {
    const modal = getFaxModal();
    const text = modal.querySelector('[data-phase12a93-debug-text]')?.textContent || '';
    if (!text) return toast('No fax debug details to copy yet.', true);
    try {
      await navigator.clipboard.writeText(text);
      toast('Fax debug details copied.');
    } catch {
      window.prompt('Copy fax debug details:', text);
    }
  }

  function faxDomainFromModal(modal) {
    const input = modal.querySelector('[data-phase12a95-efax-domain]');
    const value = String(input?.value || 'efaxsend.com').trim().replace(/^@+/, '').toLowerCase() || 'efaxsend.com';
    try { localStorage.setItem('phase12a95EfaxDomain', value); } catch {}
    if (input) input.value = value;
    return value;
  }

  function faxDraftFromModal() {
    const modal = getFaxModal();
    const data = modal.__data || {};
    const faxNumber = normalizeFax(modal.querySelector('[data-phase12a78-fax-number]')?.value || '');
    const domain = faxDomainFromModal(modal);
    const recipientName = String(modal.querySelector('[data-phase12a78-recipient-name]')?.value || '').trim();
    const templateId = Number(modal.querySelector('[data-phase12a79-template-select]')?.value || 0) || null;
    const template = (phase12a79TemplateCache || []).find((item) => Number(item.id) === Number(templateId));
    const subject = String(modal.querySelector('[data-phase12a79-subject]')?.value || '').trim();
    const body = String(modal.querySelector('[data-phase12a78-cover-message]')?.value || '').trim();
    const to = faxNumber ? `${faxNumber}@${domain}` : '';
    return {
      to,
      faxNumber,
      domain,
      recipientName,
      templateId,
      templateName: template ? String(template.name || '') : 'Manual/default',
      subject,
      body,
      full: `To: ${to || '[enter fax email]'}\nSubject: ${subject}\n\n${body}`,
      gmailUrl: 'https://mail.google.com/mail/?view=cm&fs=1'
        + `&to=${encodeURIComponent(to)}`
        + `&su=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`
    };
  }

  function pdfFilenameFromDisposition(disposition, fileNumber) {
    const fallback = `fmcsa-safety-performance-${String(fileNumber || 'report').replace(/[^0-9A-Za-z_-]/g, '') || 'report'}.pdf`;
    const header = String(disposition || '');
    const starMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (starMatch) {
      try { return decodeURIComponent(starMatch[1].replace(/"/g, '')); } catch {}
    }
    const match = header.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : fallback;
  }

  async function downloadFmcsaPdfForFax(data) {
    const url = '/api/index?path=' + encodeURIComponent('client-safety-pdf')
      + '&companyId=' + encodeURIComponent(getCompanyId())
      + '&fileNumber=' + encodeURIComponent(data.fileNumber || '');
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try { message = JSON.parse(raw).message || raw; } catch {}
      throw new Error(message || `Could not download FMCSA PDF: ${response.status}`);
    }
    const blob = await response.blob();
    const filename = pdfFilenameFromDisposition(response.headers.get('Content-Disposition'), data.fileNumber);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return { filename, size: blob.size };
  }

  async function sendFaxFromModal() {
    const modal = getFaxModal();
    const data = modal.__data || {};
    const draft = faxDraftFromModal();
    const sendButton = modal.querySelector('[data-phase12a78-send]');

    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);
    if (draft.faxNumber.length < 7) return toast('Enter a valid recipient fax number.', true);

    const originalText = sendButton ? sendButton.textContent : '';
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = 'Preparing Gmail...';
    }

    try {
      const pdf = await downloadFmcsaPdfForFax(data);
      await copyText(draft.full, 'Fax email draft copied. Attach the downloaded FMCSA PDF before sending in Gmail.');
      window.open(draft.gmailUrl, '_blank', 'noopener,noreferrer');
      showFaxDebug(modal, {
        status: 'gmail_compose_opened_pdf_downloaded',
        debug: {
          status: 'gmail_compose_opened_pdf_downloaded',
          preparedAt: new Date().toISOString(),
          sentTo: draft.to,
          recipientFaxDigits: draft.faxNumber,
          efaxDomain: draft.domain,
          emailProvider: 'gmail_compose_manual_send',
          templateId: draft.templateId || 'Manual/default',
          templateName: draft.templateName || 'Manual/default',
          applicantName: data.applicant || '',
          fileNumber: data.fileNumber || '',
          subject: draft.subject,
          pdfAttached: true,
          attachmentFilename: pdf.filename,
          note: 'The FMCSA PDF was downloaded and Gmail was opened. Attach the downloaded PDF in Gmail before clicking Send.'
        }
      }, data);
      toast('Gmail opened and FMCSA PDF downloaded. Attach the PDF in Gmail before sending.');
      if (sendButton) sendButton.textContent = 'Gmail Opened - Attach PDF';
    } catch (error) {
      toast(error.message || 'Could not prepare Gmail fax.', true);
      if (sendButton) sendButton.textContent = originalText || 'Download PDF & Open Gmail';
    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  }
  // PHASE12A78_EFAX_FAX_MODAL END


  // PHASE12A92_CLIENT_GMAIL_TEMPLATE_MODAL START
  function reportValue(report, key, fallback) {
    if (!report) return fallback || '';
    const value = report[key];
    return value === undefined || value === null || String(value).trim() === '' ? (fallback || '') : String(value).trim();
  }

  function buildClientGmailData(report, row) {
    const rowInfo = row ? rowData(row) : {};
    return {
      fileNumber: reportValue(report, 'fileNumber', rowInfo.fileNumber || ''),
      applicant: reportValue(report, 'applicantName', rowInfo.applicant || ''),
      applicantName: reportValue(report, 'applicantName', rowInfo.applicant || ''),
      employer: reportValue(report, 'prevEmployerName', rowInfo.employer || ''),
      previousEmployer: reportValue(report, 'prevEmployerName', rowInfo.employer || ''),
      prevEmployer: reportValue(report, 'prevEmployerName', rowInfo.employer || ''),
      employerName: reportValue(report, 'employerName', ''),
      clientName: reportValue(report, 'employerName', ''),
      clientEmail: reportValue(report, 'employerEmail', ''),
      infoReceivedFrom: reportValue(report, 'infoReceivedFrom', ''),
      infoReceivedDate: reportValue(report, 'infoReceivedDate', ''),
      status: reportValue(report, 'status', '')
    };
  }

  function defaultClientGmailSubject(data) {
    return `Completed Safety Performance Report${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`;
  }

  function defaultClientGmailBody(data) {
    return [
      'Hello,',
      '',
      `The Safety Performance report has been completed for ${data.applicant || 'the applicant'}.`,
      '',
      data.fileNumber ? `File Number: ${data.fileNumber}` : '',
      data.applicant ? `Applicant: ${data.applicant}` : '',
      data.previousEmployer ? `Previous Employer: ${data.previousEmployer}` : '',
      data.infoReceivedFrom ? `Information Received From: ${data.infoReceivedFrom}` : '',
      data.infoReceivedDate ? `Date Received: ${data.infoReceivedDate}` : '',
      '',
      'The completed packet is ready. Please attach the saved PDF packet before sending this email.',
      '',
      'Thank you,',
      'SaffHire Background Screening'
    ].filter((line, index, arr) => line || arr[index - 1] !== '').join('\n').trim();
  }

  async function phase12a92FindReport(fileNumber) {
    const result = await apiWithFallback('safety-reports?companyId=' + encodeURIComponent(getCompanyId()));
    const reports = Array.isArray(result.reports) ? result.reports : [];
    const wanted = String(fileNumber || '').trim();
    return reports.find((report) => String(report.fileNumber || '').trim() === wanted) || null;
  }

  function getClientGmailModal() {
    let modal = document.getElementById('phase12a92-client-gmail-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase12a92-client-gmail-modal';
    modal.className = 'phase6-modal hidden';
    modal.innerHTML = `
      <div class="phase6-modal-card phase12a92-client-card">
        <div class="phase6-modal-head">
          <h2>Client Gmail Draft</h2>
          <button type="button" data-phase12a92-close>×</button>
        </div>
        <p class="phase6-note" data-phase12a92-summary></p>
        <label class="phase12a78-field">
          <span>Email template</span>
          <select data-phase12a92-template-select><option value="">Manual / default client email</option></select>
        </label>
        <label class="phase12a78-field">
          <span>To / Client Email</span>
          <input data-phase12a92-to placeholder="client@example.com" />
        </label>
        <label class="phase12a78-field">
          <span>Email subject</span>
          <input data-phase12a92-subject placeholder="Completed Safety Performance Report" />
        </label>
        <label class="phase12a78-field">
          <span>Email body</span>
          <textarea data-phase12a92-body rows="9"></textarea>
        </label>
        <p class="phase6-note">Templates can use <b>{{applicantName}}</b>, <b>{{fileNumber}}</b>, <b>{{previousEmployer}}</b>, <b>{{clientName}}</b>, <b>{{clientEmail}}</b>, and <b>{{today}}</b>.</p>
        <div class="phase6-modal-actions">
          <button type="button" data-phase12a92-close class="phase12a78-secondary">Cancel</button>
          <button type="button" data-phase12a92-copy>Copy Draft</button>
          <button type="button" data-phase12a92-open-gmail>Open Gmail</button>
        </div>
        <p class="phase6-note">Gmail opens with the selected template. Attach the completed FMCSA PDF before sending.</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function fillClientGmailTemplateSelect(modal, templates) {
    const select = modal.querySelector('[data-phase12a92-template-select]');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Manual / default client email</option>' + (templates || []).map((template) => `<option value="${String(template.id)}">${String(template.name || '').replace(/</g, '&lt;')}</option>`).join('');
    if (current && Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  function applyClientGmailTemplate(modal) {
    const data = modal.__data || {};
    const select = modal.querySelector('[data-phase12a92-template-select]');
    const selectedId = select ? Number(select.value || 0) : 0;
    const template = (phase12a79TemplateCache || []).find((item) => Number(item.id) === selectedId);
    const toInput = modal.querySelector('[data-phase12a92-to]');
    const subjectInput = modal.querySelector('[data-phase12a92-subject]');
    const bodyInput = modal.querySelector('[data-phase12a92-body]');
    const clientEmail = String(toInput?.value || data.clientEmail || '').trim();
    const clientName = data.clientName || data.employerName || '';
    if (template) {
      if (subjectInput) subjectInput.value = renderFaxTemplate(template.subject, data, { clientEmail, clientName, recipientName: clientName });
      if (bodyInput) bodyInput.value = renderFaxTemplate(template.body, data, { clientEmail, clientName, recipientName: clientName });
    } else {
      if (subjectInput) subjectInput.value = defaultClientGmailSubject(data);
      if (bodyInput) bodyInput.value = defaultClientGmailBody(data);
    }
  }

  async function showClientGmailModal(row) {
    const rowInfo = rowData(row);
    if (!rowInfo.fileNumber) return toast('Could not find the file number for this report.', true);
    const modal = getClientGmailModal();
    modal.__row = row;
    modal.__data = Object.assign({}, rowInfo, { clientEmail: '', clientName: '' });
    modal.querySelector('[data-phase12a92-summary]').textContent = `Loading file #${rowInfo.fileNumber}...`;
    modal.classList.remove('hidden');

    const report = await phase12a92FindReport(rowInfo.fileNumber);
    if (!report) throw new Error(`Could not find file #${rowInfo.fileNumber} in the database.`);
    const data = buildClientGmailData(report, row);
    modal.__report = report;
    modal.__data = data;
    modal.querySelector('[data-phase12a92-summary]').textContent = `File #${data.fileNumber} — ${data.applicant || 'Applicant not listed'}`;
    modal.querySelector('[data-phase12a92-to]').value = data.clientEmail || '';
    modal.querySelector('[data-phase12a92-subject]').value = defaultClientGmailSubject(data);
    modal.querySelector('[data-phase12a92-body]').value = defaultClientGmailBody(data);
    fillClientGmailTemplateSelect(modal, phase12a79TemplateCache || []);
    const templates = await loadFaxTemplates();
    fillClientGmailTemplateSelect(modal, templates);
    applyClientGmailTemplate(modal);
    setTimeout(() => modal.querySelector('[data-phase12a92-template-select]')?.focus(), 50);
  }

  function closeClientGmailModal() {
    getClientGmailModal().classList.add('hidden');
  }

  function clientGmailDraftFromModal() {
    const modal = getClientGmailModal();
    const to = String(modal.querySelector('[data-phase12a92-to]')?.value || '').trim();
    const subject = String(modal.querySelector('[data-phase12a92-subject]')?.value || '').trim();
    const body = String(modal.querySelector('[data-phase12a92-body]')?.value || '').trim();
    return {
      to,
      subject,
      body,
      full: `To: ${to || '[enter client email]'}\nSubject: ${subject}\n\n${body}`,
      gmailUrl: 'https://mail.google.com/mail/?view=cm&fs=1'
        + `&to=${encodeURIComponent(to)}`
        + `&su=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`
    };
  }

  async function openClientGmailFromModal() {
    const draft = clientGmailDraftFromModal();
    await copyText(draft.full, 'Client email draft copied. Attach the completed FMCSA PDF before sending.');
    window.open(draft.gmailUrl, '_blank', 'noopener,noreferrer');
    closeClientGmailModal();
  }

  function isClientGmailButton(el) {
    if (!el) return false;
    if (el.matches && el.matches('[data-phase7-action="client-gmail"]')) return true;
    return phase12a89NormalizeLabel(text(el)) === 'client gmail';
  }
  // PHASE12A92_CLIENT_GMAIL_TEMPLATE_MODAL END

  async function generateLink(row, responseRole) {
    const data = rowData(row);
    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);

    const payload = {
      companyId: getCompanyId(),
      fileNumber: data.fileNumber,
      responseRole
    };

    const result = await apiWithFallback('safety-response-link', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const link = result.formUrl;
    if (!link) return toast('The app did not return a form link.', true);

    showLinkModal(row, link, data, result.expiresAt, responseRole);
  }




  // PHASE12A87_REPORT_NOTES_MANAGER START
  function phase12a87Escape(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }

  function phase12a87FormatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function phase12a87LoadNotes(row) {
    const data = rowData(row);
    if (!data.fileNumber) return { notes: [] };
    return apiWithFallback('safety-report-notes?companyId=' + encodeURIComponent(getCompanyId()) + '&fileNumber=' + encodeURIComponent(data.fileNumber));
  }

  function phase12a87NoteHtml(note, options = {}) {
    const badge = note.showToClient ? '<span class="phase12a87-note-badge client">Client can see</span>' : '<span class="phase12a87-note-badge internal">Internal only</span>';
    const meta = [note.createdBy, phase12a87FormatDate(note.createdAt)].filter(Boolean).join(' · ');
    const deleteButton = options.showDelete && note.id
      ? `<button type="button" class="phase12a87-delete-note" data-phase12a87-delete-note="${phase12a87Escape(note.id)}">Delete</button>`
      : '';
    return `<div class="phase12a87-note-item" data-phase12a87-note-id="${phase12a87Escape(note.id || '')}">
      <div class="phase12a87-note-top">${badge}${meta ? `<span class="phase12a87-note-meta">${phase12a87Escape(meta)}</span>` : ''}${deleteButton}</div>
      <div class="phase12a87-note-text">${phase12a87Escape(note.note).replace(/\n/g, '<br>')}</div>
    </div>`;
  }

  function phase12a87RenderNotesCell(cell, notes) {
    const list = cell.querySelector('[data-phase12a87-note-list]');
    if (!list) return;
    if (!notes || !notes.length) {
      list.innerHTML = '<div class="phase12a87-empty-note">No report notes yet.</div>';
      return;
    }
    list.innerHTML = notes.map(phase12a87NoteHtml).join('');
  }

  function phase12a87EnhanceNotesCell(row) {
    const table = row.closest('table');
    const idx = indexes(table);
    if (idx.notes < 0 || !row.children[idx.notes]) return;
    const cell = row.children[idx.notes];
    if (!cell.dataset.phase12a87OriginalText) cell.dataset.phase12a87OriginalText = text(cell);
    if (!cell.querySelector('[data-phase12a87-note-box]')) {
      cell.innerHTML = `
        <div class="phase12a87-note-box" data-phase12a87-note-box>
          <div class="phase12a87-note-list" data-phase12a87-note-list><span class="phase12a87-empty-note">Loading notes...</span></div>
          <button type="button" class="phase12a87-note-edit" data-phase12a87-open-notes>Edit Notes</button>
        </div>
      `;
    }
    if (cell.dataset.phase12a87Loaded === '1') return;
    cell.dataset.phase12a87Loaded = '1';
    phase12a87LoadNotes(row)
      .then((result) => {
        cell.dataset.phase12a87NoteData = JSON.stringify(result.notes || []);
        phase12a87RenderNotesCell(cell, result.notes || []);
      })
      .catch((error) => {
        cell.dataset.phase12a87Loaded = '0';
        const list = cell.querySelector('[data-phase12a87-note-list]');
        if (list) list.innerHTML = `<div class="phase12a87-empty-note danger">${phase12a87Escape(error.message || 'Could not load notes.')}</div>`;
      });
  }

  function phase12a87EnhanceNotes() {
    safetyTables().forEach((table) => {
      const idx = indexes(table);
      if (idx.notes < 0) return;
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        if (!row.children || row.children.length <= 1) return;
        phase12a87EnhanceNotesCell(row);
      });
    });
  }

  function phase12a87GetNotesModal() {
    let modal = document.getElementById('phase12a87-notes-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase12a87-notes-modal';
    modal.className = 'phase6-modal hidden';
    modal.innerHTML = `
      <div class="phase6-modal-card phase12a87-notes-card">
        <div class="phase6-modal-head">
          <h2>Report Notes</h2>
          <button type="button" data-phase12a87-close>×</button>
        </div>
        <p class="phase6-note" data-phase12a87-summary></p>
        <div class="phase12a87-existing-notes" data-phase12a87-existing-notes></div>
        <label class="phase12a87-field">
          <span>New note</span>
          <textarea data-phase12a87-note-text rows="5" placeholder="Type the note here..."></textarea>
        </label>
        <div class="phase12a87-visibility-box">
          <label><input type="radio" name="phase12a87-visibility" value="private" checked /> Do not show to client</label>
          <label><input type="radio" name="phase12a87-visibility" value="client" /> Show to client</label>
        </div>
        <div class="phase6-modal-actions">
          <button type="button" data-phase12a87-close class="phase12a78-secondary">Cancel</button>
          <button type="button" data-phase12a87-save-note>Save Note</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  async function phase12a87ShowNotesModal(row) {
    const data = rowData(row);
    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);
    const modal = phase12a87GetNotesModal();
    modal.__row = row;
    modal.__data = data;
    modal.querySelector('[data-phase12a87-summary]').textContent = `File #${data.fileNumber} — ${data.applicant || 'Applicant not listed'}`;
    modal.querySelector('[data-phase12a87-note-text]').value = '';
    const privateRadio = modal.querySelector('input[name="phase12a87-visibility"][value="private"]');
    if (privateRadio) privateRadio.checked = true;
    const existing = modal.querySelector('[data-phase12a87-existing-notes]');
    existing.innerHTML = '<p class="phase12a87-empty-note">Loading notes...</p>';
    modal.classList.remove('hidden');
    try {
      const result = await phase12a87LoadNotes(row);
      existing.innerHTML = result.notes && result.notes.length ? result.notes.map((note) => phase12a87NoteHtml(note, { showDelete: true })).join('') : '<p class="phase12a87-empty-note">No notes have been added yet.</p>';
    } catch (error) {
      existing.innerHTML = `<p class="phase12a87-empty-note danger">${phase12a87Escape(error.message || 'Could not load notes.')}</p>`;
    }
    setTimeout(() => modal.querySelector('[data-phase12a87-note-text]')?.focus(), 50);
  }

  function phase12a87CloseNotesModal() {
    phase12a87GetNotesModal().classList.add('hidden');
  }

  async function phase12a87SaveNoteFromModal() {
    const modal = phase12a87GetNotesModal();
    const row = modal.__row;
    const data = modal.__data || {};
    const noteText = String(modal.querySelector('[data-phase12a87-note-text]')?.value || '').trim();
    const showToClient = modal.querySelector('input[name="phase12a87-visibility"][value="client"]')?.checked === true;
    const button = modal.querySelector('[data-phase12a87-save-note]');
    if (!row || !data.fileNumber) return toast('Could not find the report row.', true);
    if (!noteText) return toast('Type a note before saving.', true);
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Saving...'; }
    try {
      await apiWithFallback('safety-report-notes', {
        method: 'POST',
        body: JSON.stringify({
          companyId: getCompanyId(),
          fileNumber: data.fileNumber,
          note: noteText,
          showToClient
        })
      });
      const table = row.closest('table');
      const idx = indexes(table);
      const cell = idx.notes >= 0 ? row.children[idx.notes] : null;
      if (cell) cell.dataset.phase12a87Loaded = '0';
      phase12a87EnhanceNotesCell(row);
      toast(showToClient ? 'Note saved and visible to client.' : 'Internal note saved.');
      phase12a87CloseNotesModal();
    } catch (error) {
      toast(error.message || 'Could not save note.', true);
    } finally {
      if (button) { button.disabled = false; button.textContent = original || 'Save Note'; }
    }
  }

  async function phase12a87DeleteNoteFromModal(button) {
    const modal = phase12a87GetNotesModal();
    const row = modal.__row;
    const noteId = button && button.getAttribute('data-phase12a87-delete-note');
    if (!noteId) return toast('Could not find the note to delete.', true);
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Deleting...';
    try {
      await apiWithFallback('safety-report-notes?companyId=' + encodeURIComponent(getCompanyId()) + '&id=' + encodeURIComponent(noteId), {
        method: 'DELETE'
      });
      toast('Note deleted.');
      if (row) {
        const table = row.closest('table');
        const idx = indexes(table);
        const cell = idx.notes >= 0 ? row.children[idx.notes] : null;
        if (cell) cell.dataset.phase12a87Loaded = '0';
        phase12a87EnhanceNotesCell(row);
        const existing = modal.querySelector('[data-phase12a87-existing-notes]');
        if (existing) {
          existing.innerHTML = '<p class="phase12a87-empty-note">Loading notes...</p>';
          const result = await phase12a87LoadNotes(row);
          existing.innerHTML = result.notes && result.notes.length ? result.notes.map((note) => phase12a87NoteHtml(note, { showDelete: true })).join('') : '<p class="phase12a87-empty-note">No notes have been added yet.</p>';
        }
      }
    } catch (error) {
      toast(error.message || 'Could not delete note.', true);
      button.disabled = false;
      button.textContent = original || 'Delete';
    }
  }
  // PHASE12A87_REPORT_NOTES_MANAGER END

  async function pullLiveSafety(row) {
    const data = rowData(row);
    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);

    const savedHost = localStorage.getItem('phase12a71-taz-host') || '';
    const host = window.prompt('TazWorks host from Postman URL. Leave blank if your proxy already has the host configured.', savedHost);
    if (host === null) return;
    localStorage.setItem('phase12a71-taz-host', host.trim());

    const savedClientGuid = localStorage.getItem('phase12a71-client-guid') || '';
    const clientGuid = window.prompt('Client GUID. Leave blank to use Vercel ENV TAZWORKS_CLIENT_GUID.', savedClientGuid);
    if (clientGuid === null) return;
    localStorage.setItem('phase12a71-client-guid', clientGuid.trim());

    const orderGuid = window.prompt('Order GUID from TazWorks/Postman. Leave blank only if this file was already matched during TazWorks sync.', '');
    if (orderGuid === null) return;

    toast('Pulling live Safety Performance information...');

    const result = await apiWithFallback('safety-reports/live-pull', {
      method: 'POST',
      body: JSON.stringify({
        companyId: getCompanyId(),
        fileNumber: data.fileNumber,
        host: host.trim(),
        clientGuid: clientGuid.trim(),
        orderGuid: orderGuid.trim()
      })
    });

    toast(result.message || (result.found ? 'Live Safety Performance information saved.' : 'No Safety Performance search found.'));
    setTimeout(() => window.location.reload(), 900);
  }



  function normalizeHostInput(value) {
    return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/^\/+/, '').replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
  }

  async function discoverNewSafetyReports(options) {
    const opts = options || {};
    const automatic = opts.automatic === true;
    const savedHost = localStorage.getItem('phase12a71-taz-host') || '';
    const savedClientGuid = localStorage.getItem('phase12a71-client-guid') || '';
    let host = savedHost;
    let clientGuid = savedClientGuid;
    let minFileNumber = Number(opts.minFileNumber || 6184) || 6184;
    let maxPages = Number(opts.maxPages || 100) || 100;

    if (!host) {
      const enteredHost = window.prompt('TazWorks host is needed for the live Safety Performance refresh. Paste only the host from Postman, or paste the full URL and I will clean it up.', savedHost);
      if (enteredHost === null) return;
      host = normalizeHostInput(enteredHost);
      localStorage.setItem('phase12a71-taz-host', host);
    } else {
      host = normalizeHostInput(host);
      localStorage.setItem('phase12a71-taz-host', host);
    }

    if (!automatic) {
      const enteredHost = window.prompt('TazWorks host from Postman URL.', host);
      if (enteredHost === null) return;
      host = normalizeHostInput(enteredHost);
      localStorage.setItem('phase12a71-taz-host', host);
    }

    if (!clientGuid && !automatic) {
      const enteredClientGuid = window.prompt('Client GUID. Leave blank to use Vercel ENV TAZWORKS_CLIENT_GUID.', savedClientGuid);
      if (enteredClientGuid === null) return;
      clientGuid = enteredClientGuid.trim();
      localStorage.setItem('phase12a71-client-guid', clientGuid);
    }

    if (!automatic) {
      const minFileNumberRaw = window.prompt('Create/update Safety Performance reports for file numbers greater than:', String(minFileNumber));
      if (minFileNumberRaw === null) return;
      minFileNumber = Number(minFileNumberRaw || minFileNumber) || minFileNumber;

      const maxPagesRaw = window.prompt('Maximum TazWorks order pages to check. The app skips files at/below 6184 and only stops when a whole page is below that number.', String(maxPages));
      if (maxPagesRaw === null) return;
      maxPages = Number(maxPagesRaw || maxPages) || maxPages;
    }

    toast(`Refreshing live Safety Performance reports from TazWorks. Looking for file numbers greater than ${minFileNumber}...`);

    const result = await apiWithFallback('safety-reports/live-discover', {
      method: 'POST',
      body: JSON.stringify({
        companyId: getCompanyId(),
        host: String(host || '').trim(),
        clientGuid: String(clientGuid || '').trim(),
        minFileNumber,
        pageSize: 50,
        maxPages,
        stopAtMinFileNumber: true
      })
    });

    const summary = result.summary || {};
    const message = result.message || `Created ${summary.created || 0}, updated ${summary.updated || 0}.`;
    const errorPreview = Array.isArray(summary.errors) && summary.errors.length ? ` First error: ${summary.errors[0]}` : '';
    const detail = ` Checked ${summary.ordersPulled || 0} orders; candidates > ${minFileNumber}: ${summary.candidatesGreaterThanMin || 0}; created ${summary.created || 0}; updated ${summary.updated || 0}; no Safety Performance search: ${summary.noSafetySearch || 0}; no records: ${summary.noRecords || 0}; errors: ${summary.errorsCount || 0}.${errorPreview}`;
    toast(message + detail, Number(summary.errorsCount || 0) > 0);
    setTimeout(() => window.location.reload(), 2200);
  }

  function safetyRefreshButton() {
    if (!isSafetyPage()) return null;
    const buttons = Array.from(document.querySelectorAll('.page-header button, .head button, button'));
    return buttons.find((button) => /^refresh$/i.test(text(button)) && !button.dataset.phase6RefreshHooked) || null;
  }

  function hookSafetyRefreshButton() {
    const button = safetyRefreshButton();
    if (!button) return;
    button.dataset.phase6RefreshHooked = '1';
    button.title = 'Refresh from TazWorks and auto-create/update Safety Performance reports for files greater than 6184.';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      discoverNewSafetyReports({ automatic: true, minFileNumber: 6184, maxPages: 100 })
        .catch((error) => toast(error.message || 'Could not refresh live Safety Performance reports.', true));
    }, true);
  }


  function buildRequestDraft(link, data, responseRole) {
    const isApplicant = responseRole === 'applicant';
    const subject = isApplicant
      ? `Applicant Safety Performance Verification${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`
      : `Safety Performance Form Request${data.fileNumber ? ` - File #${data.fileNumber}` : ''}`;
    const body = isApplicant ? [
      'Hello,',
      '',
      'SaffHire Background Screening needs you to review the Safety Performance form information below.',
      '',
      `Applicant: ${data.applicant || '[Applicant Name]'}`,
      data.fileNumber ? `File Number: ${data.fileNumber}` : '',
      '',
      'Please use this secure link to verify the previous employer / prospective employer information and sign electronically:',
      link,
      '',
      'Thank you,',
      'SaffHire Background Screening'
    ].filter(Boolean).join('\n') : [
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

    const to = isApplicant ? '' : (data.employerEmail || '');

    return {
      to,
      subject,
      body,
      full: `To: ${to || (isApplicant ? '[enter applicant email]' : '[enter employer email]')}\nSubject: ${subject}\n\n${body}`,
      gmailUrl: 'https://mail.google.com/mail/?view=cm&fs=1'
        + `&to=${encodeURIComponent(to)}`
        + `&su=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`
    };
  }

  // PHASE12A68_RESPONSE_LINK_MODAL_EXEMPTION
  function getModal() {
    let modal = document.getElementById('phase6-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phase6-modal';
    modal.className = 'phase6-modal hidden';
    modal.innerHTML = `
      <div class="phase6-modal-card">
        <div class="phase6-modal-head">
          <h2 data-phase6-title>Secure Response Link</h2>
          <button type="button" data-phase6-close>×</button>
        </div>
        <div class="phase6-link-box">
          <span data-phase6-link-label>Secure response URL</span>
          <textarea data-phase6-link rows="3" readonly></textarea>
        </div>
        <div class="phase6-link-meta" data-phase6-meta></div>
        <div class="phase6-modal-actions">
          <button type="button" data-phase6-copy-link>Copy Link</button>
          <button type="button" data-phase6-copy-draft>Copy Email Draft</button>
          <button type="button" data-phase6-open-form>Open Form</button>
          <button type="button" data-phase6-open-gmail>Open Gmail</button>
        </div>
        <p class="phase6-note" data-phase6-note>The link can be opened without logging in. The link expires automatically.</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function showLinkModal(row, link, data, expiresAt, responseRole) {
    const modal = getModal();
    modal.__link = link;
    modal.__data = data;
    modal.__row = row;
    modal.__responseRole = responseRole || 'employer';
    const isApplicant = modal.__responseRole === 'applicant';
    modal.querySelector('[data-phase6-title]').textContent = isApplicant ? 'Secure Applicant Verification Link' : 'Secure Employer Response Link';
    modal.querySelector('[data-phase6-link-label]').textContent = isApplicant ? 'Applicant verification URL' : 'Employer response URL';
    modal.querySelector('[data-phase6-link]').value = link;
    modal.querySelector('[data-phase6-meta]').textContent = expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : 'Expires in 14 days.';
    modal.querySelector('[data-phase6-note]').textContent = isApplicant
      ? 'Send this link to the applicant first. After the applicant signs, generate/send the employer response link.'
      : 'Send this link to the previous employer after the applicant has verified and signed Section 1.';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    getModal().classList.add('hidden');
  }

  function ensureActionColumn(table) {
    const idx = indexes(table);
    if (idx.actions >= 0) return idx.actions;

    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      const th = document.createElement('th');
      th.textContent = 'Response Links';
      headerRow.appendChild(th);
    }

    Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
      if (row.dataset.phase6ActionCellAdded === '1') return;
      const td = document.createElement('td');
      row.appendChild(td);
      row.dataset.phase6ActionCellAdded = '1';
    });

    return table.querySelectorAll('thead th').length - 1;
  }



  function removeLegacySafetyButtons() {
    const removeLabels = new Set([
      'pdf',
      'email',
      'copy',
      'open gmail',
      'final packet',
      'copy client draft'
    ]);

    safetyTables().forEach((table) => {
      Array.from(table.querySelectorAll('button, a')).forEach((el) => {
        const label = text(el).replace(/\s+/g, ' ').trim().toLowerCase();
        if (!label) return;
        if (removeLabels.has(label)) {
          el.remove();
        }
      });
    });
  }

  let phase12a83LegacyButtonObserverStarted = false;
  let phase12a83LegacyCleanupQueued = false;

  function queueLegacyButtonCleanup() {
    if (phase12a83LegacyCleanupQueued) return;
    phase12a83LegacyCleanupQueued = true;
    window.requestAnimationFrame(() => {
      phase12a83LegacyCleanupQueued = false;
      if (!isSafetyPage() || phase12a80EmailSettingsActive) return;
      removeLegacySafetyButtons();
      phase12a89NormalizeLinksColumn();
    });
  }

  function startLegacyButtonObserver() {
    if (phase12a83LegacyButtonObserverStarted || !document.body) return;
    phase12a83LegacyButtonObserverStarted = true;
    const labelsToCatch = /(^|\s)(pdf|email|copy)(\s|$)|open gmail|final packet|copy client draft/i;
    const observer = new MutationObserver((mutations) => {
      if (!isSafetyPage() || phase12a80EmailSettingsActive) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== 1) continue;
          const nodeText = text(node).replace(/\s+/g, ' ').trim();
          if (labelsToCatch.test(nodeText)) {
            queueLegacyButtonCleanup();
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    queueLegacyButtonCleanup();
  }

  function addButtons() {
    safetyTables().forEach((table) => {
      const actionIndex = ensureActionColumn(table);
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        const cells = Array.from(row.children);
        const actionCell = cells[actionIndex] || cells[cells.length - 1];
        if (!actionCell) return;
        const existingLabels = Array.from(actionCell.querySelectorAll('button, a')).map((el) => phase12a89NormalizeLabel(text(el)));
        if (existingLabels.includes('applicant link') && existingLabels.includes('employer link') && existingLabels.includes('fax fmcsa')) return;

        const group = document.createElement('div');
        group.className = 'phase6-link-group';

        const applicantButton = document.createElement('button');
        applicantButton.type = 'button';
        applicantButton.className = 'phase6-link-button applicant';
        applicantButton.textContent = 'Applicant Link';
        applicantButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          generateLink(row, 'applicant').catch((error) => toast(error.message || 'Could not generate applicant link.', true));
        });

        const employerButton = document.createElement('button');
        employerButton.type = 'button';
        employerButton.className = 'phase6-link-button employer';
        employerButton.textContent = 'Employer Link';
        employerButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          generateLink(row, 'employer').catch((error) => toast(error.message || 'Could not generate employer link.', true));
        });

        const faxButton = document.createElement('button');
        faxButton.type = 'button';
        faxButton.className = 'phase6-link-button fax';
        faxButton.textContent = 'Fax FMCSA';
        faxButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showFaxModal(row);
        });

        group.appendChild(applicantButton);
        group.appendChild(employerButton);
        group.appendChild(faxButton);
        actionCell.appendChild(group);
      });
    });
  }




  // PHASE12A90_SINGLE_LINKS_COLUMN START
  function phase12a90LinkColumnCandidates(table) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    return headers
      .map((th, index) => ({ th, index, label: cleanHeader(text(th)) }))
      .filter((item) => item.label === 'links' || item.label === 'phase 4 actions' || item.label === 'response links' || item.label === 'actions' || item.label.includes('response'));
  }

  function phase12a90CellHasLinkButtons(cell) {
    if (!cell) return false;
    return Array.from(cell.querySelectorAll('button, a')).some((el) => {
      const label = phase12a89NormalizeLabel(text(el));
      return ['applicant link', 'employer link', 'fax fmcsa', 'client gmail', 'mark completed', 'fmcsa pdf'].includes(label) || phase12a89IsIconOnlyAction(el);
    });
  }

  function phase12a90CollapseDuplicateLinksColumns() {
    if (!isSafetyPage()) return;
    safetyTables().forEach((table) => {
      let candidates = phase12a90LinkColumnCandidates(table);
      if (!candidates.length) return;

      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      let primary = candidates[0].index;
      const withButtons = candidates.find((candidate) => bodyRows.some((row) => phase12a90CellHasLinkButtons(row.children[candidate.index])));
      if (withButtons) primary = withButtons.index;

      const headers = Array.from(table.querySelectorAll('thead th'));
      if (headers[primary]) headers[primary].textContent = 'Links';

      candidates
        .map((candidate) => candidate.index)
        .filter((index) => index !== primary)
        .sort((a, b) => b - a)
        .forEach((removeIndex) => {
          bodyRows.forEach((row) => {
            const keepCell = row.children[primary];
            const removeCell = row.children[removeIndex];
            if (keepCell && removeCell && keepCell !== removeCell) {
              Array.from(removeCell.childNodes).forEach((node) => {
                const isBlankText = node.nodeType === 3 && !String(node.textContent || '').trim();
                if (!isBlankText) keepCell.appendChild(node);
              });
            }
            if (removeCell) removeCell.remove();
          });
          const liveHeaders = Array.from(table.querySelectorAll('thead th'));
          if (liveHeaders[removeIndex]) liveHeaders[removeIndex].remove();
          if (removeIndex < primary) primary -= 1;
        });

      const finalHeaders = Array.from(table.querySelectorAll('thead th'));
      if (finalHeaders[primary]) finalHeaders[primary].textContent = 'Links';
    });
  }
  // PHASE12A90_SINGLE_LINKS_COLUMN END

  // PHASE12A89_LINKS_COLUMN_CLEANUP START
  function phase12a89NormalizeLabel(label) {
    return String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function phase12a89DesiredOrder(label) {
    const order = {
      'applicant link': 10,
      'employer link': 20,
      'fax fmcsa': 30,
      'client gmail': 40,
      'mark completed': 50,
      'fmcsa pdf': 60
    };
    return order[phase12a89NormalizeLabel(label)] || 999;
  }

  function phase12a89GroupClass(label) {
    const normalized = phase12a89NormalizeLabel(label);
    if (normalized === 'applicant link') return 'blue';
    if (normalized === 'employer link' || normalized === 'fmcsa pdf') return 'green';
    if (normalized === 'fax fmcsa' || normalized === 'client gmail' || normalized === 'mark completed') return 'purple';
    return 'other';
  }

  function phase12a89RenameLinksHeader(table) {
    const idx = indexes(table);
    const headers = Array.from(table.querySelectorAll('thead th'));
    const actionHeader = idx.actions >= 0 ? headers[idx.actions] : null;
    if (actionHeader && text(actionHeader) !== 'Links') actionHeader.textContent = 'Links';
  }

  function phase12a89IsIconOnlyAction(el) {
    const label = phase12a89NormalizeLabel(text(el));
    if (label) return false;
    return Boolean(el.querySelector('svg')) || el.classList.contains('icon-btn');
  }

  function phase12a89NormalizeLinksColumn() {
    if (!isSafetyPage()) return;
    safetyTables().forEach((table) => {
      phase12a89RenameLinksHeader(table);
      const idx = indexes(table);
      if (idx.actions < 0) return;
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        if (!row.children || row.children.length <= idx.actions) return;
        const cell = row.children[idx.actions];
        if (!cell) return;
        cell.classList.add('phase12a89-links-cell');

        let layout = cell.querySelector(':scope > .phase12a89-links-layout');
        if (!layout) {
          layout = document.createElement('div');
          layout.className = 'phase12a89-links-layout';
          layout.innerHTML = '<div class="phase12a89-links-main"></div><div class="phase12a89-link-tools"></div>';
          cell.insertBefore(layout, cell.firstChild);
        }

        const main = layout.querySelector('.phase12a89-links-main');
        const tools = layout.querySelector('.phase12a89-link-tools');
        const desired = new Map();
        const iconActions = [];

        Array.from(cell.querySelectorAll('button, a')).forEach((el) => {
          if (el.closest('.phase6-modal') || el.closest('#phase12a87-notes-modal')) return;
          const label = phase12a89NormalizeLabel(text(el));
          if (['pdf', 'email', 'copy', 'open gmail', 'final packet', 'copy client draft'].includes(label)) {
            el.remove();
            return;
          }
          if (['applicant link', 'employer link', 'fax fmcsa', 'client gmail', 'mark completed', 'fmcsa pdf'].includes(label)) {
            if (!desired.has(label)) desired.set(label, el);
            else el.remove();
            return;
          }
          if (phase12a89IsIconOnlyAction(el)) iconActions.push(el);
        });

        if (!desired.has('applicant link') || !desired.has('employer link') || !desired.has('fax fmcsa')) {
          addButtons();
          Array.from(cell.querySelectorAll('button, a')).forEach((el) => {
            const label = phase12a89NormalizeLabel(text(el));
            if (['applicant link', 'employer link', 'fax fmcsa'].includes(label)) {
              if (!desired.has(label)) desired.set(label, el);
              else if (desired.get(label) !== el) el.remove();
            }
          });
        }

        main.innerHTML = '';
        ['blue', 'green', 'purple'].forEach((groupName) => {
          const items = Array.from(desired.entries())
            .filter(([label]) => phase12a89GroupClass(label) === groupName)
            .sort((a, b) => phase12a89DesiredOrder(a[0]) - phase12a89DesiredOrder(b[0]));
          if (!items.length) return;
          const group = document.createElement('div');
          group.className = 'phase12a89-link-color-group ' + groupName;
          items.forEach(([, el]) => group.appendChild(el));
          main.appendChild(group);
        });

        tools.innerHTML = '';
        const uniqueTools = new Set();
        iconActions.forEach((el) => {
          if (uniqueTools.has(el)) return;
          uniqueTools.add(el);
          tools.appendChild(el);
        });

        Array.from(cell.childNodes).forEach((node) => {
          if (node === layout) return;
          if (node.nodeType === 3 && !String(node.textContent || '').trim()) {
            node.remove();
            return;
          }
          if (node.nodeType === 1 && !node.closest('.phase12a89-links-layout')) node.remove();
        });
      });
    });
  }
  // PHASE12A89_LINKS_COLUMN_CLEANUP END

  function addPanel() {
    if (!isSafetyPage() || document.getElementById('phase6-panel')) return;

    const header = Array.from(document.querySelectorAll('.page-header h1, h1, .head h2')).find((h) => /safety performance/i.test(text(h)));
    if (!header) return;

    const after = document.getElementById('phase5a-panel') || document.getElementById('phase4d-panel') || document.getElementById('phase4c-command-center') || header.closest('.page-header') || header.closest('.head');
    const panel = document.createElement('section');
    panel.id = 'phase6-panel';
    panel.className = 'card wide-card phase6-panel';
    panel.innerHTML = `
      <h2>Applicant + Employer Response Forms</h2>
      <p>The page <b>Refresh</b> button now checks live TazWorks orders, looks for file numbers greater than <b>6184</b>, and automatically creates or updates Safety Performance reports when Safety Performance and DOT Verification information is found.</p>
      <p>Each report keeps the same workflow: send the <b>Applicant Link</b> first so the applicant can verify Section 1 and sign electronically. Then send the <b>Employer Link</b> to the previous employer so they can complete Sections 2–5.</p>
      <p>Use <b>Fax FMCSA</b> when a completed FMCSA Safety Performance report needs to be sent through eFax.</p>
    `;
    if (after) after.insertAdjacentElement('afterend', panel);
  }




  // PHASE12A80_EMAIL_SETTINGS_PAGE START
  function emailSettingsPanelMarkup() {
    return `
      <h2>Email Settings</h2>
      <p class="muted">Create reusable fax/email templates. Use <b>{{applicantName}}</b> to pull in the applicant's name. You can also use <b>{{fileNumber}}</b>, <b>{{previousEmployer}}</b>, <b>{{recipientName}}</b>, <b>{{faxNumber}}</b>, and <b>{{today}}</b>.</p>
      <div class="phase12a79-template-form">
        <label><span>Template Name</span><input data-phase12a79-new-name placeholder="Example: FMCSA Fax Cover" /></label>
        <label><span>Subject</span><input data-phase12a79-new-subject placeholder="FMCSA Safety Performance Report - {{applicantName}}" /></label>
        <label class="wide"><span>Email Body</span><textarea data-phase12a79-new-body rows="6" placeholder="Please see attached FMCSA report for {{applicantName}}."></textarea></label>
        <button type="button" data-phase12a79-add-template>Create Template</button>
      </div>
      <div data-phase12a79-list class="phase12a79-template-list"><p class="muted">Loading templates...</p></div>
    `;
  }

  function ensureEmailSettingsNav() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    let button = nav.querySelector('[data-phase12a80-email-settings-nav]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-btn phase12a80-email-nav';
      button.setAttribute('data-phase12a80-email-settings-nav', '1');
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg> Email Settings';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        renderEmailSettingsPage();
      });
      nav.appendChild(button);
    }
    setEmailSettingsNavActive(phase12a80EmailSettingsActive);
  }

  function setEmailSettingsNavActive(active) {
    const emailButton = document.querySelector('[data-phase12a80-email-settings-nav]');
    if (!emailButton) return;
    if (active) {
      document.querySelectorAll('.sidebar .nav-btn').forEach((button) => button.classList.remove('active'));
      emailButton.classList.add('active');
    } else {
      emailButton.classList.remove('active');
    }
  }

  function removeEmbeddedEmailSettingsCard() {
    if (phase12a80EmailSettingsActive) return;
    const card = document.getElementById('phase12a79-email-settings');
    if (card && isSettingsPage()) card.remove();
  }

  function renderEmailSettingsPage() {
    const main = document.querySelector('.main-panel') || document.querySelector('main') || document.body;
    if (!main) return;
    getCompanyId();
    phase12a80EmailSettingsActive = true;
    setEmailSettingsNavActive(true);
    main.innerHTML = `
      <div class="page-header phase12a80-email-page-header">
        <div>
          <h1>Email Settings</h1>
          <p>Create and manage reusable subject/body templates for faxing FMCSA reports.</p>
        </div>
      </div>
      <section id="phase12a79-email-settings" class="card wide-card settings-card phase12a79-settings-card phase12a80-email-settings-page">
        ${emailSettingsPanelMarkup()}
      </section>
    `;
    loadTemplateSettings().catch((error) => toast(error.message || 'Could not load email templates.', true));
  }
  // PHASE12A80_EMAIL_SETTINGS_PAGE END

  // PHASE12A79_EMAIL_TEMPLATE_SETTINGS_UI START
  function addEmailSettingsPage() {
    if (!isSettingsPage()) return;
    if (document.getElementById('phase12a79-email-settings')) return;
    const anchor = Array.from(document.querySelectorAll('.settings-card, .card.wide-card')).pop() || document.querySelector('.main-panel') || document.body;
    const panel = document.createElement('section');
    panel.id = 'phase12a79-email-settings';
    panel.className = 'card wide-card settings-card phase12a79-settings-card';
    panel.innerHTML = emailSettingsPanelMarkup();
    anchor.insertAdjacentElement('afterend', panel);
    loadTemplateSettings().catch((error) => toast(error.message || 'Could not load email templates.', true));
  }

  async function loadTemplateSettings() {
    const panel = document.getElementById('phase12a79-email-settings');
    if (!panel) return;
    const list = panel.querySelector('[data-phase12a79-list]');
    const result = await apiWithFallback('email-templates?type=fax&companyId=' + encodeURIComponent(getCompanyId()));
    phase12a79TemplateCache = Array.isArray(result.templates) ? result.templates : [];
    phase12a79TemplateCacheAt = Date.now();
    renderTemplateSettingsList(phase12a79TemplateCache);
  }

  function renderTemplateSettingsList(templates) {
    const panel = document.getElementById('phase12a79-email-settings');
    if (!panel) return;
    const list = panel.querySelector('[data-phase12a79-list]');
    if (!list) return;
    if (!templates || !templates.length) {
      list.innerHTML = '<p class="muted">No email templates yet.</p>';
      return;
    }
    list.innerHTML = templates.map((template) => `
      <div class="phase12a79-template-row" data-phase12a79-template-id="${template.id}">
        <div class="phase12a79-row-grid">
          <label><span>Name</span><input data-phase12a79-name value="${escapeAttr(template.name || '')}" /></label>
          <label><span>Subject</span><input data-phase12a79-subject-edit value="${escapeAttr(template.subject || '')}" /></label>
          <label><span>Active</span><select data-phase12a79-active><option value="true" ${template.isActive !== false ? 'selected' : ''}>Active</option><option value="false" ${template.isActive === false ? 'selected' : ''}>Inactive</option></select></label>
        </div>
        <label class="phase12a79-body-label"><span>Body</span><textarea data-phase12a79-body rows="5">${escapeHtml(template.body || '')}</textarea></label>
        <div class="phase12a79-row-actions"><button type="button" data-phase12a79-save-template>Save</button><button type="button" class="danger" data-phase12a79-delete-template>Delete</button></div>
      </div>
    `).join('');
  }

  function escapeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function templatePayloadFromPanel(prefix, row) {
    if (prefix === 'new') {
      const panel = document.getElementById('phase12a79-email-settings');
      return {
        type: 'fax',
        name: String(panel.querySelector('[data-phase12a79-new-name]')?.value || '').trim(),
        subject: String(panel.querySelector('[data-phase12a79-new-subject]')?.value || '').trim(),
        body: String(panel.querySelector('[data-phase12a79-new-body]')?.value || '').trim(),
        isActive: true
      };
    }
    return {
      id: Number(row?.dataset.phase12a79TemplateId || 0),
      type: 'fax',
      name: String(row.querySelector('[data-phase12a79-name]')?.value || '').trim(),
      subject: String(row.querySelector('[data-phase12a79-subject-edit]')?.value || '').trim(),
      body: String(row.querySelector('[data-phase12a79-body]')?.value || '').trim(),
      isActive: String(row.querySelector('[data-phase12a79-active]')?.value || 'true') === 'true'
    };
  }

  async function addEmailTemplate() {
    const panel = document.getElementById('phase12a79-email-settings');
    const payload = templatePayloadFromPanel('new');
    if (!payload.name || !payload.subject || !payload.body) return toast('Template name, subject, and body are required.', true);
    await apiWithFallback('email-templates?companyId=' + encodeURIComponent(getCompanyId()), { method: 'POST', body: JSON.stringify(payload) });
    panel.querySelector('[data-phase12a79-new-name]').value = '';
    panel.querySelector('[data-phase12a79-new-subject]').value = '';
    panel.querySelector('[data-phase12a79-new-body]').value = '';
    toast('Email template created.');
    await loadTemplateSettings();
  }

  async function saveEmailTemplate(button) {
    const row = button.closest('[data-phase12a79-template-id]');
    const payload = templatePayloadFromPanel('edit', row);
    if (!payload.id || !payload.name || !payload.subject || !payload.body) return toast('Template name, subject, and body are required.', true);
    await apiWithFallback('email-templates?companyId=' + encodeURIComponent(getCompanyId()), { method: 'PATCH', body: JSON.stringify(payload) });
    toast('Email template saved.');
    await loadTemplateSettings();
  }

  async function deleteEmailTemplate(button) {
    const row = button.closest('[data-phase12a79-template-id]');
    const id = Number(row?.dataset.phase12a79TemplateId || 0);
    if (!id) return;
    if (!window.confirm('Delete this email template?')) return;
    await apiWithFallback('email-templates?id=' + encodeURIComponent(id) + '&companyId=' + encodeURIComponent(getCompanyId()), { method: 'DELETE' });
    toast('Email template deleted.');
    await loadTemplateSettings();
  }
  // PHASE12A79_EMAIL_TEMPLATE_SETTINGS_UI END



  // PHASE12A85_EDIT_FORM_LAYOUT_AND_SIGNATURE_STATUS START
  function phase12a85FindField(labelText) {
    const wanted = String(labelText || '').trim().toLowerCase();
    return Array.from(document.querySelectorAll('.form-card .field, form .field, form label')).find((label) => {
      const span = label.querySelector('span');
      const labelValue = (span ? text(span) : text(label)).trim().toLowerCase();
      return labelValue === wanted || labelValue.startsWith(wanted);
    }) || null;
  }

  function phase12a85FindInput(labelText) {
    const field = phase12a85FindField(labelText);
    if (!field) return null;
    return field.querySelector('input, textarea, select');
  }

  function phase12a85ParseSignature(value) {
    const raw = String(value || '');
    const re = /\[Applicant Electronic Signature\]\s*Name:\s*([^\n|]+?)\s*\|\s*Date:\s*([^\n|]+)(?:\s*\|\s*IP:\s*([^\n]+))?/g;
    let match;
    let latest = null;
    while ((match = re.exec(raw)) !== null) {
      latest = {
        name: String(match[1] || '').trim(),
        signedAt: String(match[2] || '').trim(),
        ip: String(match[3] || '').trim()
      };
    }
    return latest;
  }

  function phase12a85FormatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function phase12a85EnsureStatusOptions() {
    const statusSelect = phase12a85FindInput('Status');
    if (!statusSelect || statusSelect.tagName !== 'SELECT') return;
    const wanted = ['Consent Needed', 'Consent Given', 'S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed'];
    const existing = Array.from(statusSelect.options || []).map((option) => text(option));
    wanted.forEach((label) => {
      if (!existing.includes(label)) {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        statusSelect.appendChild(option);
      }
    });
  }

  function phase12a85SignatureCardHtml(signature, statusValue, applicantName) {
    const hasSignature = Boolean(signature && signature.name);
    const consentGiven = /consent\s+given/i.test(statusValue || '');
    const safe = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    if (hasSignature) {
      return `
        <div class="phase12a85-signature-card signed">
          <div class="phase12a85-signature-icon">✓</div>
          <div>
            <h4>Applicant Signed</h4>
            <p><b>Electronic Signature:</b> ${safe(signature.name)}</p>
            <p><b>Signed Date:</b> ${safe(phase12a85FormatDate(signature.signedAt))}</p>
            ${signature.ip ? `<p><b>IP Address:</b> ${safe(signature.ip)}</p>` : ''}
          </div>
        </div>
      `;
    }
    if (consentGiven) {
      return `
        <div class="phase12a85-signature-card warning">
          <div class="phase12a85-signature-icon">!</div>
          <div>
            <h4>Consent Given — Signature Detail Not Found</h4>
            <p>The report status is Consent Given, but no electronic signature marker was found in the notes field.</p>
          </div>
        </div>
      `;
    }
    return `
      <div class="phase12a85-signature-card unsigned">
        <div class="phase12a85-signature-icon">!</div>
        <div>
          <h4>Applicant Not Signed Yet</h4>
          <p>${safe(applicantName || 'The applicant')} has not submitted the applicant verification form yet.</p>
          <p>Send the <b>Applicant Link</b> from the Safety Performance report list before sending the Employer Link.</p>
        </div>
      </div>
    `;
  }

  function phase12a85CleanSectionTitles() {
    const sectionTitles = Array.from(document.querySelectorAll('.form-card .form-section h3'));
    sectionTitles.forEach((h3) => {
      if (h3.dataset.phase12a85Enhanced === '1') return;
      h3.dataset.phase12a85Enhanced = '1';
      const current = text(h3).replace(/\s*⌄\s*$/, '').trim();
      h3.innerHTML = `<span>${current}</span><span class="phase12a85-chevron">⌄</span>`;
    });
  }

  function enhanceSafetyEditPage() {
    const active = isSafetyEditPage();
    document.body.classList.toggle('phase12a85-edit-page', active);
    if (!active) return;

    const form = document.querySelector('form.form-card, form.card.form-card');
    if (!form) return;
    form.classList.add('phase12a85-response-style-form');

    phase12a85EnsureStatusOptions();
    phase12a85CleanSectionTitles();

    const followUpField = phase12a85FindField('Follow Up Date');
    if (followUpField) followUpField.classList.add('phase12a88-hide-follow-up');

    const applicantInput = phase12a85FindInput('Applicant Name');
    const statusSelect = phase12a85FindInput('Status');
    const notesField = phase12a85FindField('Notes');
    if (notesField) notesField.classList.add('phase12a87-hide-form-notes');
    const notesInput = notesField ? notesField.querySelector('textarea') : null;
    const firstSection = form.querySelector('.form-section');
    if (!firstSection) return;

    let card = form.querySelector('[data-phase12a85-signature-status]');
    if (!card) {
      card = document.createElement('div');
      card.setAttribute('data-phase12a85-signature-status', '1');
      if (notesField && notesField.parentNode) notesField.insertAdjacentElement('afterend', card);
      else firstSection.appendChild(card);
    }

    const signature = phase12a85ParseSignature(notesInput ? notesInput.value : '');
    const statusValue = statusSelect ? statusSelect.value : '';
    const applicantName = applicantInput ? applicantInput.value : '';
    const nextHtml = phase12a85SignatureCardHtml(signature, statusValue, applicantName);
    if (card.innerHTML.trim() !== nextHtml.trim()) card.innerHTML = nextHtml;

    if (notesInput && !notesInput.dataset.phase12a85Listener) {
      notesInput.dataset.phase12a85Listener = '1';
      notesInput.addEventListener('input', () => setTimeout(enhanceSafetyEditPage, 0));
    }
    if (statusSelect && !statusSelect.dataset.phase12a85Listener) {
      statusSelect.dataset.phase12a85Listener = '1';
      statusSelect.addEventListener('change', () => setTimeout(enhanceSafetyEditPage, 0));
    }
  }
  // PHASE12A85_EDIT_FORM_LAYOUT_AND_SIGNATURE_STATUS END

  function addStyles() {
    if (document.getElementById('phase6-style')) return;
    const style = document.createElement('style');
    style.id = 'phase6-style';
    style.textContent = `
      .phase12a85-edit-page .main-panel { background: #f4f7fb; }
      .phase12a85-edit-page .page-header { max-width: 1180px; margin-left: auto; margin-right: auto; align-items: flex-start; }
      .phase12a85-edit-page .page-header h1 { font-size: 32px; color: #0f172a; }
      .phase12a85-edit-page .page-header p { color: #64748b; }
      .phase12a85-response-style-form { max-width: 1180px; margin: 0 auto 30px; border-radius: 18px; overflow: hidden; background: #fff; border: 1px solid #dbe4ef; box-shadow: 0 18px 50px rgba(15,23,42,.08); }
      .phase12a85-edit-page .form-section { padding: 18px 22px 24px; border-bottom: 1px solid #dbe4ef; background: #fff; }
      .phase12a85-edit-page .form-section h3 { display: flex; justify-content: space-between; align-items: center; margin: -18px -22px 18px; padding: 13px 18px; border: 0; border-radius: 0; background: #dbeafe; color: #1e3a8a; font-size: 15px; font-weight: 900; letter-spacing: .01em; }
      .phase12a85-chevron { color: #2563eb; font-weight: 900; }
      .phase12a85-edit-page .form-section h4 { margin: 22px 0 12px; padding-top: 4px; font-size: 14px; color: #1e293b; text-transform: none; letter-spacing: 0; }
      .phase12a85-edit-page .field span { color: #475569; font-weight: 900; }
      .phase12a85-edit-page input, .phase12a85-edit-page select, .phase12a85-edit-page textarea { border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
      .phase12a85-edit-page input:focus, .phase12a85-edit-page select:focus, .phase12a85-edit-page textarea:focus { outline: 2px solid rgba(37,99,235,.18); border-color: #2563eb; }
      .phase12a85-edit-page .check-grid .check-row { border-radius: 10px; background: #f8fafc; }
      .phase12a85-edit-page .accident-row { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; }
      .phase12a85-edit-page .form-actions { max-width: 1180px; margin: 0 auto; border-top: 1px solid #dbe4ef; background: #f8fafc; }
      .phase12a85-signature-card { display: flex; gap: 14px; align-items: flex-start; border-radius: 14px; padding: 14px 16px; margin: 16px 0 4px; border: 1px solid #e2e8f0; }
      .phase12a85-signature-card h4 { margin: 0 0 6px !important; padding: 0 !important; font-size: 16px !important; text-transform: none !important; letter-spacing: 0 !important; }
      .phase12a85-signature-card p { margin: 3px 0; color: #334155; font-size: 13px; }
      .phase12a85-signature-icon { width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; font-weight: 900; }
      .phase12a85-signature-card.signed { border-color: #86efac; background: #f0fdf4; }
      .phase12a85-signature-card.signed h4, .phase12a85-signature-card.signed .phase12a85-signature-icon { color: #166534; }
      .phase12a85-signature-card.signed .phase12a85-signature-icon { background: #dcfce7; }
      .phase12a85-signature-card.unsigned { border-color: #fed7aa; background: #fff7ed; }
      .phase12a85-signature-card.unsigned h4, .phase12a85-signature-card.unsigned .phase12a85-signature-icon { color: #c2410c; }
      .phase12a85-signature-card.unsigned .phase12a85-signature-icon { background: #ffedd5; }
      .phase12a85-signature-card.warning { border-color: #fde68a; background: #fffbeb; }
      .phase12a85-signature-card.warning h4, .phase12a85-signature-card.warning .phase12a85-signature-icon { color: #a16207; }
      .phase12a85-signature-card.warning .phase12a85-signature-icon { background: #fef3c7; }
      @media(max-width:900px){ .phase12a85-edit-page .page-header, .phase12a85-response-style-form { max-width: 100%; } .phase12a85-signature-card { flex-direction: column; } }

      .phase12a87-hide-form-notes, .phase12a88-hide-follow-up { display: none !important; }
      .phase12a87-note-box { min-width: 220px; max-width: 360px; }
      .phase12a87-note-list { display: grid; gap: 8px; margin-bottom: 8px; }
      .phase12a87-note-item { border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; padding: 8px 9px; }
      .phase12a87-note-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 5px; }
      .phase12a87-note-badge { border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 900; white-space: nowrap; }
      .phase12a87-note-badge.client { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
      .phase12a87-note-badge.internal { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
      .phase12a87-note-meta { color: #64748b; font-size: 11px; }
      .phase12a87-note-text { color: #334155; font-size: 12px; line-height: 1.35; white-space: normal; }
      .phase12a87-empty-note { color: #64748b; font-size: 12px; font-style: italic; margin: 0 0 8px; }
      .phase12a87-empty-note.danger { color: #b91c1c; font-style: normal; }
      .phase12a87-note-edit { border: 1px solid #2563eb; background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 900; cursor: pointer; }
      .phase12a87-existing-notes { max-height: 240px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 10px; margin: 12px 0; }
      .phase12a87-field { display: block; margin: 12px 0; }
      .phase12a87-field span { display: block; font-size: 12px; font-weight: 900; color: #475569; margin: 0 0 5px; }
      .phase12a87-field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase12a87-visibility-box { display: flex; flex-wrap: wrap; gap: 14px; padding: 10px 0; }
      .phase12a87-visibility-box label { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-weight: 800; color: #334155; }
      .phase12a87-visibility-box input { width: auto; }

      .phase6-panel { margin-bottom: 16px; padding: 16px; border-left: 5px solid #16a34a; }
      .phase6-panel h2 { margin: 0 0 8px; }
      .phase6-panel-actions { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 10px; }
      .phase6-panel-actions button { border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 900; background: #f59e0b; color: #111827; cursor: pointer; }
      .phase6-link-group { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
      .phase6-link-button { border: 1px solid #16a34a; background: #f0fdf4; color: #166534; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; cursor: pointer; white-space: nowrap; }
      .phase6-link-button.applicant { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
      .phase6-link-button.fax { border-color: #7c3aed; background: #f5f3ff; color: #5b21b6; }
      .phase12a78-field { display: block; margin: 12px 0; }
      .phase12a78-field span { display: block; font-size: 12px; font-weight: 900; color: #475569; margin: 0 0 5px; }
      .phase12a78-field input, .phase12a78-field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase12a78-secondary { background: #64748b !important; }
      .phase12a78-fax-card [data-phase12a78-send]:disabled { opacity: .6; cursor: wait; }
      .phase12a79-template-form { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; margin-top: 14px; }
      .phase12a79-template-form label, .phase12a79-template-row label { display: block; margin: 0; }
      .phase12a79-template-form label span, .phase12a79-template-row label span { display: block; font-size: 12px; font-weight: 900; color: #475569; margin: 0 0 5px; }
      .phase12a79-template-form input, .phase12a79-template-form textarea, .phase12a79-template-row input, .phase12a79-template-row textarea, .phase12a79-template-row select { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase12a79-template-form .wide { grid-column: 1 / -1; }
      .phase12a79-template-form button, .phase12a79-row-actions button { border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 900; background: #111827; color: #fff; cursor: pointer; }
      .phase12a79-template-list { margin-top: 16px; display: grid; gap: 12px; }
      .phase12a79-template-row { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }
      .phase12a79-row-grid { display: grid; grid-template-columns: 1fr 1.5fr 130px; gap: 12px; }
      .phase12a79-body-label { margin-top: 12px !important; }
      .phase12a79-row-actions { margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px; }
      .phase12a79-row-actions .danger { background: #dc2626; }
      .phase12a79-fax-card select, .phase12a92-client-card select { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .phase12a92-client-card [data-phase12a92-open-gmail] { background: #ea4335 !important; }
      .phase12a92-client-card [data-phase12a92-copy] { background: #2563eb !important; }

      .phase12a80-email-nav svg { flex: 0 0 auto; }
      .phase12a80-email-page-header p { margin: 6px 0 0; color: #6b7280; }
      .phase12a80-email-settings-page { padding: 22px; }
      @media(max-width:900px){ .phase12a79-template-form, .phase12a79-row-grid { grid-template-columns: 1fr; } }
      .phase6-link-button:hover { filter: brightness(.97); }
      .phase6-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10004; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 520px; }
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
      .phase6-modal-actions button { border: 0; border-radius: 12px; padding: 10px 14px; font-weight: 900; background: #111827; color: #fff; cursor: pointer; }
      [data-phase6-open-gmail] { background: #ea4335 !important; }
      [data-phase6-open-form] { background: #16a34a !important; }
      .phase6-note { margin: 12px 0 0; color: #64748b; font-size: 13px; }
      .status-chip.consent-needed { background: #fff7ed !important; color: #c2410c !important; }
      .status-chip.consent-given { background: #ecfdf5 !important; color: #047857 !important; }
      .phase12a87-note-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .phase12a87-delete-note { margin-left: auto; border: 1px solid #fecaca; background: #fee2e2; color: #991b1b; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 900; cursor: pointer; }
      .phase12a87-delete-note:hover { background: #fecaca; }
      .phase12a89-links-cell { min-width: 230px; }
      .phase12a89-links-layout { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .phase12a89-links-main { display: grid; gap: 7px; align-content: start; }
      .phase12a89-link-color-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .phase12a89-link-color-group button, .phase12a89-link-color-group a { margin: 0 !important; }
      .phase12a89-link-tools { display: flex; gap: 8px; align-items: flex-start; margin-left: auto; }
      .phase12a89-link-tools:empty { display: none; }
      .phase12a93-debug { margin-top: 14px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 14px; padding: 12px; }
      .phase12a93-debug-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
      .phase12a93-debug-head h3 { margin: 0; font-size: 15px; color: #1e3a8a; }
      .phase12a93-debug-head button { border: 1px solid #93c5fd; border-radius: 999px; background: #dbeafe; color: #1d4ed8; padding: 6px 10px; font-size: 12px; font-weight: 900; cursor: pointer; }
      .phase12a93-debug pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: #1e293b; font-size: 12px; line-height: 1.55; }
      th[data-phase6-sortable] { cursor: pointer; user-select: none; }
      th[data-phase6-sortable]:hover { background: #eef2ff; color: #111827; }
      .phase6-sort-head { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
      .phase6-sort-arrow { color: #2563eb; font-size: 12px; font-weight: 900; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const otherNav = event.target && event.target.closest && event.target.closest('.sidebar .nav-btn:not([data-phase12a80-email-settings-nav])');
    if (otherNav) {
      phase12a80EmailSettingsActive = false;
      setEmailSettingsNavActive(false);
    }
  }, true);

  document.addEventListener('click', function (event) {
    const phase12a92ClientButton = event.target && event.target.closest ? event.target.closest('[data-phase7-action="client-gmail"], button, a') : null;
    if (isSafetyPage() && phase12a92ClientButton && isClientGmailButton(phase12a92ClientButton)) {
      const row = phase12a92ClientButton.closest('tr');
      if (row) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        showClientGmailModal(row).catch((error) => toast(error.message || 'Could not prepare Client Gmail template.', true));
        return;
      }
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a92-close]')) {
      event.preventDefault();
      event.stopPropagation();
      closeClientGmailModal();
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a92-copy]')) {
      event.preventDefault();
      event.stopPropagation();
      const draft = clientGmailDraftFromModal();
      copyText(draft.full, 'Client email draft copied.');
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a92-open-gmail]')) {
      event.preventDefault();
      event.stopPropagation();
      openClientGmailFromModal().catch((error) => toast(error.message || 'Could not open Gmail.', true));
      return;
    }

    if (event.target && event.target.closest && event.target.closest('[data-phase6-close]')) closeModal();

    if (event.target && event.target.closest && event.target.closest('[data-phase12a78-close]')) closeFaxModal();
    if (event.target && event.target.closest && event.target.closest('[data-phase12a78-send]')) {
      event.preventDefault();
      event.stopPropagation();
      sendFaxFromModal();
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a93-copy-debug]')) {
      event.preventDefault();
      event.stopPropagation();
      copyFaxDebug();
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a79-add-template]')) {
      event.preventDefault();
      event.stopPropagation();
      addEmailTemplate().catch((error) => toast(error.message || 'Could not create template.', true));
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a79-save-template]')) {
      event.preventDefault();
      event.stopPropagation();
      saveEmailTemplate(event.target.closest('[data-phase12a79-save-template]')).catch((error) => toast(error.message || 'Could not save template.', true));
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a79-delete-template]')) {
      event.preventDefault();
      event.stopPropagation();
      deleteEmailTemplate(event.target.closest('[data-phase12a79-delete-template]')).catch((error) => toast(error.message || 'Could not delete template.', true));
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a87-open-notes]')) {
      event.preventDefault();
      event.stopPropagation();
      const row = event.target.closest('tr');
      if (row) phase12a87ShowNotesModal(row);
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a87-close]')) {
      event.preventDefault();
      event.stopPropagation();
      phase12a87CloseNotesModal();
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a87-delete-note]')) {
      event.preventDefault();
      event.stopPropagation();
      phase12a87DeleteNoteFromModal(event.target.closest('[data-phase12a87-delete-note]'));
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase12a87-save-note]')) {
      event.preventDefault();
      event.stopPropagation();
      phase12a87SaveNoteFromModal();
      return;
    }

    const modal = getModal();
    const link = modal.__link;
    const data = modal.__data || {};
    const responseRole = modal.__responseRole || 'employer';
    const draft = link ? buildRequestDraft(link, data, responseRole) : null;

    if (event.target && event.target.closest && event.target.closest('[data-phase6-copy-link]')) {
      if (link) copyText(link, 'Response link copied.');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-copy-draft]')) {
      if (draft) copyText(draft.full, responseRole === 'applicant' ? 'Applicant verification email draft copied.' : 'Employer form email draft copied.');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-open-form]')) {
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    }
    if (event.target && event.target.closest && event.target.closest('[data-phase6-open-gmail]')) {
      if (!draft) return;
      copyText(draft.full, responseRole === 'applicant' ? 'Applicant verification email draft copied.' : 'Employer form email draft copied.');
      window.open(draft.gmailUrl, '_blank', 'noopener,noreferrer');
    }
  });



  document.addEventListener('change', function (event) {
    if (event.target && event.target.matches && event.target.matches('[data-phase12a79-template-select]')) {
      applyFaxTemplate(getFaxModal());
    }
    if (event.target && event.target.matches && event.target.matches('[data-phase12a92-template-select]')) {
      applyClientGmailTemplate(getClientGmailModal());
    }
  });


  function findMonitoringHeaderActions() {
    if (!isMonitoringPage()) return null;
    return document.querySelector('.page-header .header-actions') || document.querySelector('.page-header') || null;
  }

  async function runMonitoringDataSync(button) {
    const oldLabel = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Syncing...';
    }

    try {
      toast('Running Monitoring Data Sync from TazWorks...');
      const result = await apiWithFallback('tazworks-sync/run', {
        method: 'POST',
        body: JSON.stringify({
          companyId: getCompanyId(),
          maxPages: 25,
          pageSize: 25,
          source: 'monitoring-page-data-sync'
        })
      });

      const message = result.message || 'Monitoring Data Sync complete.';
      const details = ` Pulled ${result.ordersPulled || 0} order(s). Updated/created ${result.applicantsUpserted || 0} monitoring record(s). Med dates updated: ${result.medExpireUpdated || 0}. Errors: ${result.errorsCount || 0}.`;
      toast(message + details, Number(result.errorsCount || 0) > 0);
      setTimeout(() => window.location.reload(), 1600);
    } catch (error) {
      toast((error && error.message) || 'Monitoring Data Sync failed.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel || 'Data Sync';
      }
    }
  }

  function hookMonitoringHeaderButtons() {
    if (!isMonitoringPage()) return;
    const actions = findMonitoringHeaderActions();
    if (!actions) return;

    const refreshButton = Array.from(actions.querySelectorAll('button')).find((button) => /^refresh$/i.test(text(button)) || /^page refresh$/i.test(text(button)));
    if (refreshButton && !refreshButton.dataset.phase12a97PageRefreshHooked) {
      refreshButton.dataset.phase12a97PageRefreshHooked = '1';
      refreshButton.textContent = 'Page Refresh';
      refreshButton.title = 'Reload this page from the current Supabase data.';
      refreshButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        window.location.reload();
      }, true);
    }

    let dataSync = actions.querySelector('[data-phase12a97-data-sync]');
    if (!dataSync) {
      dataSync = document.createElement('button');
      dataSync.type = 'button';
      dataSync.className = 'primary-inline phase12a97-data-sync';
      dataSync.dataset.phase12a97DataSync = '1';
      dataSync.textContent = 'Data Sync';
      dataSync.title = 'Pull latest Monitoring/applicant reports from TazWorks and update Supabase.';
      actions.appendChild(dataSync);
    }

    if (!dataSync.dataset.phase12a97Hooked) {
      dataSync.dataset.phase12a97Hooked = '1';
      dataSync.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        runMonitoringDataSync(dataSync);
      });
    }
  }



  let phase12a99SidebarReloadObserverStarted = false;

  function removeSidebarReloadMonitoringButton() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    Array.from(sidebar.querySelectorAll('button, a, .nav-btn, li, div')).forEach((el) => {
      if (!el || !el.isConnected) return;
      const label = text(el).replace(/\s+/g, ' ').trim();
      if (/^reload monitoring$/i.test(label)) {
        const wrapper = el.closest('li') || el.closest('button') || el.closest('a') || el;
        wrapper.remove();
      }
    });
  }

  function startSidebarReloadMonitoringCleanup() {
    removeSidebarReloadMonitoringButton();
    if (phase12a99SidebarReloadObserverStarted) return;
    phase12a99SidebarReloadObserverStarted = true;

    const run = () => {
      try { removeSidebarReloadMonitoringButton(); } catch (_) {}
    };

    // Older phase scripts can re-add this sidebar action after React renders.
    // Watch the sidebar/document and remove it immediately so it does not blink.
    const observer = new MutationObserver(run);
    const observeTarget = document.body || document.documentElement;
    if (observeTarget) observer.observe(observeTarget, { childList: true, subtree: true, characterData: true });

    // Also sweep quickly during first load while the sidebar scripts finish mounting.
    let sweeps = 0;
    const fastSweep = setInterval(() => {
      run();
      sweeps += 1;
      if (sweeps >= 80) clearInterval(fastSweep);
    }, 75);
  }

  function refresh() {
    addStyles();
    startSidebarReloadMonitoringCleanup();
    ensureEmailSettingsNav();
    removeEmbeddedEmailSettingsCard();
    if (phase12a80EmailSettingsActive) {
      setEmailSettingsNavActive(true);
      if (!document.getElementById('phase12a79-email-settings')) renderEmailSettingsPage();
      return;
    }
    if (isSafetyEditPage()) {
      enhanceSafetyEditPage();
      return;
    }
    document.body.classList.remove('phase12a85-edit-page');
    if (isMonitoringPage()) {
      hookMonitoringHeaderButtons();
      return;
    }
    if (!isSafetyPage()) return;
    startLegacyButtonObserver();
    addPanel();
    removeLegacySafetyButtons();
    phase12a88RemoveFollowUpColumn();
    phase12a90CollapseDuplicateLinksColumns();
    addButtons();
    phase12a90CollapseDuplicateLinksColumns();
    phase12a89NormalizeLinksColumn();
    phase12a87EnhanceNotes();
    removeLegacySafetyButtons();
    phase12a90CollapseDuplicateLinksColumns();
    phase12a89NormalizeLinksColumn();
    ensureSafetyStatusOptions();
    makeSafetyTablesSortable();
    hookSafetyRefreshButton();
  }

  setInterval(refresh, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
