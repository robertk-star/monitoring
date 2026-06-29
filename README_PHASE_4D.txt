SAFFHIRE MONITORING - PHASE 4D

What this phase adds:
- Daily Cleanup panel on Safety Performance Reports
- Counts/filters for:
  - Missing Email
  - No Employer Name
  - Last Emailed Found
  - Sent / No Follow-Up
- Badges in the Previous Employer column:
  - Missing email
  - No employer name
  - Last emailed date
  - Follow-up date
- New row tools:
  - Copy Email
  - Better Draft
  - Copy Summary
- Better Draft creates a cleaner employer request email with a SaffHire signature block.
- Visual warning stripe for missing employer info.

Files included:
- index.html
- public/phase4b.js
- public/phase4c.js
- public/phase4d.js
- README_PHASE_4D.txt

Install:
1. Upload these files over the existing project.
2. Redeploy Vercel.
3. Go to Safety Performance Reports.

SQL needed:
No.

Vercel ENV needed:
No.

What to test:
1. Go to Safety Performance Reports.
2. Confirm the Phase 4D Daily Cleanup panel appears.
3. Click Missing Email and No Employer Name filters.
4. Use Copy Email on a row with an employer email.
5. Use Better Draft and confirm the cleaner email opens/copies.
6. Use Copy Summary and paste it somewhere to confirm it copied the report summary.
