-- Phase 12A-62 - Clean malformed DOB values in Monitoring On/Off queue
-- This removes partial/redacted DOB values like:
-- XXXX/06/21 Address:
-- The app repair route can then refill the DOB if a full DOB exists in applicant/order/TazWorks data.

update monitoring_on_off_exports
set dob = ''
where "clearedAt" is null
  and (
    dob ilike '%xx%'
    or dob ilike '%address%'
    or dob !~ '^\d{4}-\d{2}-\d{2}$'
  );

-- Optional verification
select
  "fileNumber",
  dob,
  "dlNumber",
  "dlState"
from monitoring_on_off_exports
where "clearedAt" is null
order by "createdAt" desc;
