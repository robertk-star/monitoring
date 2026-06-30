SAFFHIRE MONITORING - PHASE 10O HEADER-ONLY SORTING

Requested change:
The sort function should be part of the table header for the records, not part of the Monitoring Alerts card.

What changed:
- Removed Sort File #, Sort Name, Sort Order Date, and Sort Med Expire buttons from the Monitoring Alerts card.
- Sorting is now done by clicking the table headers:
  - File #
  - Name
  - Order Date
  - Med Expire
- Headers show sort arrows.
- Monitoring Alerts card still has:
  - Filters/counts
  - Copy Summary
  - Download Current View CSV
  - Recalculate Alerts

Files included:
- index.html
- public/phase8.js
- README_PHASE_10O_HEADER_ONLY_SORTING.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload these files over the project.
2. Redeploy Vercel.
3. Hard refresh the browser.
4. Go to Monitoring.
5. Confirm sort buttons are gone from the alert card.
6. Click the table headers File #, Name, Order Date, and Med Expire to sort.
