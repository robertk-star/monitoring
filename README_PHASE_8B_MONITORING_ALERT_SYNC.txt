SAFFHIRE MONITORING - PHASE 8B MONITORING ALERT SYNC FIX

Problem:
The Phase 8 Monitoring Alerts panel was not updating correctly after PDF uploads/scans.

Cause:
The Monitoring page stores values in form controls:
- Monitoring status is a select field.
- Med Expire is an input field.

The old Phase 8 script read the cell text instead of the actual select/input values.
That caused:
- On Monitoring to show 0
- Off Monitoring to show all records
- Medical expiration counts to stay 0

What this fixes:
- Reads select.value for Monitoring status.
- Reads input.value for Med Expire.
- Scopes counts only to the Monitoring table.
- Adds Recalculate Alerts button.
- Watches actual field values, so counts update after edits/refreshes/PDF scans.

Files included:
- public/phase8.js
- README_PHASE_8B_MONITORING_ALERT_SYNC.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload this over the project.
2. Redeploy Vercel.
3. Go to Monitoring.
4. Click Refresh.
5. Click Recalculate Alerts.
6. Confirm On/Off and Med Expire counts are correct.

After PDF scan:
1. Go to Settings.
2. Scan PDFs.
3. Go to Monitoring.
4. Click Refresh.
5. Click Recalculate Alerts.
