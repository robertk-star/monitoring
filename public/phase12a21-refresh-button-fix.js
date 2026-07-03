(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function pageTitle() {
    return text(document.querySelector('.page-header h1'));
  }

  function isSettingsPage() {
    return pageTitle() === 'Settings';
  }

  function isMonitoringPage() {
    return pageTitle() === 'Monitoring';
  }

  function isSafetyPage() {
    return pageTitle() === 'Safety Performance Reports';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
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

    if (!response.ok) {
      throw new Error(data.message || raw || 'Request failed.');
    }

    return data;
  }

  function toast(message, danger) {
    let box = document.getElementById('phase12a21-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase12a21-toast';
      document.body.appendChild(box);
    }

    box.className = danger ? 'phase12a21-toast danger' : 'phase12a21-toast';
    box.textContent = message;

    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.remove(), 4200);
  }

  function latestRawSummaryBox() {
    let box = document.getElementById('phase12a-summary');
    if (!box && isSettingsPage()) {
      const panel = document.getElementById('phase12a-panel');
      if (panel) {
        box = document.createElement('div');
        box.id = 'phase12a-summary';
        box.className = 'phase12a-summary';
        panel.appendChild(box);
      }
    }
    return box;
  }

  function renderSummary(summary) {
    const box = latestRawSummaryBox();
    if (!box) return;

    box.innerHTML = '<h3>Latest raw sync summary</h3><pre>' +
      escapeHtml(JSON.stringify(summary || {}, null, 2).slice(0, 14000)) +
      '</pre>';
  }

  function renderRuns(runs) {
    const body = document.querySelector('#phase12a-runs tbody');
    if (!body) return;

    if (!runs || !runs.length) {
      body.innerHTML = '<tr><td colspan="8" class="phase12a-empty">No sync runs yet.</td></tr>';
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
        <td><button type="button" data-phase12a21-summary='${escapeHtml(JSON.stringify(run.raw_summary || {}))}'>Summary</button></td>
      </tr>
    `).join('');
  }

  async function refreshSyncLog(button) {
    if (!isSettingsPage()) return;

    const original = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Refreshing...';
    }

    try {
      const data = await api('tazworks-sync/runs');
      renderRuns(data.runs || []);
      if (data.runs && data.runs[0]) {
        renderSummary(data.runs[0].raw_summary || {});
      }
      toast('Sync log refreshed.');
    } catch (error) {
      toast(error.message || 'Could not refresh sync log.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original || 'Refresh Sync Log';
      }
    }
  }

  function getActiveSidebarButton() {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const active = buttons.find((el) => {
      const t = text(el);
      const cls = String(el.className || '');
      return /active|selected|current/i.test(cls) &&
        ['Monitoring', 'Safety Performance', 'Dashboard', 'Settings'].includes(t);
    });

    if (active) return active;

    const title = pageTitle();
    const wanted = title === 'Safety Performance Reports' ? 'Safety Performance' : title;
    return buttons.find((el) => text(el) === wanted) || null;
  }

  function clickPageTabAgain() {
    const active = getActiveSidebarButton();
    if (active) {
      active.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  }

  function runPageSpecificRecalc() {
    // Monitoring alerts are maintained by phase12a6 script.
    // Nudge it by firing change/input and clicking Recalculate Alerts if present.
    if (isMonitoringPage()) {
      const recalc = Array.from(document.querySelectorAll('button')).find((b) => text(b) === 'Recalculate Alerts');
      if (recalc) {
        recalc.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }

      document.dispatchEvent(new Event('change', { bubbles: true }));
      document.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function safeTopRightRefresh(button) {
    const original = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Refreshing...';
    }

    try {
      // First try to re-click the active tab/page. This preserves SPA behavior better than full reload.
      const didClick = clickPageTabAgain();

      setTimeout(runPageSpecificRecalc, 300);
      setTimeout(runPageSpecificRecalc, 900);

      // If there was no tab to re-click, fall back to a normal browser reload.
      if (!didClick) {
        window.location.reload();
        return;
      }

      toast('Page refreshed.');
    } catch (error) {
      toast('Refresh fallback failed. Reloading page...', true);
      window.location.reload();
    } finally {
      setTimeout(() => {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.textContent = original || 'Refresh';
        }
      }, 1200);
    }
  }

  function isTopRightRefreshButton(button) {
    if (!button) return false;
    const t = text(button).replace(/[↻⟳↺]/g, '').trim();
    if (t !== 'Refresh') return false;

    // Do not hijack internal table summary or sync-log buttons.
    if (button.closest('#phase12a-panel')) return false;

    // Usually the page refresh button is near the page header.
    const header = button.closest('.page-header, header, .header, .topbar');
    if (header) return true;

    // Fallback: still allow exact "Refresh" buttons outside tables.
    if (button.closest('table')) return false;
    return true;
  }

  function bindVisibleButtons() {
    Array.from(document.querySelectorAll('button')).forEach((button) => {
      const t = text(button);

      if ((button.id === 'phase12a-refresh-runs' || t === 'Refresh Sync Log') && !button.dataset.phase12a21Bound) {
        button.dataset.phase12a21Bound = '1';
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          refreshSyncLog(button);
        }, true);
      }

      if (isTopRightRefreshButton(button) && !button.dataset.phase12a21RefreshBound) {
        button.dataset.phase12a21RefreshBound = '1';
        button.addEventListener('click', function (event) {
          // Let the original handler run first. If it is broken/no-op, our fallback runs right after.
          setTimeout(() => safeTopRightRefresh(button), 150);
        }, false);
      }
    });
  }

  document.addEventListener('click', function (event) {
    const summaryButton = event.target && event.target.closest
      ? event.target.closest('[data-phase12a21-summary]')
      : null;

    if (!summaryButton) return;

    try {
      renderSummary(JSON.parse(summaryButton.dataset.phase12a21Summary || '{}'));
    } catch {
      renderSummary({});
    }
  }, true);

  function addStyles() {
    if (document.getElementById('phase12a21-style')) return;
    const style = document.createElement('style');
    style.id = 'phase12a21-style';
    style.textContent = `
      .phase12a21-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10050;
        background: #111827;
        color: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 18px 45px rgba(15,23,42,.25);
        font-size: 14px;
        max-width: 460px;
      }
      .phase12a21-toast.danger {
        background: #991b1b;
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    addStyles();
    bindVisibleButtons();
    setInterval(bindVisibleButtons, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
