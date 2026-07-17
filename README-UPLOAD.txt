Phase 12A-95 — Fax via Gmail Compose

Upload only:
- public/phase6.js

What changed:
- Fax FMCSA no longer sends through Resend/eFax server-side.
- Fax FMCSA now downloads the completed FMCSA PDF and opens Gmail with the eFax address, subject, and body filled in.
- You must attach the downloaded PDF in Gmail before sending.
- Uses efaxsend.com by default, with an editable eFax domain field in the fax popup.

No SQL changes.
No Vercel ENV changes.
