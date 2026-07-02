SAFFHIRE MONITORING - PHASE 12A-9 NO-FLASH SAFETY CLEANUP

Problem:
The Phase 5A, Phase 6, Phase 7, and Phase 7A cards keep flashing in and out on the Safety Performance page.

Cause:
Older phase scripts recreate the cards.
The old cleanup script removed them after they appeared, causing a flash.

Fix:
This phase loads the cleanup script before the old phase scripts.
It immediately hides known phase cards by ID/class in the page head.
It also uses an early MutationObserver to hide/remove those cards as soon as they are inserted.

Removed from Safety Performance:
- Phase 5A Gmail Workflow
- Phase 6 Employer Response Form
- Phase 7 Completed Packet
- Phase 7A FMCSA PDF Mapping

What stays:
- Safety Performance Reports header
- Refresh button
- New Report button
- Search/filter bar
- Safety Performance report table/list
- Existing report actions

Files included:
- index.html
- public/phase12a9-no-flash-safety-cleanup.js
- public/phase12a8-safety-card-cleanup.js
- README_PHASE_12A9_NO_FLASH_SAFETY_CLEANUP.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload these files.
2. Redeploy Vercel.
3. Hard refresh.
4. Go to Safety Performance.
5. Confirm the phase cards do not flash.
