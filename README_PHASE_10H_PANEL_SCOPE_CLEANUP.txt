SAFFHIRE MONITORING - PHASE 10H PANEL SCOPE CLEANUP

Problem:
Cards from other phases were appearing on the Monitoring page:
- Phase 5A Gmail Workflow
- Phase 6 Employer Response Form
- Phase 7 Completed Packet
- Phase 7A FMCSA PDF Mapping
- PDF Import to Applicant Database

Expected:
Monitoring page should only show Monitoring-related panels and the Monitoring table.

What this phase does:
- Removes Safety Performance workflow cards from Monitoring.
- Removes PDF Import card from Monitoring.
- Keeps the PDF Import card on Settings.
- Keeps Safety Performance workflow cards on Safety Performance Reports.
- Keeps Dashboard clean.

Files included:
- index.html
- public/phase10h-panel-scope-cleanup.js
- README_PHASE_10H_PANEL_SCOPE_CLEANUP.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload these files over the project.
2. Redeploy Vercel.
3. Hard refresh the browser.
4. Go to Monitoring.
5. Confirm only Monitoring Alerts and the Monitoring table show.
6. Go to Settings.
7. Confirm PDF Import to Applicant Database still shows there.
8. Go to Safety Performance Reports.
9. Confirm Safety workflow buttons/cards still work there.
