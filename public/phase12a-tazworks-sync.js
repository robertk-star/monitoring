(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function isSettingsPage() { return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings'); }

  function api(path, options) {
    return fetch('/api/index?path=' + encodeURIComponent(path), Object.assign({ credentials: 'include' }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    })).then(async (response) => {
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      if (!response.ok) throw new Error(data.message || 'TazWorks sync failed.');
      return data;
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function safeDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function toast(message, danger) {
    let box = document.getElementById('phase12a-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase12a-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase12a-toast danger' : 'phase12a-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }

  function renderRuns(runs) {
    const body = document.querySelector('#phase12a-runs tbody');
    if (!body) return;
    if (!runs || !runs.length) {
      body.innerHTML = '<tr><td colspan="7" class="phase12a-empty">No sync runs yet.</td></tr>';
      return;
    }
    body.innerHTML = runs.map((run) => `
      <tr>
        <td>${escapeHtml(safeDate(run.started_at || run.startedAt))}</td>
        <td>${escapeHtml(run.status || '')}</td>
        <td>${escapeHtml(run.orders_pulled ?? run.ordersPulled ?? 0)}</td>
        <td>${escapeHtml(run.applicants_upserted ?? run.applicantsUpserted ?? 0)}</td>
        <td>${escapeHtml(run.safety_reports_updated ?? run.safetyReportsUpdated ?? 0)}</td>
        <td>${escapeHtml(run.errors_count ?? run.errorsCount ?? 0)}</td>
        <td>${escapeHtml(run.message || '')}</td>
      </tr>`).join('');
  }

  async function loadRuns() {
    try {
      const data = await api('tazworks-sync/runs');
      renderRuns(data.runs || []);
    } catch (error) {
      renderRuns([]);
      toast(error.message || 'Could not load sync runs.', true);
    }
  }

  async function runSync() {
    const button = document.getElementById('phase12a-run-sync');
    if (button) { button.disabled = true; button.textContent = 'Running Sync...'; }
    try {
      const data = await api('tazworks-sync/run', { method: 'POST', body: JSON.stringify({ manual: true }) });
      toast(`Sync complete. Pulled ${data.ordersPulled || 0} orders.`);
      await loadRuns();
    } catch (error) {
      toast(error.message || 'TazWorks sync failed.', true);
      await loadRuns();
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Run TazWorks Sync Now'; }
    }
  }

  function ensurePanel() {
    if (!isSettingsPage() || document.getElementById('phase12a-panel')) return;
    const anchor = Array.from(document.querySelectorAll('section.card')).find((section) => text(section).includes('System Check'));
    const panel = document.createElement('section');
    panel.id = 'phase12a-panel';
    panel.className = 'card wide-card settings-card phase12a-panel';
    panel.innerHTML = `
      <h2>TazWorks Manual Sync</h2>
      <p class="muted">Pulls recent read-only TazWorks orders through the SaffHire fixed-IP proxy and updates Monitoring records. Safety Performance reports are matched by file number when an existing report is found.</p>
      <div class="phase12a-warning">Server-side only. Browser does not call TazWorks or the proxy directly. Client GUID and proxy secret stay in Vercel ENV.</div>
      <div class="phase12a-actions">
        <button id="phase12a-run-sync" type="button" class="primary-inline">Run TazWorks Sync Now</button>
        <button id="phase12a-refresh-runs" type="button">Refresh Sync Log</button>
      </div>
      <div class="phase12a-table-wrap">
        <table id="phase12a-runs">
          <thead><tr><th>Started</th><th>Status</th><th>Orders</th><th>Monitoring</th><th>Safety</th><th>Errors</th><th>Message</th></tr></thead>
          <tbody><tr><td colspan="7" class="phase12a-empty">Loading sync runs...</td></tr></tbody>
        </table>
      </div>`;
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else document.querySelector('.main-panel')?.appendChild(panel);
    document.getElementById('phase12a-run-sync')?.addEventListener('click', runSync);
    document.getElementById('phase12a-refresh-runs')?.addEventListener('click', loadRuns);
    loadRuns();
  }

  function addStyles() {
    if (document.getElementById('phase12a-style')) return;
    const style = document.createElement('style');
    style.id = 'phase12a-style';
    style.textContent = `
      .phase12a-panel { border-left: 5px solid #16a34a; }
      .phase12a-warning { background: #ecfdf5; border: 1px solid #bbf7d0; color: #166534; border-radius: 12px; padding: 10px 12px; margin: 10px 0 14px; font-weight: 700; }
      .phase12a-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
      .phase12a-actions button { border: 1px solid #16a34a; background: #f0fdf4; color: #166534; border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 900; }
      .phase12a-actions button:disabled { opacity: .65; cursor: wait; }
      .phase12a-table-wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 14px; }
      #phase12a-runs { width: 100%; border-collapse: collapse; }
      #phase12a-runs th, #phase12a-runs td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
      #phase12a-runs th { background: #f8fafc; text-transform: uppercase; font-size: 12px; color: #475569; }
      .phase12a-empty { text-align: center; color: #64748b; padding: 22px !important; }
      .phase12a-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10030; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 460px; }
      .phase12a-toast.danger { background: #991b1b; }`;
    document.head.appendChild(style);
  }

  function refresh() { addStyles(); ensurePanel(); }
  setInterval(refresh, 1200);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
