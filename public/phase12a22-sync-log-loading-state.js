(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isSettingsPage() {
    return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings');
  }

  function getSyncTableBody() {
    return document.querySelector('#phase12a-runs tbody');
  }

  function setLoadingState(message) {
    const body = getSyncTableBody();
    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="phase12a22-loading-cell">
            <span class="phase12a22-spinner"></span>
            ${message || 'Refreshing sync log...'}
          </td>
        </tr>
      `;
    }

    const summary = document.getElementById('phase12a-summary');
    if (summary) {
      summary.innerHTML = `
        <h3>Latest raw sync summary</h3>
        <div class="phase12a22-summary-loading">
          <span class="phase12a22-spinner"></span>
          Loading latest sync summary...
        </div>
      `;
    }
  }

  function showNoDataState() {
    const body = getSyncTableBody();
    if (body) {
      body.innerHTML = '<tr><td colspan="8" class="phase12a-empty">No sync runs found.</td></tr>';
    }
  }

  function safeDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function api(path) {
    const response = await fetch('/api/index?path=' + encodeURIComponent(path), {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}

    if (!response.ok) throw new Error(data.message || raw || 'Request failed.');
    return data;
  }

  function renderSummary(summary) {
    const box = document.getElementById('phase12a-summary');
    if (!box) return;

    box.innerHTML = `
      <h3>Latest raw sync summary</h3>
      <pre>${escapeHtml(JSON.stringify(summary || {}, null, 2).slice(0, 14000))}</pre>
    `;
  }

  function renderRows(runs) {
    const body = getSyncTableBody();
    if (!body) return;

    if (!runs || !runs.length) {
      showNoDataState();
      return;
    }

    body.innerHTML = runs.map((run) => `
      <tr>
        <td>${escapeHtml(safeDate(run.started_at || run.startedAt))}</td>
        <td>${escapeHtml(run.status || '')}</td>
        <td>${escapeHtml(run.orders_pulled ?? run.ordersPulled ?? 0)}</td>
        <td>${escapeHtml(run.applicants_upserted ?? run.applicantsUpserted ?? 0)}</td>
        <td>${escapeHtml((run.raw_summary && run.raw_summary.medExpireUpdated) || 0)}</td>
        <td>${escapeHtml(run.errors_count ?? run.errorsCount ?? 0)}</td>
        <td>${escapeHtml(run.message || '')}</td>
        <td><button type="button" data-phase12a22-summary='${escapeHtml(JSON.stringify(run.raw_summary || {}))}'>Summary</button></td>
      </tr>
    `).join('');
  }

  function toast(message, danger) {
    let box = document.getElementById('phase12a22-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase12a22-toast';
      document.body.appendChild(box);
    }

    box.className = danger ? 'phase12a22-toast danger' : 'phase12a22-toast';
    box.textContent = message;

    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.remove(), 4200);
  }

  async function forceRefreshSyncLog(button) {
    if (!isSettingsPage()) return;

    const originalText = button ? button.textContent : '';

    if (button) {
      button.disabled = true;
      button.textContent = 'Refreshing...';
    }

    setLoadingState('Refreshing sync log...');

    try {
      const data = await api('tazworks-sync/runs');
      renderRows(data.runs || []);

      if (data.runs && data.runs[0]) {
        renderSummary(data.runs[0].raw_summary || {});
      } else {
        renderSummary({});
      }

      toast('Sync log refreshed.');
    } catch (error) {
      showNoDataState();
      const summary = document.getElementById('phase12a-summary');
      if (summary) {
        summary.innerHTML = `
          <h3>Latest raw sync summary</h3>
          <div class="phase12a22-error">${escapeHtml(error.message || 'Could not refresh sync log.')}</div>
        `;
      }
      toast(error.message || 'Could not refresh sync log.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || 'Refresh Sync Log';
      }
    }
  }

  function bindButtons() {
    Array.from(document.querySelectorAll('button')).forEach((button) => {
      const label = text(button);

      if ((button.id === 'phase12a-refresh-runs' || label === 'Refresh Sync Log') && !button.dataset.phase12a22Bound) {
        button.dataset.phase12a22Bound = '1';

        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopImmediatePropagation();
          event.stopPropagation();
          forceRefreshSyncLog(button);
        }, true);
      }
    });
  }

  document.addEventListener('click', function (event) {
    const summaryButton = event.target && event.target.closest
      ? event.target.closest('[data-phase12a22-summary]')
      : null;

    if (!summaryButton) return;

    try {
      renderSummary(JSON.parse(summaryButton.dataset.phase12a22Summary || '{}'));
    } catch {
      renderSummary({});
    }
  }, true);

  function addStyles() {
    if (document.getElementById('phase12a22-style')) return;

    const style = document.createElement('style');
    style.id = 'phase12a22-style';
    style.textContent = `
      .phase12a22-loading-cell {
        text-align: center;
        padding: 26px !important;
        color: #166534;
        font-weight: 900;
        background: #ecfdf5;
      }

      .phase12a22-summary-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #bbf7d0;
        background: #ecfdf5;
        color: #166534;
        border-radius: 12px;
        padding: 14px;
        font-weight: 900;
      }

      .phase12a22-error {
        border: 1px solid #fecaca;
        background: #fef2f2;
        color: #991b1b;
        border-radius: 12px;
        padding: 14px;
        font-weight: 900;
      }

      .phase12a22-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 3px solid rgba(22, 101, 52, .25);
        border-top-color: #16a34a;
        border-radius: 50%;
        animation: phase12a22-spin .75s linear infinite;
        vertical-align: middle;
      }

      .phase12a22-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10060;
        background: #111827;
        color: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 18px 45px rgba(15,23,42,.25);
        font-size: 14px;
        max-width: 460px;
      }

      .phase12a22-toast.danger {
        background: #991b1b;
      }

      @keyframes phase12a22-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    addStyles();
    bindButtons();
    setInterval(bindButtons, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
