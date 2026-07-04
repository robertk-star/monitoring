-- Phase 12A-61 - Clean malformed DL numbers in Monitoring On/Off queue
-- Example bad value:
-- 173221566LicenseStateCOFullNameRIVASMARQUEZROBERTO...
-- This keeps only the real DL number before the next label.

update monitoring_on_off_exports
set "dlNumber" = trim(regexp_replace(
  "dlNumber",
  '(LicenseState|FullName|DOB|DateOfBirth|Address|LicenseClass|LicenseStatus|ExpirationDate|IssueDate|State|Class|Type|Status|Date of Birth|Expiration|Issue).*$',
  '',
  'i'
))
where "clearedAt" is null
  and "dlNumber" ~* '(LicenseState|FullName|DOB|DateOfBirth|Address|LicenseClass|LicenseStatus|ExpirationDate|IssueDate)';

-- Optional verification
select
  "fileNumber",
  "dlNumber",
  "dlState"
from monitoring_on_off_exports
where "clearedAt" is null
order by "createdAt" desc;
