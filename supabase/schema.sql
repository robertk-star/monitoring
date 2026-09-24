-- SaffHire Monitoring clean Supabase schema

create extension if not exists pgcrypto;

do $$ begin
  create type local_user_role as enum ('admin', 'user', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type monitor_status as enum ('On', 'Off');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type safety_report_status as enum ('S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed');
exception when duplicate_object then null;
end $$;

create table if not exists companies (
  id serial primary key,
  name varchar(255) not null,
  slug varchar(128) not null unique,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

insert into companies (name, slug)
values ('Driver Pipeline', 'driver-pipeline')
on conflict (slug) do nothing;

create table if not exists local_users (
  id serial primary key,
  username varchar(64) not null unique,
  "passwordHash" varchar(255) not null,
  "displayName" text,
  role local_user_role not null default 'user',
  "companyId" integer references companies(id) on delete set null,
  "isActive" boolean not null default true,
  "mustChangePassword" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "lastSignedIn" timestamptz
);

create index if not exists local_users_company_id_idx on local_users ("companyId");

create table if not exists applicants (
  id serial primary key,
  "companyId" integer not null references companies(id) on delete cascade,
  "fileNumber" varchar(64) not null,
  "applicantName" varchar(255) not null default '',
  "orderDate" varchar(32) not null default '',
  "monitorStatus" monitor_status not null default 'Off',
  "mvrStatus" varchar(255) not null default '',
  "medExpire" varchar(32),
  "medExpireOverridden" boolean not null default false,
  notes varchar(2000) not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint applicants_file_number_company_unique unique ("fileNumber", "companyId")
);

create index if not exists applicants_company_id_idx on applicants ("companyId");
create index if not exists applicants_monitor_status_idx on applicants ("monitorStatus");
create index if not exists applicants_file_number_idx on applicants ("fileNumber");

create table if not exists applicant_audit_log (
  id serial primary key,
  "companyId" integer not null references companies(id) on delete cascade,
  "applicantId" integer not null references applicants(id) on delete cascade,
  "fieldName" varchar(128) not null,
  "oldValue" text,
  "newValue" text,
  "changedBy" integer references local_users(id) on delete set null,
  "changedAt" timestamptz not null default now()
);

create table if not exists safety_reports (
  id serial primary key,
  "companyId" integer not null default 1 references companies(id) on delete cascade,
  "applicantName" varchar(255) not null default '',
  "fileNumber" varchar(64) not null default '',
  created varchar(32) not null default '',
  status safety_report_status not null default 'S1 Complete',
  "followUpDate" varchar(32) not null default '',
  notes varchar(1000) not null default '',
  "lastEmailed" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint safety_reports_file_number_company_unique unique ("fileNumber", "companyId")
);

create table if not exists notification_emails (
  id serial primary key,
  label varchar(128) not null default '',
  email varchar(320) not null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);


create table if not exists safety_report_documents (
  id serial primary key,
  "companyId" integer not null references companies(id) on delete cascade,
  "reportId" integer not null references safety_reports(id) on delete cascade,
  "fileName" text not null,
  "contentType" text not null default 'application/pdf',
  "fileSize" integer not null default 0,
  "contentBase64" text not null,
  "uploadedBy" integer references local_users(id) on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists safety_report_documents_report_idx on safety_report_documents ("companyId", "reportId");
