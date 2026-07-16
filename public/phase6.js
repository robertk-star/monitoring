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

  function getCompanyId() {
    const select = document.querySelector('.company-switcher select');
    return select && select.value ? select.value : '1';
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
            const currentKey = table.dataset.phase6SortKey || '';
            const currentDirection = table.dataset.phase6SortDirection || 'asc';
            const nextDirection = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
            table.dataset.phase6SortKey = key;
            table.dataset.phase6SortDirection = nextDirection;
            applySafetySort(table, key, nextDirection);
            Array.from(table.querySelectorAll('thead th[data-phase6-sortable]')).forEach((header) => {
              setSortHeaderLabel(header, header.dataset.phase6Sortable === key, nextDirection);
            });
          });
        }
        setSortHeaderLabel(th, table.dataset.phase6SortKey === key, table.dataset.phase6SortDirection || 'asc');
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
    const consolidated = '/api/index?path=' + encodeURIComponent(path);
    try {
      return await api(consolidated, options);
    } catch (firstError) {
      if (path === 'safety-response-link') {
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

        const liveButton = document.createElement('button');
        liveButton.type = 'button';
        liveButton.className = 'phase6-link-button live';
        liveButton.textContent = 'Pull Live Info';
        liveButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          pullLiveSafety(row).catch((error) => toast(error.message || 'Could not pull live Safety Performance information.', true));
        });

        group.appendChild(applicantButton);
        group.appendChild(employerButton);
        group.appendChild(liveButton);
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
    `;
    if (after) after.insertAdjacentElement('afterend', panel);
  }


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
      .phase6-link-button.live { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
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
    if (event.target && event.target.closest && event.target.closest('[data-phase6-close]')) closeModal();

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

  function refresh() {
    if (!isSafetyPage()) return;
    addStyles();
    addPanel();
    addButtons();
    makeSafetyTablesSortable();
    hookSafetyRefreshButton();
  }

  setInterval(refresh, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
