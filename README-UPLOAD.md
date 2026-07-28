# Phase 12A-149 — Top and Bottom Safety Report Scrollbars

Upload only:

- `src/main.jsx`

## What changed

- Added a horizontal scrollbar above the Safety Performance report table.
- The new top scrollbar and the existing bottom scrollbar stay synchronized.
- The scrollbar width recalculates after refreshes, searches, status filters, report creation, and report deletion.
- The top scrollbar only appears when the Safety table is wider than the available screen.
- Works for SaffHire Admins and SaffHire Users who have Safety Performance Reports access.

SQL migration: No
Vercel environment variables: No
