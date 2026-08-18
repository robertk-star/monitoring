begin;
set local lock_timeout = '5s';

alter table public.safety_reports
  add column if not exists "applicantEmail" text;

commit;
