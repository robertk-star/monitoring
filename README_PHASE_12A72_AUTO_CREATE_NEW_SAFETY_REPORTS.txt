Phase 12A-72 — Auto-create live Safety Performance reports

Required upload files:
- api/index.ts
- public/phase6.js

Supabase SQL:
- Run supabase/phase12a72_auto_create_new_safety_reports.sql

What changed:
- Adds a Safety Performance page button: Pull New Safety Reports > 6184.
- The button scans TazWorks order pages for orders with file numbers greater than 6184.
- For each candidate order, it pulls All Search Results.
- It only creates/updates a Safety Performance report when the order includes an EMPLOYMENT_VERIFICATION search with Safety Performance / DOT Verification wording.
- If a report already exists for that file number, it updates the live fields instead of creating a duplicate.

Notes:
- This does not create reports for normal employment verification records unless the display name/value contains Safety Performance or DOT Verification.
- The button asks for host/client-guid values. Client GUID can be blank if TAZWORKS_CLIENT_GUID is already set in Vercel.
- Default scan is file number > 6184, 20 pages, 25 orders per page.
