/* Phase 12A-136
 * Phase 7 row actions are retired. The native React SafetyLinks component in
 * src/main.jsx is the only source for Client Gmail and Mark Completed.
 */
(function () {
  function cleanup() {
    document.querySelectorAll('.phase7-tools,#phase7-panel').forEach((element) => element.remove());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanup);
  else cleanup();

  if (document.body) {
    new MutationObserver(cleanup).observe(document.body, { childList: true, subtree: true });
  }
})();
