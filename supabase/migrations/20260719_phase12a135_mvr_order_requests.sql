-- Phase 12A-135
-- Client portal Order MVR request audit log.

create table if not exists public.mvr_order_requests (
  id bigserial primary key,
  "companyId" integer not null,
  "applicantId" integer not null,
  "fileNumber" text not null default '',
  "applicantName" text not null default '',
  "previousMvrStatus" text not null default '',
  status text not null default 'requested',
  "requestedByUserId" bigint,
  "requestedBy" text not null default '',
  "requestedAt" timestamptz not null default now(),
  "completedAt" timestamptz,
  "notificationStatus" text not null default 'pending',
  "notificationMessage" text not null default '',
  "updatedAt" timestamptz not null default now()
);

create index if not exists mvr_order_requests_company_date_idx
  on public.mvr_order_requests ("companyId", "requestedAt" desc);

create index if not exists mvr_order_requests_applicant_idx
  on public.mvr_order_requests ("companyId", "applicantId", status);

comment on table public.mvr_order_requests is
  'Audit log of MVR order requests submitted from the client Monitoring portal.';
