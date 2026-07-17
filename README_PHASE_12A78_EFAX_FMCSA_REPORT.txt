SAFFHIRE MONITORING - PHASE 12A-78 EFAX FMCSA REPORT FAXING

Files to upload:
- api/index.ts
- public/phase6.js

Optional SQL for fax logging:
- supabase/phase12a78_efax_fmcsa_report.sql

Vercel environment variables needed:
- RESEND_API_KEY
- EMAIL_FROM or SAFETY_FROM_EMAIL
- EMAIL_REPLY_TO or SAFETY_REPLY_TO_EMAIL (recommended)
- EFAX_SEND_DOMAIN (optional; defaults to send.efax.com)

What changed:
- Adds a Fax FMCSA button to each Safety Performance report row.
- Opens a fax modal with recipient fax number, recipient/company, and cover message.
- Generates the completed FMCSA Safety Performance PDF from the saved report.
- Sends the PDF to eFax by email using the recipient fax number plus @send.efax.com.
- Saves optional fax status fields if the SQL has been run.

Notes:
- The sender email must be allowed/approved on the user's eFax account.
- The app confirms the email was sent to eFax. Actual fax delivery confirmation is still handled by eFax email notifications.
