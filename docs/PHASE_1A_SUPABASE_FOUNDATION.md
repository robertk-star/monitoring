# Phase 1A — Supabase/PostgreSQL Foundation

This build converts the database foundation from MySQL/Manus to Supabase/PostgreSQL.

## What changed

- Drizzle schema moved from `drizzle-orm/mysql-core` to `drizzle-orm/pg-core`.
- Database driver changed from `mysql2` to `pg` / `drizzle-orm/node-postgres`.
- `drizzle.config.ts` now uses `dialect: "postgresql"` and outputs future migrations to `drizzle/supabase`.
- Legacy MySQL migrations were moved to `drizzle/legacy-mysql` so Postgres migrations do not try to run MySQL SQL.
- Added new Supabase monitoring tables:
  - `applicants`
  - `applicant_audit_log`
- Removed Google Sheet URL columns from the real `companies` table.
- Added temporary compatibility output for old UI fields so the current Settings page does not break before the UI cleanup phase.
- Added `scripts/create-admin-user.mjs` for creating/updating the first admin login.
- Excluded Manus private runtime artifacts from the delivery ZIP.

## Supabase setup

1. Create a Supabase project.
2. Go to Project Settings → Database → Connection string.
3. Copy the URI connection string.
4. Add it to `.env.local` as `DATABASE_URL`.
5. Open Supabase SQL Editor.
6. Run `drizzle/supabase/0001_phase_1a_supabase_foundation.sql`.
7. Create the first admin user:

```bash
DATABASE_URL="postgresql://..." node scripts/create-admin-user.mjs robert "temporary-password-here" "Robert"
```

## Important note

The Monitoring screen still reads from Google Sheets in this phase. Phase 1A only creates the Supabase foundation and moves the codebase toward PostgreSQL. The actual Monitoring read/write switch happens in Phase 2A/2B after the data import phase.
