SAFFHIRE MONITORING - PHASE 12A-24 CLIENT VIEW + CLIENT ADMIN USERS

Requested change:
Create a client view and client admin to add users.

What changed:
1. Client View
- Adds a CLIENT sidebar section.
- Adds Client View page.
- Shows company-scoped Monitoring summary.
- Shows company-scoped Safety Performance summary.
- Shows recent Monitoring records.
- Shows recent Safety Performance reports.

2. Client Admin
- Adds Client Admin page.
- Add client users.
- Edit display name.
- Change role.
- Activate/deactivate users.
- Reset temporary password.
- Delete client users.

3. Roles
Adds app support for:
- client_admin
- client_user

Existing roles still work:
- admin
- user
- viewer

4. Security / company scope
- Client users are scoped to their companyId.
- Client admins can manage users only for their company.
- Client admins cannot create system admin users.
- System admins can create client_admin, client_user, viewer, or user accounts.
- Applicant and Safety Performance company selection is tightened so non-admin users cannot pull another company by changing companyId.

Files included:
- api/index.ts
- index.html
- public/phase12a24-client-view-admin.js
- supabase/migrations/20260703_phase12a24_client_roles.sql
- existing Phase 12A-23 files
- README_PHASE_12A24_CLIENT_VIEW_ADMIN_USERS.txt

SQL needed:
Optional.
Run:
supabase/migrations/20260703_phase12a24_client_roles.sql

It is a safe no-op if local_users.role is already text.

Vercel ENV needed:
No new ENV.

What to test:
1. Upload and redeploy.
2. Hard refresh.
3. Login as admin.
4. Confirm sidebar shows CLIENT section.
5. Open Client View.
6. Confirm summaries load.
7. Open Client Admin.
8. Add a client user.
9. Log in as that client user.
10. Confirm they only see their company data.
11. Log in as client_admin.
12. Confirm they can add client users, but not system admins.
