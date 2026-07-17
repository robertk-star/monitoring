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
      actions: find(['actions', 'response'])
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

  function makeSafetyTablesSortable() {
    safetyTables().forEach((table) => {
      const idx = indexes(table);
      const sortable = [
        ['file', idx.file],
        ['applicant', idx.applicant],
        ['created', idx.created],
        ['status', idx.status],
        ['followUp', idx.followUp],
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
          <button type="button" data-phase12a78-send>Send Fax</button>
        </div>
        <p class="phase6-note">This sends the completed FMCSA PDF to eFax by email. eFax will handle the actual fax delivery and confirmation.</p>
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
    modal.querySelector('[data-phase12a79-subject]').value = defaultFaxSubject(data);
    modal.querySelector('[data-phase12a78-cover-message]').value = defaultFaxCoverMessage(data);
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

  async function sendFaxFromModal() {
    const modal = getFaxModal();
    const data = modal.__data || {};
    const faxNumber = normalizeFax(modal.querySelector('[data-phase12a78-fax-number]')?.value || '');
    const recipientName = String(modal.querySelector('[data-phase12a78-recipient-name]')?.value || '').trim();
    const templateId = Number(modal.querySelector('[data-phase12a79-template-select]')?.value || 0) || null;
    const subject = String(modal.querySelector('[data-phase12a79-subject]')?.value || '').trim();
    const coverMessage = String(modal.querySelector('[data-phase12a78-cover-message]')?.value || '').trim();
    const sendButton = modal.querySelector('[data-phase12a78-send]');

    if (!data.fileNumber) return toast('Could not find the file number for this report.', true);
    if (faxNumber.length < 7) return toast('Enter a valid recipient fax number.', true);

    const confirmed = window.confirm(`Send the FMCSA report for file #${data.fileNumber} to fax number ${faxNumber}?`);
    if (!confirmed) return;

    const originalText = sendButton ? sendButton.textContent : '';
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = 'Sending...';
    }

    try {
      const result = await apiWithFallback('safety-reports/fax-fmcsa', {
        method: 'POST',
        body: JSON.stringify({
          companyId: getCompanyId(),
          fileNumber: data.fileNumber,
          faxNumber,
          recipientName,
          templateId,
          subject,
          coverMessage
        })
      });
      toast(result.message || 'Fax sent to eFax.');
      closeFaxModal();
    } catch (error) {
      toast(error.message || 'Could not send fax.', true);
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = originalText || 'Send Fax';
      }
    }
  }
  // PHASE12A78_EFAX_FAX_MODAL END

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

  function addButtons() {
    safetyTables().forEach((table) => {
      const actionIndex = ensureActionColumn(table);
      Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
        const cells = Array.from(row.children);
        const actionCell = cells[actionIndex] || cells[cells.length - 1];
        if (!actionCell || actionCell.querySelector('.phase6-link-group')) return;

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

  function addStyles() {
    if (document.getElementById('phase6-style')) return;
    const style = document.createElement('style');
    style.id = 'phase6-style';
    style.textContent = `
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
      .phase12a79-fax-card select { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font: inherit; }

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
    if (event.target && event.target.closest && event.target.closest('[data-phase6-close]')) closeModal();

    if (event.target && event.target.closest && event.target.closest('[data-phase12a78-close]')) closeFaxModal();
    if (event.target && event.target.closest && event.target.closest('[data-phase12a78-send]')) {
      event.preventDefault();
      event.stopPropagation();
      sendFaxFromModal();
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
  });

  function refresh() {
    addStyles();
    ensureEmailSettingsNav();
    removeEmbeddedEmailSettingsCard();
    if (phase12a80EmailSettingsActive) {
      setEmailSettingsNavActive(true);
      if (!document.getElementById('phase12a79-email-settings')) renderEmailSettingsPage();
      return;
    }
    if (!isSafetyPage()) return;
    addPanel();
    addButtons();
    makeSafetyTablesSortable();
    hookSafetyRefreshButton();
  }

  setInterval(refresh, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
