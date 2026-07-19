# Phase 12A-124 — Client Dashboard Totals Fix

Upload only:

- api/index.ts

No SQL migration is required.
No Vercel ENV changes are required.

What changed:

- Client Portal dashboard totals are now calculated from all company records, not the limited recent table rows.
- Monitoring counts are scoped to the signed-in client's company.
- Safety report counts are scoped to the signed-in client's company.
- Med Cert Expired and Med Cert 30 Days now only count applicants that are On Monitoring, matching the Monitoring Alerts logic.
- Access rules are still enforced: if Monitoring is off, Monitoring cards do not show; if Safety Reports is off, Safety cards do not show.
