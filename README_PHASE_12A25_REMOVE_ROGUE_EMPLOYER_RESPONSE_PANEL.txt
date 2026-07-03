SAFFHIRE MONITORING - PHASE 12A-25 REMOVE ROGUE EMPLOYER RESPONSE PANEL

Problem:
The old Employer Response Form Link panel is showing at the bottom of every page.

Visible leaked content:
- Employer Response Form Link
- Secure Form Link
- Copy Link
- Copy Email Draft
- Open Form
- Open Gmail
- The employer can complete this form without logging in...

Cause:
The old Phase 6 employer response form UI is being mounted globally instead of only opening when requested from a Safety Performance report.

Fix:
- Adds public/phase12a25-remove-rogue-employer-response-panel.js
- Removes the leaked employer response form panel from the DOM.
- Watches for it being recreated and removes it again.
- Does not remove Monitoring.
- Does not remove Client View.
- Does not remove Client Admin.
- Does not remove the Safety Performance page/table.

Files included:
- index.html
- public/phase12a25-remove-rogue-employer-response-panel.js
- existing Phase 12A-24 files
- README_PHASE_12A25_REMOVE_ROGUE_EMPLOYER_RESPONSE_PANEL.txt

SQL needed:
No.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Hard refresh.
3. Visit Dashboard.
4. Visit Monitoring.
5. Visit Safety Performance.
6. Visit Settings.
7. Visit Client View.
8. Visit Client Admin.
9. Confirm the bottom Employer Response Form Link panel no longer appears.
