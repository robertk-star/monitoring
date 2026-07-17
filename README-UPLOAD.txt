Phase 12A-92 - Client Gmail Template Selection

Upload only this file:
- public/phase6.js

What changed:
- Client Gmail now opens a template-selection popup first.
- You can choose an existing Email Settings template before Gmail opens.
- The selected template fills the Gmail subject and body.
- Template variables supported include:
  {{applicantName}}
  {{fileNumber}}
  {{previousEmployer}}
  {{clientName}}
  {{clientEmail}}
  {{today}}
- The draft is copied to the clipboard before Gmail opens.

SQL: No new SQL.
ENV: No new Vercel environment variables.
