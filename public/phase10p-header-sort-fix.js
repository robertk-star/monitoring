// Phase 10Q freeze fix.
// This file intentionally disables the previous Phase 10P header sort overlay.
// Sorting will be rebuilt cleanly later without MutationObserver loops.
(function () {
  console.log('Phase 10P header sort overlay disabled by Phase 10Q.');
})();
