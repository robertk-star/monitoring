# Database Migration Guide

This app now uses Supabase as the monitoring data source. Do not use Google Sheets as a data source for this app.

Run these scripts from your computer, not inside Vercel. Do not commit real applicant data to GitHub.

## Required local environment variables

Create a local `.env` file or export these in your terminal:

```bash
DATABASE_URL="your Supabase PostgreSQL connection string"
JWT_SECRET="same value used in Vercel"
MIGRATION_COMPANY_SLUG="driver-pipeline"
MIGRATION_COMPANY_NAME="Driver Pipeline"
```

## Import Monitoring data from a local backup file

Place your local backup export in:

```text
migration/data/monitoring-backup.json
```

Dry run first:

```bash
npm run migrate:monitoring -- --source migration/data/monitoring-backup.json --dry-run
```

Then import:

```bash
npm run migrate:monitoring -- --source migration/data/monitoring-backup.json
```

This upserts into the `applicants` table using:

```text
fileNumber + companyId
```

The script merges by file number:

- monitoring rows become applicant rows
- notes become `applicants.notes`
- med expire rows become `applicants.medExpire`
- `medExpireOverridden` is true when the med expire came from an override source

## Import Safety Performance reports

Place your local safety report export in:

```text
migration/data/safety-reports.json
```

Dry run:

```bash
npm run migrate:safety -- --source migration/data/safety-reports.json --dry-run
```

Then import:

```bash
npm run migrate:safety -- --source migration/data/safety-reports.json
```

This upserts into `safety_reports` using:

```text
fileNumber + companyId
```

## Notes

- `applicant_audit_log` starts fresh. We are not creating fake audit history during import.
- Run imports after the Phase 1A Supabase SQL has been applied.
- If a row has no file number, it is skipped.
- Duplicate file numbers are removed during import; the first row wins.
