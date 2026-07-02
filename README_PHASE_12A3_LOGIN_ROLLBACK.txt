SAFFHIRE MONITORING - PHASE 12A-3 LOGIN ROLLBACK

Problem:
After Phase 12A-2, the login screen shows:
Server returned non-JSON: FUNCTION_INVOCATION_FAILED

Cause:
The Phase 12A prebuild patch modified api/index.ts during the Vercel build.
That caused the main API function to crash at runtime.

Fix:
- Removes the prebuild script from package.json.
- Removes Phase 12A script from index.html.
- Disables public/phase12a-tazworks-sync.js.
- Keeps package.json type=module because that fixed the ES module runtime issue.
- Keeps .vercelignore to avoid Hobby plan function-limit problems.

Files included:
- package.json
- .vercelignore
- index.html
- public/phase12a-tazworks-sync.js
- README_PHASE_12A3_LOGIN_ROLLBACK.txt

SQL needed:
No.

Vercel ENV needed:
No.

What to test:
1. Upload these files.
2. Redeploy Vercel.
3. Hard refresh.
4. Login.

Expected:
- Login works again.
- The TazWorks manual sync panel is temporarily disabled.

Next:
Build Phase 12A again without using a prebuild patch. The safer option is to directly replace api/index.ts after reading the current repo file, or create one internal path inside the existing working api/index.ts only.
