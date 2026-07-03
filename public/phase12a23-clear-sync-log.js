(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isSettingsPage() {
    return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toast(message, danger) {
    let box = document.getElementById('phase12a23-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase12a23-toast';
      document.body.appendChild(box);
    }

    box.className = danger ? 'phase12a23-toast danger' : 'phase12a23-toast';
    box.textContent = message;

    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.remove(), 4800);
  }

  async function api(path, options) {
    const response = await fetch('/api/index?path=' + encodeURIComponent(path), Object.assign({
      credentials: 'include'
    }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    }));

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}

    if (!response.ok) throw new Error(data.message || raw || 'Request failed.');
    return data;
  }

  function setEmptyLog(message) {
    const body = document.querySelector('#phase12a-runs tbody');
    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="phase12a-empty">
            ${escapeHtml(message || 'Sync log is clear.')}
          </td>
        </tr>
      `;
    }

    const summary = document.getElementById('phase12a-summary');
    if (summary) {
      summary.innerHTML = `
        <h3>Latest raw sync summary</h3>
        <div class="phase12a23-empty-summary">No sync log entries to show.</div>
      `;
    }
  }

  function getActionsContainer() {
    return document.querySelector('#phase12a-panel .phase12a-actions') ||
           document.querySelector('#phase12a-panel') ||
           null;
  }

  function ensureClearButton() {
    if (!isSettingsPage()) return;
    if (document.getElementById('phase12a23-clear-sync-log')) return;

    const actions = getActionsContainer();
    if (!actions) return;

    const button = document.createElement('button');
    button.id = 'phase12a23-clear-sync-log';
    button.type = 'button';
    button.textContent = 'Clear Sync Log';
    button.className = 'phase12a23-clear-button';

    const keepButton = document.createElement('button');
    keepButton.id = 'phase12a23-keep-latest-sync-log';
    keepButton.type = 'button';
    keepButton.textContent = 'Clear Old, Keep Latest 5';
    keepButton.className = 'phase12a23-keep-button';

    actions.appendChild(button);
    actions.appendChild(keepButton);

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      clearLog(0, button);
    }, true);

    keepButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      clearLog(5, keepButton);
    }, true);
  }

  async function clearLog(keepLatest, button) {
    const warning = keepLatest > 0
      ? `Clear old sync log rows and keep the latest ${keepLatest}?`
      : 'Clear the full sync log table? This will not delete Monitoring records or TazWorks order data.';

    if (!window.confirm(warning)) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Clearing...';

    try {
      const data = await api('tazworks-sync/clear', {
        method: 'POST',
        body: JSON.stringify({ keepLatest })
      });

      if (keepLatest > 0) {
        toast(data.message || 'Old sync log rows cleared.');
        // Let the existing refresh handler reload the latest rows.
        const refresh = document.getElementById('phase12a-refresh-runs') ||
          Array.from(document.querySelectorAll('button')).find((b) => text(b) === 'Refresh Sync Log');
        if (refresh) refresh.click();
      } else {
        setEmptyLog(data.message || 'Sync log cleared.');
        toast(data.message || 'Sync log cleared.');
      }
    } catch (error) {
      toast(error.message || 'Could not clear sync log.', true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function addStyles() {
    if (document.getElementById('phase12a23-style')) return;
    const style = document.createElement('style');
    style.id = 'phase12a23-style';
    style.textContent = `
      #phase12a23-clear-sync-log {
        border-color: #dc2626 !important;
        background: #fef2f2 !important;
        color: #991b1b !important;
      }

      #phase12a23-keep-latest-sync-log {
        border-color: #f59e0b !important;
        background: #fffbeb !important;
        color: #92400e !important;
      }

      .phase12a23-empty-summary {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
        border-radius: 12px;
        padding: 14px;
        font-weight: 800;
      }

      .phase12a23-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10070;
        background: #111827;
        color: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 18px 45px rgba(15,23,42,.25);
        font-size: 14px;
        max-width: 460px;
      }

      .phase12a23-toast.danger {
        background: #991b1b;
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    addStyles();
    ensureClearButton();
    setInterval(ensureClearButton, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
