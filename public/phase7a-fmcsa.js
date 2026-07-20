/* Phase 12A-136
 * Phase 7A row buttons are retired. The native React SafetyLinks component in
 * src/main.jsx is the only source for the FMCSA PDF action.
 */
(function () {
  function cleanup() {
    document.querySelectorAll('.phase7a-fmcsa,#phase7a-panel').forEach((element) => element.remove());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanup);
  else cleanup();

  if (document.body) {
    new MutationObserver(cleanup).observe(document.body, { childList: true, subtree: true });
  }
})();
