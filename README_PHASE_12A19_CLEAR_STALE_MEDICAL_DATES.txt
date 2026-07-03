SAFFHIRE MONITORING - PHASE 12A-19 CLEAR STALE MEDICAL DATES

Problem:
Order 6330 shows a Med Expire date in Monitoring, but its MVR does not have Medical Information.
This is likely a stale value from an earlier extractor that incorrectly saved a non-medical date.

Fix:
When TazWorks sync checks an order:
- If a verified Medical Information expiration date is found, save it.
- If no verified Medical Information expiration date is found, clear Med Expire.
- If Med Expire was manually overridden, do not clear it.

What changed in api/index.ts:
- The applicants upsert no longer preserves old Med Expire automatically.
- It preserves manually overridden values only.
- It clears stale dates when the current MVR has no medical expiration.
- Sync summary now includes:
  - medExpireUpdated
  - medExpireCleared

Expected for order/file 6330:
- If MVR has no Medical Information expiration, Med Expire should clear after sync.
- If the date was manually overridden, it should remain.

Files included:
- api/index.ts
- index.html
- public/mvr-test.html
- public/phase12a17-mvr-test-link.js
- public/phase12a-tazworks-sync.js
- package.json
- .vercelignore
- supabase/migrations/20260701_phase12a_tazworks_sync.sql
- README_PHASE_12A19_CLEAR_STALE_MEDICAL_DATES.txt

SQL needed:
No if Phase 12A SQL already ran.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Go to Settings.
3. Click Run TazWorks Sync Now.
4. Check raw summary for medExpireCleared.
5. Go to Monitoring.
6. Search file/order 6330.
7. Confirm Med Expire is blank if no Medical Information expiration exists.
8. Confirm file 6340 still has 2028-03-26.
