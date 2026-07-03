SAFFHIRE MONITORING - PHASE 12A-16 SEARCH DISPLAYVALUE MEDICAL SCAN

Problem:
File 6328 still did not populate. The latest log shows the app is seeing license expiration previews, not medical certificate expiration. License expiration must not be saved into the Med Expire field.

Likely missed source:
TazWorks search rows include displayValue. The medical certificate / expiration text may be in displayValue before the result endpoint is needed.

Fix:
- Scans search row/displayValue before calling result routes.
- Keeps scanning MVR searches first.
- If no MVR-labeled search exists, scans all searches for the order.
- Ignores license-only expiration dates.
- Only saves a date when the surrounding text is medical/certificate related.
- Adds searchRowPreview and searchRowScans to raw_summary.

New summary fields:
- searchRowScans
- searchRowPreview
- resultTypeUsed: search-row-displayValue when found in the search row
- rawMatch

Expected:
- If file 6328's expiration is in displayValue, Med Expire should populate.
- If the preview only shows License Info Expiration Date, Med Expire should stay blank because that is not medical expiration.

Files included:
- api/index.ts
- package.json
- .vercelignore
- index.html
- public/phase12a-tazworks-sync.js
- supabase/migrations/20260701_phase12a_tazworks_sync.sql
- README_PHASE_12A16_SEARCH_DISPLAYVALUE_MEDICAL_SCAN.txt

SQL needed:
No if Phase 12A SQL already ran.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Settings -> Run TazWorks Sync Now.
3. Check file 6328 in raw summary.
4. If Med Expire is still null, send:
   - searchRowPreview
   - certificatePreview
   - rawMatch if present
   - resultErrors
