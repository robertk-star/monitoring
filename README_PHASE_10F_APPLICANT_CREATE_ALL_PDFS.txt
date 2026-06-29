SAFFHIRE MONITORING - PHASE 10F APPLICANT NAME + CREATE ALL PDF RECORDS

Changes requested:
1. Applicant name is in the PDF Application Information section on the APPLICANT line.
2. Do not write internal scan notes to the Monitoring Notes field.
3. Create a Monitoring record for every PDF with a file number, even if no medical expiration date is found.
4. If a medical expiration date is found, fill Med Expire.
5. If no medical expiration date is found, leave Med Expire blank.

What this phase does:
- Extracts applicant name from lines like:
  APPLICANT HARRISON JR, DOY ALPHONZO  SSN XXX-XX-4182
- Extracts file number from TazWorks filename:
  report_6340.pdf
- Creates/updates Monitoring records without writing to Notes.
- Creates a record even if no Medical Certificate Expiration Date is found.
- Leaves Med Expire blank when no expiration date is found.
- Uses REVIEW NAME NEEDED only when file number exists but no applicant name can be extracted.

Files included:
- api/pdf-medical.ts
- README_PHASE_10F_APPLICANT_CREATE_ALL_PDFS.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload these files over the current project.
2. Redeploy Vercel.
3. Go to Settings.
4. Click Rescan All or Create/Update Monitoring from PDFs.
5. Go to Monitoring.
6. Click Refresh.
7. Confirm records are created for PDFs even when Med Expire is blank.
8. Confirm Notes are not populated by the scan.

Important:
If the PDF is image-only and has no selectable text, OCR will still be needed.
