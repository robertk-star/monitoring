-- Phase 12A-60 - Monitoring On/Off export queue
create table if not exists monitoring_on_off_exports (
  id bigserial primary key,
  "companyId" integer not null default 1,
  "applicantId" bigint,
  "fileNumber" text not null,
  action text not null check (action in ('on', 'off')),
  "firstName" text not null default '',
  "middleName" text not null default '',
  "lastName" text not null default '',
  dob text not null default '',
  "dlNumber" text not null default '',
  "dlState" text not null default '',
  source text not null default '',
  "rawDetails" jsonb not null default '{}'::jsonb,
  "createdBy" text not null default '',
  "createdAt" timestamptz not null default now(),
  "clearedAt" timestamptz,
  "clearedBy" text
);

create index if not exists idx_monitoring_on_off_exports_open
on monitoring_on_off_exports ("companyId", action, "clearedAt", "createdAt");

create index if not exists idx_monitoring_on_off_exports_file
on monitoring_on_off_exports ("companyId", "fileNumber");
