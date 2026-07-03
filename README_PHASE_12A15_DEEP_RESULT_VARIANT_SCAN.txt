SAFFHIRE MONITORING - PHASE 12A-15 DEEP RESULT VARIANT SCAN

Problem:
File 6328 still did not update. It has an expiration date, but the app is not finding it.

Likely cause:
The normal MVR EDITOR result route is not the route/type that contains the Certificate Information section for file 6328.

What changed:
- Still scans MVR searches first.
- Still scans all searches when no MVR-labeled search exists.
- For each candidate search, it now tries multiple result variants:
  - EDITOR
  - no resultType
  - CLIENT
  - HTML
  - RAW
  - JSON
  - FULL
- If search-level result routes do not find a date, it tries order-level result routes:
  - /tazworks/orders/<ORDER_GUID>/results
  - with the same result variants above
- Adds certificatePreview to the sync summary so we can see the nearby Certificate/Medical/Expiration text if no date is found.

New summary fields:
- resultVariantsTried
- orderLevelResultTries
- resultTypeUsed
- usedOrderLevelResult
- certificatePreview
- rawMatch

Expected for file 6328:
- resultPulls should be greater than 1 if it has a searchGuid.
- resultVariantsTried should list the variants attempted.
- certificatePreview should show the Certificate/Medical/Expiration area if the API returns it.
- If Expiration Date is found, Med Expire should populate.

SQL needed:
No if Phase 12A SQL already ran.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Settings -> Run TazWorks Sync Now.
3. Check file 6328 in raw summary.
4. Send certificatePreview and resultErrors if medExpire is still null.
