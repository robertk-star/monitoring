# Phase 12A-120 — Client Portal Review + User Admin

Upload these files:

- `api/index.ts`
- `public/client-login.html`
- `public/client-portal.html`
- `supabase/migrations/20260718_phase12a120_client_portal_roles.sql`

## SQL
Run the migration file in Supabase if the `local_users.role` column has not already been changed to support client roles.

The migration is safe to run more than once.

## What to test

1. Go to `/client-login.html`.
2. Log in as a user assigned to a company.
3. Confirm Dashboard loads.
4. Confirm Monitoring loads only that company’s records.
5. Confirm Safety Reports loads only that company’s reports.
6. Log in as `client_admin`.
7. Confirm User Admin appears.
8. Add a client user.
9. Reset that user’s password.
10. Deactivate/reactivate that user.
11. Confirm a normal `client_user` does not see User Admin.
12. Confirm a `viewer` cannot edit Monitoring.

## ENV
No new Vercel environment variables are needed.
