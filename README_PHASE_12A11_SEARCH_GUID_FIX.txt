SAFFHIRE MONITORING - PHASE 12A-11 SEARCH GUID FIX

Problem shown in the sync log:
- MVR searches are being found.
- resultPulls is 0.
- That means the app did not find the searchGuid needed to pull MVR results.

Fix:
- Extracts searchGuid from many more possible fields:
  - searchGuid / searchGUID
  - searchId / searchID / search_id
  - guid / id
  - resultGuid
  - orderSearchGuid
  - componentGuid
  - search.guid / search.id
  - _links / links href values
  - UUIDs found anywhere in the search object, excluding the orderGuid
- Logs mvrSearchDetails:
  - searchGuid
  - label
  - rawKeys
  - rawUuids
  - noSearchGuid
  - resultErrors

Files included:
- api/index.ts
- package.json
- .vercelignore
- index.html
- public/phase12a-tazworks-sync.js
- supabase/migrations/20260701_phase12a_tazworks_sync.sql
- README_PHASE_12A11_SEARCH_GUID_FIX.txt

SQL needed:
No if Phase 12A SQL already ran.

What to test:
1. Upload and redeploy.
2. Settings -> Run TazWorks Sync Now.
3. Check raw summary.
4. Confirm resultPulls is greater than 0 for MVR samples.
5. If medExpireUpdated is still 0, send the mvrSearchDetails and resultErrors from the summary.
