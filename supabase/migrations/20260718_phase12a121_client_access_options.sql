-- Phase 12A-121 Client Portal Access Options
-- Adds per-client-user access controls for Dashboard, Monitoring, Safety Reports, User Admin, and Edit Monitoring.
-- Safe to run more than once.

alter table if exists public.local_users
  add column if not exists "clientAccess" jsonb not null default '{
    "dashboard": true,
    "monitoring": true,
    "safetyReports": true,
    "userAdmin": true,
    "editMonitoring": true
  }'::jsonb;

update public.local_users
set "clientAccess" = '{
    "dashboard": true,
    "monitoring": true,
    "safetyReports": true,
    "userAdmin": true,
    "editMonitoring": true
  }'::jsonb
where "clientAccess" is null;

-- Keep any existing custom values while backfilling missing keys.
update public.local_users
set "clientAccess" = '{"dashboard":true,"monitoring":true,"safetyReports":true,"userAdmin":true,"editMonitoring":true}'::jsonb || "clientAccess"
where "clientAccess" is not null;

alter table if exists public.local_users
  drop constraint if exists local_users_client_access_object;

alter table if exists public.local_users
  add constraint local_users_client_access_object
  check (jsonb_typeof("clientAccess") = 'object');
