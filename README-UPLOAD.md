# Phase 12A-137 — Sortable Client Monitoring Headers

Upload this file to the same path in `robertk-saffhire/monitoring`:

- `public/client-portal.html`

## What changed

On the client portal Monitoring page, every data header is now sortable:

- File #
- Name
- Order Date
- Monitoring
- Order MVR
- Med Expire
- Notes
- Terminated, when the user has Terminated Records access

The Save header remains non-sortable.

Click a header once for ascending order and again for descending order. The active header shows an up or down arrow. Inactive sortable headers show a neutral two-way arrow.

The dedicated Terminated page uses the same sortable table behavior.

Sorting is performed from the client portal data and remains selected after refreshes and automatic data updates. If a row has unsaved changes, sorting is blocked with a message so typed notes or status changes are not accidentally discarded.

## SQL migration

No.

## Vercel environment variables

No changes.

## Validation

- The JavaScript extracted from `public/client-portal.html` passed `node --check`.
- The build starts from the current Phase 12A-135 client portal file on GitHub main.
