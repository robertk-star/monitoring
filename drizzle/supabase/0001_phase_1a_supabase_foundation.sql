-- Phase 1A: Supabase/PostgreSQL foundation for SaffHire Monitoring Dashboard
-- Run this in Supabase SQL Editor or through Drizzle after DATABASE_URL is set.

-- Enums
DO $$ BEGIN
  CREATE TYPE oauth_user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE local_user_role AS ENUM ('user', 'admin', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE monitor_status AS ENUM ('On', 'Off');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE safety_report_status AS ENUM ('S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Generic updatedAt trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Legacy OAuth compatibility table. Custom local login is still the active auth path.
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  "openId" varchar(64) NOT NULL UNIQUE,
  name text,
  email varchar(320),
  "loginMethod" varchar(64),
  role oauth_user_role NOT NULL DEFAULT 'user',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSignedIn" timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Companies no longer store Google Sheet URLs. Sheets are migration inputs only.
CREATE TABLE IF NOT EXISTS companies (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  slug varchar(128) NOT NULL UNIQUE,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Starter company used by the existing Driver Pipeline data migration.
INSERT INTO companies (name, slug)
VALUES ('Driver Pipeline', 'driver-pipeline')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS local_users (
  id serial PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE,
  "passwordHash" varchar(255) NOT NULL,
  "displayName" text,
  role local_user_role NOT NULL DEFAULT 'user',
  "companyId" integer REFERENCES companies(id) ON DELETE SET NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "mustChangePassword" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSignedIn" timestamptz
);

CREATE INDEX IF NOT EXISTS local_users_company_id_idx ON local_users ("companyId");
DROP TRIGGER IF EXISTS local_users_set_updated_at ON local_users;
CREATE TRIGGER local_users_set_updated_at
BEFORE UPDATE ON local_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS viewer_permissions (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "canViewMonitoring" boolean NOT NULL DEFAULT true,
  "canEditMonitoring" boolean NOT NULL DEFAULT false,
  "canViewSafetyPerformance" boolean NOT NULL DEFAULT true,
  "canEditSafetyPerformance" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT viewer_permissions_user_company_unique UNIQUE ("userId", "companyId")
);

CREATE INDEX IF NOT EXISTS viewer_permissions_user_id_idx ON viewer_permissions ("userId");
CREATE INDEX IF NOT EXISTS viewer_permissions_company_id_idx ON viewer_permissions ("companyId");
DROP TRIGGER IF EXISTS viewer_permissions_set_updated_at ON viewer_permissions;
CREATE TRIGGER viewer_permissions_set_updated_at
BEFORE UPDATE ON viewer_permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- New Supabase monitoring source replacing DS6 + med-expire + notes sheets.
CREATE TABLE IF NOT EXISTS applicants (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "fileNumber" varchar(64) NOT NULL,
  "applicantName" varchar(255) NOT NULL DEFAULT '',
  "orderDate" varchar(32) NOT NULL DEFAULT '',
  "monitorStatus" monitor_status NOT NULL DEFAULT 'Off',
  "mvrStatus" varchar(255) NOT NULL DEFAULT '',
  "medExpire" varchar(32),
  "medExpireOverridden" boolean NOT NULL DEFAULT false,
  notes varchar(2000) NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicants_file_number_company_unique UNIQUE ("fileNumber", "companyId")
);

CREATE INDEX IF NOT EXISTS applicants_company_id_idx ON applicants ("companyId");
CREATE INDEX IF NOT EXISTS applicants_monitor_status_idx ON applicants ("monitorStatus");
CREATE INDEX IF NOT EXISTS applicants_file_number_idx ON applicants ("fileNumber");
DROP TRIGGER IF EXISTS applicants_set_updated_at ON applicants;
CREATE TRIGGER applicants_set_updated_at
BEFORE UPDATE ON applicants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS applicant_audit_log (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "applicantId" integer NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  "fieldName" varchar(128) NOT NULL,
  "oldValue" text,
  "newValue" text,
  "changedBy" integer REFERENCES local_users(id) ON DELETE SET NULL,
  "changedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applicant_audit_log_company_id_idx ON applicant_audit_log ("companyId");
CREATE INDEX IF NOT EXISTS applicant_audit_log_applicant_id_idx ON applicant_audit_log ("applicantId");
CREATE INDEX IF NOT EXISTS applicant_audit_log_changed_by_idx ON applicant_audit_log ("changedBy");

CREATE TABLE IF NOT EXISTS safety_reports (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  "applicantName" varchar(255) NOT NULL DEFAULT '',
  "fileNumber" varchar(64) NOT NULL DEFAULT '',
  created varchar(32) NOT NULL DEFAULT '',
  status safety_report_status NOT NULL DEFAULT 'S1 Complete',
  "followUpDate" varchar(32) NOT NULL DEFAULT '',
  notes varchar(1000) NOT NULL DEFAULT '',
  "prevEmployerName" varchar(255) NOT NULL DEFAULT '',
  "prevEmployerEmail" varchar(320) NOT NULL DEFAULT '',
  "prevEmployerStreet" varchar(255) NOT NULL DEFAULT '',
  "prevEmployerPhone" varchar(64) NOT NULL DEFAULT '',
  "prevEmployerFax" varchar(64) NOT NULL DEFAULT '',
  "prevEmployerCityStateZip" varchar(255) NOT NULL DEFAULT '',
  "employerName" varchar(255) NOT NULL DEFAULT '',
  "employerAttention" varchar(255) NOT NULL DEFAULT '',
  "employerStreet" varchar(255) NOT NULL DEFAULT '',
  "employerCityStateZip" varchar(255) NOT NULL DEFAULT '',
  "employerPhone" varchar(64) NOT NULL DEFAULT '',
  "employerFax" varchar(64) NOT NULL DEFAULT '',
  "employerEmail" varchar(320) NOT NULL DEFAULT '',
  "confFax" varchar(64) NOT NULL DEFAULT '',
  "confEmail" varchar(320) NOT NULL DEFAULT '',
  "employedByCompany" varchar(255) NOT NULL DEFAULT '',
  "jobTitle" varchar(255) NOT NULL DEFAULT '',
  "fromDate" varchar(32) NOT NULL DEFAULT '',
  "toDate" varchar(32) NOT NULL DEFAULT '',
  "droveMotorVehicle" varchar(32) NOT NULL DEFAULT '',
  "vehicleStraightTruck" boolean NOT NULL DEFAULT false,
  "vehicleTractorSemitrailer" boolean NOT NULL DEFAULT false,
  "vehicleBus" boolean NOT NULL DEFAULT false,
  "vehicleCargoTank" boolean NOT NULL DEFAULT false,
  "vehicleDoublesTriples" boolean NOT NULL DEFAULT false,
  "vehicleOther" boolean NOT NULL DEFAULT false,
  "accidentHistory" varchar(32) NOT NULL DEFAULT '',
  "accidentDate1" varchar(32) NOT NULL DEFAULT '',
  "accidentLocation1" varchar(255) NOT NULL DEFAULT '',
  "accidentInjuries1" varchar(32) NOT NULL DEFAULT '',
  "accidentFatalities1" varchar(32) NOT NULL DEFAULT '',
  "accidentHazmat1" varchar(32) NOT NULL DEFAULT '',
  "accidentDate2" varchar(32) NOT NULL DEFAULT '',
  "accidentLocation2" varchar(255) NOT NULL DEFAULT '',
  "accidentInjuries2" varchar(32) NOT NULL DEFAULT '',
  "accidentFatalities2" varchar(32) NOT NULL DEFAULT '',
  "accidentHazmat2" varchar(32) NOT NULL DEFAULT '',
  "accidentDate3" varchar(32) NOT NULL DEFAULT '',
  "accidentLocation3" varchar(255) NOT NULL DEFAULT '',
  "accidentInjuries3" varchar(32) NOT NULL DEFAULT '',
  "accidentFatalities3" varchar(32) NOT NULL DEFAULT '',
  "accidentHazmat3" varchar(32) NOT NULL DEFAULT '',
  "otherAccidents" varchar(1000) NOT NULL DEFAULT '',
  "dotCompany" varchar(255) NOT NULL DEFAULT '',
  "dotEmployee" varchar(255) NOT NULL DEFAULT '',
  "dotAlcoholTestPositive" boolean NOT NULL DEFAULT false,
  "dotDrugTestPositive" boolean NOT NULL DEFAULT false,
  "dotRefusedTest" boolean NOT NULL DEFAULT false,
  "dotOtherViolations" boolean NOT NULL DEFAULT false,
  "infoReceivedFrom" varchar(255) NOT NULL DEFAULT '',
  "infoReceivedDate" varchar(32) NOT NULL DEFAULT '',
  "lastEmailed" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_reports_file_number_company_unique UNIQUE ("fileNumber", "companyId")
);

CREATE INDEX IF NOT EXISTS safety_reports_company_id_idx ON safety_reports ("companyId");
CREATE INDEX IF NOT EXISTS safety_reports_file_number_idx ON safety_reports ("fileNumber");
DROP TRIGGER IF EXISTS safety_reports_set_updated_at ON safety_reports;
CREATE TRIGGER safety_reports_set_updated_at
BEFORE UPDATE ON safety_reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS employer_form_tokens (
  id serial PRIMARY KEY,
  token varchar(128) NOT NULL UNIQUE,
  "safetyReportId" integer NOT NULL REFERENCES safety_reports(id) ON DELETE CASCADE,
  "fileNumber" varchar(64) NOT NULL,
  "applicantEmail" varchar(320) NOT NULL DEFAULT '',
  used boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS employer_form_tokens_safety_report_id_idx ON employer_form_tokens ("safetyReportId");
CREATE INDEX IF NOT EXISTS employer_form_tokens_file_number_idx ON employer_form_tokens ("fileNumber");

CREATE TABLE IF NOT EXISTS notification_emails (
  id serial PRIMARY KEY,
  label varchar(128) NOT NULL DEFAULT '',
  email varchar(320) NOT NULL UNIQUE,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS notification_emails_set_updated_at ON notification_emails;
CREATE TRIGGER notification_emails_set_updated_at
BEFORE UPDATE ON notification_emails
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
