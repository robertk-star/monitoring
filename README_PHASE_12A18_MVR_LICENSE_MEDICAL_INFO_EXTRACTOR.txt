SAFFHIRE MONITORING - PHASE 12A-18 MVR LICENSE MEDICAL INFO EXTRACTOR

Correction:
Medical information is now listed under the MVR License Information result. The app must look inside the MVR/license result for the medical subsection, not ignore the full license result.

What changed:
- The extractor now scans the MVR/license result for medical subsections:
  - Medical Information
  - Medical Info
  - Medical Certificate Information
  - Certificate Information
  - Medical Certificate
  - Medical Certification
  - Medical Examiner
  - Medical Card
  - Medical Status
  - Medical Expiration
  - Med Cert
  - Med Info
  - DOT Medical
  - CDL Medical
  - Self Certification
- It extracts the expiration date from that medical subsection.
- It still rejects regular driver license expiration dates.
- It still rejects Issue Date when Issue Date is the closest label before the date.
- The /mvr-test.html page now shows better medical subsection previews and diagnostics.

Files included:
- api/index.ts
- index.html
- public/mvr-test.html
- public/phase12a17-mvr-test-link.js
- public/phase12a-tazworks-sync.js
- package.json
- .vercelignore
- supabase/migrations/20260701_phase12a_tazworks_sync.sql
- README_PHASE_12A18_MVR_LICENSE_MEDICAL_INFO_EXTRACTOR.txt

SQL needed:
No if Phase 12A SQL already ran.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Login as admin.
3. Open /mvr-test.html.
4. Pull file 6328.
5. Look at Medical/Credential preview and Date Diagnostics.
6. Run TazWorks Sync Now.
7. Confirm Med Expire uses the Medical Information expiration date, not the regular License Info expiration date.
