SAFFHIRE MONITORING - PHASE 11J ES MODULE RUNTIME FIX

Problem:
Vercel function log says:
Failed to load the ES module: /var/task/api/index.js
Make sure to set "type": "module" in the nearest package.json

Cause:
api/index.ts uses ES module import syntax.
At runtime, Vercel is trying to load the compiled function without package.json declaring module mode.

Fix:
Adds this to package.json:
"type": "module"

Files included:
- package.json
- .vercelignore
- README_PHASE_11J_ES_MODULE_RUNTIME_FIX.txt

SQL needed:
No.

Vercel ENV needed:
No new ENV.

Important:
Keep Build Command in Vercel as:
npm run build

What to test:
1. Upload package.json and .vercelignore.
2. Redeploy.
3. Try logging in.
4. If it still fails, send the next full api/index function log.
