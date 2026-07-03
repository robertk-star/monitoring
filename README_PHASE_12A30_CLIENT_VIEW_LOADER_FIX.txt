SAFFHIRE MONITORING - PHASE 12A-30 CLIENT VIEW LOADER FIX

Problem:
Nothing changed after Phase 12A-29.

Likely cause:
The updated client view script was not being loaded by index.html, or the browser cached the older script.

Fix:
This ZIP includes only the files that need to be uploaded:
- api/index.ts
- index.html
- public/phase12a30-client-view-admin.js

Why there is a new script name:
- phase12a30-client-view-admin.js avoids browser cache.
- index.html loads it last.

What should change:
- Client View should show editable Monitoring rows.
- Each row should have:
  - Monitoring On/Off dropdown
  - Notes field
  - Save button
- There should be a Save All Changed button.
- Client Admin should still allow adding users.

How to confirm it loaded:
In the CLIENT sidebar area, you should see a small badge:
Editable client view loaded

SQL needed:
No.

Vercel ENV needed:
No new ENV.

Upload only these files:
- api/index.ts
- index.html
- public/phase12a30-client-view-admin.js
