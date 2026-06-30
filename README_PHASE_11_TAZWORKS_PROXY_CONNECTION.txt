SAFFHIRE MONITORING - PHASE 11 TAZWORKS PROXY CONNECTION TEST

Purpose:
Test read-only TazWorks order access through the existing SaffHire fixed-IP proxy before tying it into Monitoring or Safety Performance.

Security rules followed:
- The browser never calls tazworks-proxy.saffhire.com directly.
- The TazWorks proxy secret is never exposed to the browser.
- Client GUID comes only from Vercel ENV.
- Read-only GET routes only.
- No POST/PUT/PATCH/DELETE to TazWorks.
- Safe UI messages are used for authorization/connection failures.

Required Vercel ENV:
TAZWORKS_PROXY_BASE_URL=https://tazworks-proxy.saffhire.com
TAZWORKS_PROXY_SECRET=<proxy secret from SaffHire DigitalOcean proxy>
TAZWORKS_CLIENT_GUID=<specific client GUID this dashboard is allowed to access>

Internal API routes added:
- GET /api/orders
- GET /api/orders?page=0&size=10&fileNumber=<fileNumber>
- GET /api/orders/[orderGuid]/searches
- GET /api/orders/[orderGuid]/searches/[searchGuid]/results?resultType=EDITOR

Files included:
- index.html
- api/orders.ts
- api/orders/[orderGuid]/searches.ts
- api/orders/[orderGuid]/searches/[searchGuid]/results.ts
- public/phase11-tazworks-connection.js
- README_PHASE_11_TAZWORKS_PROXY_CONNECTION.txt

SQL needed:
No.

Vercel ENV needed:
Yes:
- TAZWORKS_PROXY_BASE_URL
- TAZWORKS_PROXY_SECRET
- TAZWORKS_CLIENT_GUID

Where to test:
Settings -> TazWorks Proxy Connection Test

What to test:
1. Add the Vercel ENV values.
2. Redeploy.
3. Go to Settings.
4. Click Load Recent Orders.
5. Optional: enter a file number and load again.
6. Click Searches on an order.
7. Click Result on a search.

Safe errors:
- NOT_AUTHORIZED -> “Order access could not be verified.”
- fetch/network failure -> “The order connection is currently unavailable.”
