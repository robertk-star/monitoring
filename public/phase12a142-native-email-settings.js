// Phase 12A-142: Native React Email Settings navigation guard.
// The legacy Phase 12A-80 script replaces React's main panel with innerHTML,
// which breaks later React navigation and causes a white screen. Keep the
// native React Email Settings button and continuously remove the legacy one.
(function () {
  const LEGACY_SELECTOR = '#phase12a80-email-settings-nav, [data-phase12a80-email-settings-nav]';
  let observerStarted = false;

  function removeLegacyEmailSettingsButton() {
    document.querySelectorAll(LEGACY_SELECTOR).forEach((element) => element.remove());
  }

  function openNativeEmailSettings() {
    const nativeButton = document.querySelector('[data-native-page="email-settings"]');
    if (nativeButton && typeof nativeButton.click === 'function') nativeButton.click();
  }

  document.addEventListener('click', function (event) {
    const legacyButton = event.target && event.target.closest ? event.target.closest(LEGACY_SELECTOR) : null;
    if (!legacyButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    legacyButton.remove();
    openNativeEmailSettings();
  }, true);

  function startObserver() {
    if (observerStarted || !document.documentElement) return;
    observerStarted = true;
    const observer = new MutationObserver(removeLegacyEmailSettingsButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    const style = document.createElement('style');
    style.id = 'phase12a142-native-email-settings-style';
    style.textContent = `${LEGACY_SELECTOR}{display:none!important}`;
    if (!document.getElementById(style.id)) document.head.appendChild(style);
    removeLegacyEmailSettingsButton();
    startObserver();
    setInterval(removeLegacyEmailSettingsButton, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
