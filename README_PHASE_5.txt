SAFFHIRE MONITORING - PHASE 5 DIRECT EMAIL SENDING

What this phase adds:
- Direct email sending for Safety Performance Reports
- New Send Direct button on each Safety Performance row
- Review modal before sending
- Uses Resend API from Vercel serverless API
- Marks the report Emp Sent after successful send
- Adds a 5-day follow-up date if blank
- Keeps existing draft/copy workflow

Files included:
- index.html
- api/send-safety-email.ts
- public/phase4b.js
- public/phase4c.js
- public/phase4d.js
- public/phase5.js
- README_PHASE_5.txt

SQL needed:
No.

Vercel ENV needed:
YES.

Required:
RESEND_API_KEY
SAFETY_FROM_EMAIL

Optional:
SAFETY_REPLY_TO_EMAIL

Important:
The from email must be verified in Resend.

Install:
1. Upload these files over the existing project.
2. Add Vercel ENV keys.
3. Redeploy.
4. Go to Safety Performance Reports.
5. Click Send Direct on a row.
6. Review the email.
7. Click Send Email.
