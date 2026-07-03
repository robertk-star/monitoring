SAFFHIRE MONITORING - PHASE 12A-27 WHITE SCREEN ROLLBACK

Problem:
After Phase 12A-26, the app shows a white screen.

Likely cause:
The Phase 12A-26 cleanup script removed too much of the dashboard/app DOM while trying to remove the old Phase 4 Build card.

Fix:
- Rolls back to the last working build: Phase 12A-25.
- Removes:
  public/phase12a26-remove-phase4-dashboard-card.js
- Removes the script reference from index.html.
- Adds a small white-screen guard:
  public/phase12a27-white-screen-guard.js

What this means:
- The app should load again.
- The rogue Employer Response Form panel removal from Phase 12A-25 stays in place.
- The Phase 4 dashboard card may come back temporarily.
- We should remove that card later using a safer targeted fix.

Files included:
- index.html
- public/phase12a27-white-screen-guard.js
- existing Phase 12A-25 files
- README_PHASE_12A27_WHITE_SCREEN_ROLLBACK.txt

SQL needed:
No.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Hard refresh.
3. Confirm the app loads.
4. Check Dashboard, Monitoring, Safety Performance, Settings.
5. Do not re-upload Phase 12A-26.
