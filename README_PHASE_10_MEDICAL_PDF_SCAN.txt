SAFFHIRE MONITORING - PHASE 10 MEDICAL PDF UPLOAD & SCAN

What this phase adds:
- Admin-only Medical PDF Upload & Scan panel in Settings
- Upload PDFs into the database
- Store PDF bytes in Postgres
- Scan uploaded PDFs for medical expiration dates
- Match PDFs to Monitoring applicants by:
  1. File number in the filename
  2. File number in PDF text
  3. Applicant name in PDF text
- Update Monitoring page Medical Expire date automatically
- Track scan results in a PDF status table

Files included:
- index.html
- package.json
- api/pdf-medical.ts
- public/phase10-medical-pdfs.js
- migrations/phase10_medical_pdf_uploads.sql
- README_PHASE_10_MEDICAL_PDF_SCAN.txt

SQL needed:
Recommended yes:
Run migrations/phase10_medical_pdf_uploads.sql in Supabase.

The API also tries to create the table automatically if it is missing.

Vercel ENV needed:
No new ENV.

Uses existing:
- DATABASE_URL
- JWT_SECRET

New package dependency:
- pdf-parse

Important limits:
- Upload PDFs under 6MB each.
- Best results happen when the PDF filename includes the SaffHire file number.
  Example: 5060-medical-card.pdf
- Scanned image-only PDFs may not work unless the PDF contains selectable text.
  OCR can be added in a later phase if needed.

How to test:
1. Upload ZIP files over the current project.
2. Run the SQL migration in Supabase if you want to create the table manually.
3. Redeploy Vercel.
4. Go to Settings.
5. Find Medical PDF Upload & Scan.
6. Upload one or more medical PDFs.
7. Click Scan PDFs & Update Monitoring.
8. Go to Monitoring.
9. Click Refresh.
10. Confirm Med Expire dates updated for matched applicants.

Recommended next phase:
Phase 10B - OCR fallback for scanned/image-only PDFs.
