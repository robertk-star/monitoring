(function () {
  let activeUser = null;

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
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

  async function loadUser() {
    try {
      const data = await api('/api/auth/me');
      activeUser = data.user || null;
    } catch {
      activeUser = null;
    }
  }

  function role() {
    return activeUser && activeUser.role ? activeUser.role : '';
  }

  function isAdmin() {
    return role() === 'admin';
  }

  function isViewer() {
    return role() === 'viewer';
  }

  function isUser() {
    return role() === 'user';
  }

  function displayName() {
    if (!activeUser) return '';
    return activeUser.displayName || activeUser.username || 'User';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function addStyles() {
    if (document.getElementById('phase9-clean-style')) return;
    const style = document.createElement('style');
    style.id = 'phase9-clean-style';
    style.textContent = `
      .phase9-role-card {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 14px;
        padding: 10px;
        margin: 12px 0;
        color: #e2e8f0;
        font-size: 13px;
      }
      .phase9-role-card strong { display: block; margin-top: 2px; }
      .phase9-role-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 9px;
        background: #1fff00;
        color: #0f172a;
        font-weight: 900;
        font-size: 12px;
        margin-top: 6px;
        text-transform: lowercase;
      }
      .phase9-hidden { display: none !important; }
      .phase9-disabled { opacity: .45 !important; pointer-events: none !important; }
      .phase9-readonly-banner {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1d4ed8;
        border-radius: 12px;
        padding: 10px 12px;
        margin: 0 0 14px;
        font-weight: 800;
      }
      .phase9-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10020;
        background: #111827;
        color: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 18px 45px rgba(15,23,42,.25);
        font-size: 14px;
        max-width: 420px;
      }
      .phase9-toast.danger { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }

  function updateSidebarRoleCard() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || !activeUser) return;

    let card = document.getElementById('phase9-role-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'phase9-role-card';
      card.className = 'phase9-role-card';
      const title = sidebar.querySelector('.side-title');
      if (title) title.insertAdjacentElement('afterend', card);
      else sidebar.prepend(card);
    }

    card.innerHTML = `
      <div>Signed in as</div>
      <strong>${escapeHtml(displayName())} · ${escapeHtml(role())}</strong>
      <span class="phase9-role-pill">${escapeHtml(role())}</span>
    `;

    const native = sidebar.querySelector('.side-footer .user-pill');
    if (native) native.textContent = displayName();
  }

  function hideSettingsForNonAdmin() {
    Array.from(document.querySelectorAll('.nav-btn')).forEach((button) => {
      if (text(button).toLowerCase().includes('settings')) {
        button.classList.toggle('phase9-hidden', !isAdmin());
      }
    });
  }

  function pageTitle() {
    const h1 = document.querySelector('.page-header h1');
    return text(h1);
  }

  function removeOldPermissionPanel() {
    const panel = document.getElementById('phase9-permission-panel');
    if (panel) panel.remove();

    Array.from(document.querySelectorAll('section.card, div.card, .wide-card')).forEach((card) => {
      if (text(card).includes('Phase 9 Permissions')) card.remove();
    });
  }

  function buttonLabel(button) {
    return text(button).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function viewerSafeButton(button) {
    const label = buttonLabel(button);
    return (
      label.includes('refresh') ||
      label.includes('copy') ||
      label.includes('summary') ||
      label.includes('download') ||
      label.includes('pdf') ||
      label.includes('packet') ||
      label.includes('recalculate') ||
      label.includes('sort') ||
      label.includes('total') ||
      label.includes('monitoring') ||
      label.includes('expired') ||
      label.includes('expiring') ||
      label.includes('blank') ||
      label.includes('mvr')
    );
  }

  function applyViewerMode() {
    if (!isViewer()) return;

    const title = pageTitle();
    if (!['Monitoring', 'Safety Performance Reports', 'Settings'].includes(title)) return;

    let banner = document.getElementById('phase9-readonly-banner');
    const header = document.querySelector('.page-header');
    if (header && !banner) {
      banner = document.createElement('div');
      banner.id = 'phase9-readonly-banner';
      banner.className = 'phase9-readonly-banner';
      banner.textContent = 'Viewer mode: this page is read-only.';
      header.insertAdjacentElement('afterend', banner);
    }

    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.closest('.login-card') || el.closest('.search-box')) return;
      el.disabled = true;
      el.classList.add('phase9-disabled');
    });

    document.querySelectorAll('button').forEach((button) => {
      const label = buttonLabel(button);
      if (button.closest('nav') || viewerSafeButton(button)) return;
      const forbidden = label.includes('save') || label.includes('delete') || label.includes('add') || label.includes('new') || label.includes('send') || label.includes('open gmail') || label.includes('mark') || label.includes('complete') || label.includes('response link') || label.includes('import');
      if (forbidden) button.classList.add('phase9-hidden');
    });
  }

  function applyUserMode() {
    if (!isUser()) return;
    document.querySelectorAll('button').forEach((button) => {
      if (buttonLabel(button).includes('delete')) button.classList.add('phase9-hidden');
    });
  }

  function toast(message) {
    let box = document.getElementById('phase9-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase9-toast';
      box.className = 'phase9-toast danger';
      document.body.appendChild(box);
    }
    box.textContent = message;
    clearTimeout(box.hideTimer);
    box.hideTimer = setTimeout(() => box.remove(), 4500);
  }

  function clickGuard() {
    if (document.__phase9CleanClickGuard) return;
    document.__phase9CleanClickGuard = true;
    document.addEventListener('click', function (event) {
      const button = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!button || !activeUser) return;
      const label = buttonLabel(button);

      if (isViewer() && !viewerSafeButton(button)) {
        const forbidden = label.includes('save') || label.includes('delete') || label.includes('add') || label.includes('new') || label.includes('send') || label.includes('open gmail') || label.includes('mark') || label.includes('complete') || label.includes('response link') || label.includes('import');
        if (forbidden) {
          event.preventDefault();
          event.stopPropagation();
          toast('Viewer role is read-only.');
        }
      }

      if (isUser() && label.includes('delete')) {
        event.preventDefault();
        event.stopPropagation();
        toast('Only admins can delete records.');
      }
    }, true);
  }

  async function refresh() {
    await loadUser();
    addStyles();
    updateSidebarRoleCard();
    hideSettingsForNonAdmin();
    removeOldPermissionPanel();
    applyViewerMode();
    applyUserMode();
    clickGuard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();

  setInterval(refresh, 1500);
})();
