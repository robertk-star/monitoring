(function () {
  let activeUser = null;
  let lastUserSignature = '';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function role() {
    return (activeUser && activeUser.role) || '';
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

  async function getActiveUser() {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.message || 'Could not read active session');
    activeUser = data.user || null;
    return activeUser;
  }

  function userSignature(user) {
    if (!user) return 'none';
    return [user.id, user.username, user.displayName, user.role, user.companyId].join('|');
  }

  function addStyles() {
    if (document.getElementById('phase9b-style')) return;
    const style = document.createElement('style');
    style.id = 'phase9b-style';
    style.textContent = `
      #phase9-role-card.phase9b-synced { border-color: rgba(31,255,0,.35); }
      .phase9b-role-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; background: #1fff00; color: #0f172a; font-weight: 900; font-size: 12px; margin-top: 6px; text-transform: lowercase; }
      .phase9b-role-card-inner { color: #e2e8f0; font-size: 13px; }
      .phase9b-role-card-inner strong { display:block; margin-top: 2px; }
      .phase9b-hidden { display: none !important; }
      .phase9b-disabled { opacity: .45 !important; pointer-events: none !important; }
      .phase9b-readonly-banner { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 12px; padding: 10px 12px; margin: 0 0 14px; font-weight: 800; }
      .phase9b-toast { position: fixed; right: 18px; bottom: 18px; z-index: 10020; background: #111827; color: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 18px 45px rgba(15,23,42,.25); font-size: 14px; max-width: 420px; }
      .phase9b-toast.danger { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }

  function toast(message, danger) {
    let box = document.getElementById('phase9b-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'phase9b-toast';
      box.className = 'phase9b-toast';
      document.body.appendChild(box);
    }
    box.className = danger ? 'phase9b-toast danger' : 'phase9b-toast';
    box.textContent = message;
    clearTimeout(box.__hideTimer);
    box.__hideTimer = setTimeout(() => box.remove(), 4500);
  }

  function displayName(user) {
    return (user && (user.displayName || user.username)) || 'Unknown user';
  }

  function syncRoleCard() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || !activeUser) return;

    let card = document.getElementById('phase9-role-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'phase9-role-card';
      card.className = 'phase9-role-card phase9b-synced';
      const sideTitle = sidebar.querySelector('.side-title');
      if (sideTitle) sideTitle.insertAdjacentElement('afterend', card);
      else sidebar.prepend(card);
    }

    card.classList.add('phase9b-synced');
    card.innerHTML = `
      <div class="phase9b-role-card-inner">
        <div>Signed in as</div>
        <strong>${escapeHtml(displayName(activeUser))} · ${escapeHtml(role() || 'unknown')}</strong>
        <span class="phase9b-role-pill">${escapeHtml(role() || 'unknown')}</span>
      </div>
    `;

    const nativeUserPill = sidebar.querySelector('.side-footer .user-pill');
    if (nativeUserPill) {
      nativeUserPill.innerHTML = `${escapeHtml(displayName(activeUser))}`;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function pageTitle() {
    const h1 = document.querySelector('.page-header h1');
    return text(h1);
  }

  function hideSettingsIfNeeded() {
    const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    const settingsButton = navButtons.find((button) => text(button).toLowerCase().includes('settings'));
    if (settingsButton) settingsButton.classList.toggle('phase9b-hidden', !isAdmin());

    const onSettings = pageTitle() === 'Settings';
    if (onSettings && !isAdmin()) {
      const sections = Array.from(document.querySelectorAll('.settings-card, .wide-card.settings-card, section.card'));
      sections.forEach((section) => {
        const title = text(section.querySelector('h2')).toLowerCase();
        const allowed = title.includes('system check');
        if (!allowed) section.classList.add('phase9b-hidden');
      });
    }
  }

  function ensureViewerBanner() {
    const title = pageTitle();
    const existing = document.getElementById('phase9b-readonly-banner');
    if (!isViewer() || !['Monitoring', 'Safety Performance Reports', 'Settings'].includes(title)) {
      if (existing) existing.remove();
      return;
    }

    const header = document.querySelector('.page-header');
    if (!header || existing) return;
    const banner = document.createElement('div');
    banner.id = 'phase9b-readonly-banner';
    banner.className = 'phase9b-readonly-banner';
    banner.textContent = title === 'Settings'
      ? 'Viewer mode: Settings is not editable for this account.'
      : 'Viewer mode: this page is read-only. Editing, saving, sending, deleting, and status changes are disabled.';
    header.insertAdjacentElement('afterend', banner);
  }

  function buttonLabel(button) {
    return text(button).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function safeViewerButton(button) {
    const label = buttonLabel(button);
    return (
      label.includes('refresh') ||
      label.includes('copy') ||
      label.includes('summary') ||
      label.includes('download') ||
      label.includes('pdf') ||
      label.includes('packet') ||
      label.includes('reset view') ||
      label === 'all' ||
      label.includes('missing') ||
      label.includes('expired') ||
      label.includes('expiring') ||
      label.includes('mvr') ||
      label.includes('total') ||
      label.includes('overdue') ||
      label.includes('due today')
    );
  }

  function applyReadOnlyControls() {
    if (!isViewer()) return;

    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const inLogin = Boolean(el.closest('.login-card'));
      const inSearch = Boolean(el.closest('.search-box'));
      if (inLogin || inSearch) return;
      el.disabled = true;
      el.classList.add('phase9b-disabled');
    });

    document.querySelectorAll('button').forEach((button) => {
      const inNav = Boolean(button.closest('nav'));
      const isRefresh = buttonLabel(button).includes('refresh');
      if (inNav || isRefresh || safeViewerButton(button)) return;

      const label = buttonLabel(button);
      const forbidden =
        label.includes('save') ||
        label.includes('delete') ||
        label.includes('add') ||
        label.includes('new') ||
        label.includes('send') ||
        label.includes('open gmail') ||
        label.includes('mark') ||
        label.includes('+5') ||
        label.includes('complete') ||
        label.includes('response link') ||
        label.includes('import');

      if (forbidden) button.classList.add('phase9b-hidden');
    });
  }

  function applyUserControls() {
    if (!isUser()) return;
    document.querySelectorAll('button').forEach((button) => {
      const label = buttonLabel(button);
      if (label.includes('delete')) button.classList.add('phase9b-hidden');
    });
  }

  function syncPermissionPanel() {
    const panel = document.getElementById('phase9-permission-panel');
    if (!panel || !activeUser) return;

    const access = isAdmin()
      ? [['Dashboard','Full access'],['Monitoring','Edit'],['Safety Performance','Edit / Delete'],['Settings','Admin']]
      : isUser()
        ? [['Dashboard','View'],['Monitoring','Edit'],['Safety Performance','Edit'],['Settings','Hidden']]
        : [['Dashboard','View'],['Monitoring','Read only'],['Safety Performance','Read only'],['Settings','Hidden']];

    panel.innerHTML = `
      <h2>Phase 9 Permissions</h2>
      <p>Current role: <b>${escapeHtml(role() || 'unknown')}</b>. Permissions are synced to the active login session.</p>
      <div class="phase9-permission-grid">
        ${access.map(([area, value]) => `<span><b>${area}</b>${value}</span>`).join('')}
      </div>
    `;
  }

  function clickGuard() {
    if (document.__phase9bClickGuard) return;
    document.__phase9bClickGuard = true;
    document.addEventListener('click', function (event) {
      if (!activeUser) return;
      const button = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!button) return;
      const label = buttonLabel(button);

      if (isViewer()) {
        const forbidden =
          label.includes('save') ||
          label.includes('delete') ||
          label.includes('add') ||
          label.includes('new') ||
          label.includes('send') ||
          label.includes('open gmail') ||
          label.includes('mark') ||
          label.includes('+5') ||
          label.includes('complete') ||
          label.includes('response link') ||
          label.includes('import');
        if (forbidden && !safeViewerButton(button)) {
          event.preventDefault();
          event.stopPropagation();
          toast('Viewer role is read-only.', true);
        }
      }

      if (isUser() && label.includes('delete')) {
        event.preventDefault();
        event.stopPropagation();
        toast('Only admins can delete records.', true);
      }
    }, true);
  }

  function applyAll() {
    if (!activeUser) return;
    addStyles();
    syncRoleCard();
    hideSettingsIfNeeded();
    ensureViewerBanner();
    applyReadOnlyControls();
    applyUserControls();
    syncPermissionPanel();
    clickGuard();
  }

  async function pollUser() {
    try {
      const user = await getActiveUser();
      const sig = userSignature(user);
      if (sig !== lastUserSignature) {
        lastUserSignature = sig;
        document.querySelectorAll('.phase9b-hidden').forEach((el) => el.classList.remove('phase9b-hidden'));
      }
      applyAll();
    } catch {
      activeUser = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pollUser);
  } else {
    pollUser();
  }

  setInterval(pollUser, 1200);
})();
