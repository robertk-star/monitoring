(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isSettingsPage() {
    return Array.from(document.querySelectorAll('.page-header h1')).some((h) => text(h) === 'Settings');
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {})
    }));
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.message || 'The order connection is currently unavailable.');
    return data;
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

  function toast(message, danger) {
    let box = document.getElementById('phase11-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase11-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase11-toast danger' : 'phase11-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 6500);
  }

  function renderOrders(orders) {
    const tbody = document.querySelector('#phase11-orders-table tbody');
    if (!tbody) return;

    if (!orders || !orders.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="phase11-empty">No orders returned.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map((order) => `
      <tr>
        <td>${escapeHtml(order.fileNumber || '')}</td>
        <td>${escapeHtml(order.applicantName || '')}</td>
        <td>${escapeHtml(order.orderStatus || '')}</td>
        <td>${escapeHtml(order.orderType || '')}</td>
        <td>${escapeHtml(order.productName || '')}</td>
        <td>${escapeHtml(safeDate(order.orderedDate || order.createdDate))}</td>
        <td>${escapeHtml(safeDate(order.completedDate))}</td>
        <td>${order.searchFlagged ? 'Yes' : 'No'}</td>
        <td><button type="button" data-phase11-searches="${escapeHtml(order.orderGuid || '')}">Searches</button></td>
      </tr>
    `).join('');
  }

  function renderSearches(orderGuid, searches) {
    const box = document.getElementById('phase11-searches');
    if (!box) return;

    if (!searches || !searches.length) {
      box.innerHTML = '<div class="phase11-subbox">No searches returned for this order.</div>';
      return;
    }

    box.innerHTML = `
      <h3>Searches for order ${escapeHtml(orderGuid)}</h3>
      <table>
        <thead><tr><th>Search</th><th>Type</th><th>Status</th><th>Flagged</th><th>Modified</th><th></th></tr></thead>
        <tbody>
          ${searches.map((search) => `
            <tr>
              <td>${escapeHtml(search.searchName || '')}</td>
              <td>${escapeHtml(search.searchType || '')}</td>
              <td>${escapeHtml(search.status || '')}</td>
              <td>${search.flagged ? 'Yes' : 'No'}</td>
              <td>${escapeHtml(safeDate(search.modifiedDate || search.createdDate))}</td>
              <td><button type="button" data-phase11-result-order="${escapeHtml(orderGuid)}" data-phase11-result-search="${escapeHtml(search.searchGuid || '')}">Result</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderResult(result) {
    const box = document.getElementById('phase11-result');
    if (!box) return;
    box.innerHTML = `
      <h3>Result Preview</h3>
      <pre>${escapeHtml(JSON.stringify(result, null, 2).slice(0, 12000))}</pre>
    `;
  }

  async function loadOrders() {
    const fileNumber = document.getElementById('phase11-file-search')?.value?.trim() || '';
    const url = fileNumber ? `/api/orders?page=0&size=10&fileNumber=${encodeURIComponent(fileNumber)}` : '/api/orders?page=0&size=10';

    const button = document.getElementById('phase11-load-orders');
    if (button) {
      button.disabled = true;
      button.textContent = 'Loading...';
    }

    try {
      const data = await api(url);
      renderOrders(data.orders || []);
      document.getElementById('phase11-searches').innerHTML = '';
      document.getElementById('phase11-result').innerHTML = '';
      toast(`Loaded ${data.count || 0} order(s).`);
    } catch (error) {
      renderOrders([]);
      toast(error.message || 'The order connection is currently unavailable.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Load Recent Orders';
      }
    }
  }

  async function loadSearches(orderGuid) {
    if (!orderGuid) return toast('No order GUID available for this row.', true);
    try {
      const data = await api(`/api/orders/${encodeURIComponent(orderGuid)}/searches`);
      renderSearches(orderGuid, data.searches || []);
      document.getElementById('phase11-result').innerHTML = '';
    } catch (error) {
      toast(error.message || 'The order connection is currently unavailable.', true);
    }
  }

  async function loadResult(orderGuid, searchGuid) {
    if (!orderGuid || !searchGuid) return toast('Order GUID and Search GUID are required.', true);
    try {
      const data = await api(`/api/orders/${encodeURIComponent(orderGuid)}/searches/${encodeURIComponent(searchGuid)}/results?resultType=EDITOR`);
      renderResult(data.result || {});
    } catch (error) {
      toast(error.message || 'The order connection is currently unavailable.', true);
    }
  }

  function ensurePanel() {
    if (!isSettingsPage() || document.getElementById('phase11-panel')) return;

    const anchor = Array.from(document.querySelectorAll('section.card')).find((section) => text(section).includes('System Check'));
    const panel = document.createElement('section');
    panel.id = 'phase11-panel';
    panel.className = 'card wide-card settings-card phase11-panel';
    panel.innerHTML = `
      <h2>TazWorks Proxy Connection Test</h2>
      <p class="muted">Server-side only. This test uses internal API routes and the fixed-IP SaffHire proxy. The browser never calls the proxy directly.</p>
      <div class="phase11-warning">
        Client GUID is locked by Vercel ENV. Proxy secret stays server-side.
      </div>
      <div class="phase11-actions">
        <input id="phase11-file-search" placeholder="Optional file number search" />
        <button id="phase11-load-orders" type="button" class="primary-inline">Load Recent Orders</button>
      </div>
      <div class="phase11-table-wrap">
        <table id="phase11-orders-table">
          <thead>
            <tr>
              <th>File #</th>
              <th>Applicant</th>
              <th>Status</th>
              <th>Type</th>
              <th>Product</th>
              <th>Ordered</th>
              <th>Completed</th>
              <th>Flagged</th>
              <th></th>
            </tr>
          </thead>
          <tbody><tr><td colspan="9" class="phase11-empty">Click Load Recent Orders.</td></tr></tbody>
        </table>
      </div>
      <div id="phase11-searches"></div>
      <div id="phase11-result"></div>
    `;

    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else document.querySelector('.main-panel')?.appendChild(panel);

    document.getElementById('phase11-load-orders')?.addEventListener('click', loadOrders);
  }

  function addStyles() {
    if (document.getElementById('phase11-style')) return;
    const style = document.createElement('style');
    style.id = 'phase11-style';
    style.textContent = `
      .phase11-panel { border-left: 5px solid #2563eb; }
      .phase11-warning { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 12px; padding: 10px 12px; margin: 10px 0 14px; }
      .phase11-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
      .phase11-actions input { width: min(280px, 100%); border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; }
      .phase11-table-wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 14px; }
      #phase11-orders-table, #phase11-searches table { width: 100%; border-collapse: collapse; }
      #phase11-orders-table th, #phase11-orders-table td, #phase11-searches th, #phase11-searches td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
      #phase11-orders-table th, #phase11-searches th { background: #f8fafc; text-transform: uppercase; font-size: 12px; color: #475569; }
      #phase11-orders-table button, #phase11-searches button { border: 1px solid #2563eb; background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 6px 9px; font-size: 12px; font-weight: 900; }
      .phase11-empty { text-align: center; color: #64748b; padding: 22px !important; }
      #phase11-searches, #phase11-result { margin-top: 16px; }
      #phase11-result pre { max-height: 420px; overflow: auto; background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 12px; font-size: 12px; }
      .phase11-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10030; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 460px; }
      .phase11-toast.danger { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    const searches = event.target && event.target.closest ? event.target.closest('[data-phase11-searches]') : null;
    if (searches) {
      loadSearches(searches.dataset.phase11Searches);
      return;
    }

    const result = event.target && event.target.closest ? event.target.closest('[data-phase11-result-order]') : null;
    if (result) {
      loadResult(result.dataset.phase11ResultOrder, result.dataset.phase11ResultSearch);
    }
  });

  function refresh() {
    addStyles();
    ensurePanel();
  }

  setInterval(refresh, 1200);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
