(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function isSettingsPage() { return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings'); }
  function getCompanyId() {
    const select = document.querySelector('.company-switcher select');
    return select && select.value ? select.value : '1';
  }
  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, { headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {}) }));
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
    return data;
  }
  function toast(message, danger) {
    let box = document.getElementById('phase10-toast');
    if (!box) { box = document.createElement('div'); box.id = 'phase10-toast'; document.body.appendChild(box); }
    box.className = danger ? 'phase10-toast danger' : 'phase10-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }
  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
  }
  function renderResults(results) {
    const tbody = document.querySelector('#phase10-import-table tbody');
    if (!tbody) return;
    const rows = Array.isArray(results) ? results : [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="phase10-empty">No import results yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.fileName || '')}</td>
        <td><span class="phase10-status ${escapeHtml(row.status || '')}">${escapeHtml(row.status || '')}</span></td>
        <td>${escapeHtml(row.fileNumber || '')}</td>
        <td>${escapeHtml(row.applicantName || '')}</td>
        <td>${escapeHtml(row.orderDate || '')}</td>
        <td>${escapeHtml(row.medExpire || '')}</td>
        <td>${escapeHtml(row.message || '')}</td>
      </tr>
    `).join('');
  }
  async function importPdfs() {
    const input = document.getElementById('phase10-files');
    const files = Array.from(input && input.files ? input.files : []);
    if (!files.length) return toast('Choose one or more PDF files first.', true);
    const payloadFiles = [];
    for (const file of files) {
      if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast(`${file.name} skipped. Only PDF files are supported.`, true); continue; }
      if (file.size > 6 * 1024 * 1024) { toast(`${file.name} skipped. File is larger than 6MB.`, true); continue; }
      payloadFiles.push({ fileName: file.name, mimeType: file.type || 'application/pdf', base64: await readFileAsBase64(file) });
    }
    if (!payloadFiles.length) return;

    const button = document.getElementById('phase10-import');
    button.disabled = true;
    button.textContent = 'Scanning PDFs...';

    try {
      const data = await api('/api/pdf-medical', { method: 'POST', body: JSON.stringify({ companyId: getCompanyId(), files: payloadFiles }) });
      renderResults(data.results || []);
      input.value = '';
      const s = data.summary || {};
      toast(`PDF import complete. Created ${s.created || 0}. Updated ${s.updated || 0}. Skipped ${s.skipped || 0}. Errors ${s.errors || 0}. Go to Monitoring and click Refresh.`);
    } catch (error) {
      toast(error.message || 'PDF import failed.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Scan PDFs into Applicant Database';
    }
  }
  function panelHtml() {
    return `
      <h2>PDF Import to Applicant Database</h2>
      <p class="muted">Admin only. Upload TazWorks PDFs here. The app scans each PDF immediately and creates/updates records in the applicant database. PDFs are not saved in a separate PDF table.</p>
      <div class="phase10-warning">
        TazWorks filenames like <b>report_6340.pdf</b> are supported. The app pulls the file number from the filename and applicant name from the <b>APPLICANT</b> line in the PDF.
      </div>
      <div class="phase10-actions">
        <input id="phase10-files" type="file" accept="application/pdf,.pdf" multiple />
        <button id="phase10-import" class="primary-inline" type="button">Scan PDFs into Applicant Database</button>
      </div>
      <p class="phase10-note">Records are created for each PDF with a file number. Med Expire is filled only when the Medical Certificate Expiration Date is found.</p>
      <div class="phase10-table-wrap">
        <table id="phase10-import-table">
          <thead>
            <tr><th>PDF</th><th>Status</th><th>File #</th><th>Name</th><th>Order Date</th><th>Med Expire</th><th>Message</th></tr>
          </thead>
          <tbody><tr><td colspan="7" class="phase10-empty">No import results yet.</td></tr></tbody>
        </table>
      </div>
    `;
  }
  function ensurePanel() {
    if (!isSettingsPage() || document.getElementById('phase10-panel')) return;
    const oldPanels = Array.from(document.querySelectorAll('section')).filter((section) => text(section).includes('Medical PDF Upload & Scan'));
    oldPanels.forEach((section) => section.remove());

    const anchor = Array.from(document.querySelectorAll('section.card')).find((section) => text(section).includes('Import Monitoring CSV'));
    const panel = document.createElement('section');
    panel.id = 'phase10-panel';
    panel.className = 'card wide-card settings-card phase10-panel';
    panel.innerHTML = panelHtml();
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else document.querySelector('.main-panel').appendChild(panel);
    document.getElementById('phase10-import').addEventListener('click', importPdfs);
  }
  function addStyles() {
    if (document.getElementById('phase10-style')) return;
    const style = document.createElement('style');
    style.id = 'phase10-style';
    style.textContent = `
      .phase10-panel { border-left: 5px solid #10b981; }
      .phase10-warning { background: #ecfdf5; border: 1px solid #bbf7d0; color: #166534; border-radius: 12px; padding: 10px 12px; margin: 10px 0 14px; }
      .phase10-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
      .phase10-actions input[type=file] { width: min(520px, 100%); }
      .phase10-note { color: #64748b; font-size: 13px; margin: 0 0 14px; }
      .phase10-table-wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 14px; }
      #phase10-import-table { width: 100%; border-collapse: collapse; }
      #phase10-import-table th, #phase10-import-table td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
      #phase10-import-table th { background: #f8fafc; text-transform: uppercase; font-size: 12px; color: #475569; }
      .phase10-empty { text-align: center; color: #64748b; padding: 28px !important; }
      .phase10-status.created { background:#dcfce7; color:#166534; padding:3px 7px; border-radius:999px; font-weight:800; }
      .phase10-status.updated { background:#dbeafe; color:#1d4ed8; padding:3px 7px; border-radius:999px; font-weight:800; }
      .phase10-status.skipped, .phase10-status.error, .phase10-status.no_text { background:#fee2e2; color:#991b1b; padding:3px 7px; border-radius:999px; font-weight:800; }
      .phase10-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10020; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 520px; }
      .phase10-toast.danger { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }
  function refresh() { addStyles(); ensurePanel(); }
  setInterval(refresh, 1400);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
