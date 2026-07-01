SAFFHIRE MONITORING - PHASE 11E LOGIN FIX

Problem:
Phase 11D broke login because api/[...path].ts only handled TazWorks order routes.
That caused /api/auth/login to fail with FUNCTION_INVOCATION_FAILED.

Fix:
- api/[...path].ts now handles only /api/orders routes itself.
- All other API routes are delegated back to api/index.ts.
- Login should work again.
- TazWorks order routes stay in the existing catch-all function, so no new Serverless Functions are added.
- .vercelignore keeps old api/orders files out of Vercel deployment.

Files included:
- .vercelignore
- api/[...path].ts
- README_PHASE_11E_LOGIN_FIX.txt

SQL needed:
No.

Vercel ENV needed:
No new ENV.

Still needed for TazWorks:
- TAZWORKS_PROXY_BASE_URL=https://tazworks-proxy.saffhire.com
- TAZWORKS_PROXY_SECRET
- TAZWORKS_CLIENT_GUID

Test:
1. Redeploy.
2. Login.
3. Go to Settings.
4. Click Load Recent Orders in TazWorks Proxy Connection Test.
