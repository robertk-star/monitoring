# Data Migration Staging

Phase 1A creates the Supabase database foundation only.

Use this folder in the next phase for import scripts that pull current data from:

1. Current Manus/MySQL database tables
2. Current Google Sheets / Apps Script endpoints

Planned imports:

- `companies` from existing database
- `local_users` from existing database, preserving bcrypt password hashes when possible
- `viewer_permissions` from existing database
- `notification_emails` from existing database
- `safety_reports` from existing database
- `applicants` from DS6 monitoring sheet + med expire sheet + notes sheet
- `applicant_audit_log` starts fresh unless old history exists elsewhere
