# Phase 12A-149 — Safety Performance Horizontal Scrolling

Upload only:

- `index.html`
- `public/client-portal.html`
- `public/phase12a149-safety-horizontal-scroll.js`

## What changed

- Makes Safety Performance tables horizontally scrollable for SaffHire Admins, SaffHire Users, viewers, Client Admins, and Client Users.
- Keeps a visible horizontal scrollbar when the table is wider than the screen.
- Supports mouse/trackpad scrolling and touch swiping.
- Reapplies automatically after React page changes, client portal refreshes, filters, auto-sync updates, and newly loaded reports.
- Leaves Monitoring and unrelated tables unchanged.

## Deployment

- SQL migration: No
- Vercel environment variables: No
- Hard refresh once after deployment.
