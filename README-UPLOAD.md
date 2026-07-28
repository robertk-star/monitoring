# Phase 12A-150 — Safety Top Scrollbar Persistence Fix

Upload only:

- `src/main.jsx`

## What changed

- Keeps the Safety Performance top horizontal scrollbar mounted instead of conditionally hiding it after a later layout measurement.
- Prevents temporary React/browser measurements from collapsing the scrollbar width.
- Uses a dedicated intrinsic-width content wrapper so the top and bottom scroll areas measure the same table.
- Re-measures after report changes, filtering, text updates, resizing, and delayed layout settling.
- Keeps the top and bottom scroll positions synchronized.

## Deployment

- SQL migration: No
- Vercel environment variables: No
