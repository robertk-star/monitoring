SAFFHIRE MONITORING - PHASE 11A NODE TYPES BUILD FIX

Problem:
Vercel TypeScript checks are failing because the project does not have Node type definitions available for serverless API files.

Errors seen:
- Cannot find name 'process'
- Cannot find name 'Buffer'
- Cannot find module 'fs'
- Cannot find module 'path'

Fix:
- Adds @types/node to devDependencies.
- Updates tsconfig.json to include Node types.
- Keeps existing needed dependencies:
  - pg
  - jose
  - pdf-lib
  - pdf-parse

Files included:
- package.json
- tsconfig.json
- README_PHASE_11A_NODE_TYPES_BUILD_FIX.txt

SQL needed:
No.

Vercel ENV needed:
No new ENV for this fix.

Still needed for Phase 11 connection test:
- TAZWORKS_PROXY_BASE_URL
- TAZWORKS_PROXY_SECRET
- TAZWORKS_CLIENT_GUID

Install:
1. Upload package.json and tsconfig.json over the project.
2. Redeploy Vercel.
3. Vercel should run npm install --legacy-peer-deps.
4. Confirm TypeScript errors for process, Buffer, fs, and path are gone.
