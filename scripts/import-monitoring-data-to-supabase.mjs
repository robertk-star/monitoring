import "dotenv/config";
import {
  createPool,
  normalizeFileNumber,
  normalizeMonitorStatus,
  parseArgs,
  pickFirst,
  readJsonFile,
  resolveCompanyId,
} from "./migration-utils.mjs";

function buildLookup(rows, fileKeys, valueKeys) {
  const map = new Map();
  for (const row of rows) {
    const fileNumber = normalizeFileNumber(pickFirst(row, fileKeys));
    if (!fileNumber) continue;
    const value = pickFirst(row, valueKeys);
    if (value) map.set(fileNumber, value);
  }
  return map;
}

function normalizeApplicantRow(row, lookups) {
  const fileNumber = normalizeFileNumber(
    pickFirst(row, ["fileNumber", "File #", "File Number", "file_number", "FileNumber"])
  );
  if (!fileNumber) return null;

  const medExpireOverride = lookups.medExpire.get(fileNumber) || "";
  const medCert = lookups.medCerts.get(fileNumber) || "";

  return {
    fileNumber,
    applicantName: pickFirst(row, ["name", "Name", "applicantName", "Applicant Name", "ApplicantName"]),
    orderDate: pickFirst(row, ["orderDate", "Order Date", "created", "Created"]),
    monitorStatus: normalizeMonitorStatus(pickFirst(row, ["monitorStatus", "Monitor Status", "Status", "value"])),
    mvrStatus: pickFirst(row, ["mvrStatus", "MVR Status"], ""),
    medExpire: medExpireOverride || medCert || null,
    medExpireOverridden: Boolean(medExpireOverride),
    notes: lookups.notes.get(fileNumber) || pickFirst(row, ["notes", "Notes"], ""),
  };
}

function loadSource(args) {
  if (!args.source) {
    throw new Error("Provide --source migration/data/monitoring-backup.json. This importer does not read from Google Sheets.");
  }

  const payload = readJsonFile(args.source);
  return {
    applicants: payload.applicants?.rows ?? payload.applicants ?? payload.rows ?? payload.data ?? [],
    notes: payload.notes?.rows ?? payload.notes ?? [],
    medExpire: payload.medExpire?.rows ?? payload.medExpire ?? [],
    medCerts: payload.medCerts?.rows ?? payload.medCerts ?? [],
  };
}

async function upsertApplicant(pool, companyId, applicant) {
  const result = await pool.query(
    `insert into applicants (
      "companyId", "fileNumber", "applicantName", "orderDate", "monitorStatus",
      "mvrStatus", "medExpire", "medExpireOverridden", notes, "updatedAt"
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    on conflict ("fileNumber", "companyId") do update set
      "applicantName" = excluded."applicantName",
      "orderDate" = excluded."orderDate",
      "monitorStatus" = excluded."monitorStatus",
      "mvrStatus" = excluded."mvrStatus",
      "medExpire" = excluded."medExpire",
      "medExpireOverridden" = excluded."medExpireOverridden",
      notes = excluded.notes,
      "updatedAt" = now()
    returning id`,
    [
      companyId,
      applicant.fileNumber,
      applicant.applicantName,
      applicant.orderDate,
      applicant.monitorStatus,
      applicant.mvrStatus,
      applicant.medExpire,
      applicant.medExpireOverridden,
      applicant.notes,
    ]
  );
  return result.rows[0].id;
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const source = loadSource(args);

  const lookups = {
    notes: buildLookup(source.notes, ["fileNumber", "File #", "File Number"], ["notes", "Notes"]),
    medExpire: buildLookup(source.medExpire, ["fileNumber", "File #", "File Number"], ["medExpire", "Exp Date", "Med Expire", "Expiration Date"]),
    medCerts: buildLookup(source.medCerts, ["File #", "fileNumber", "File Number"], ["Exp Date", "medExpire", "Med Expire", "Expiration Date"]),
  };

  const applicants = source.applicants
    .map((row) => normalizeApplicantRow(row, lookups))
    .filter(Boolean);

  const seen = new Set();
  const deduped = [];
  for (const applicant of applicants) {
    if (seen.has(applicant.fileNumber)) continue;
    seen.add(applicant.fileNumber);
    deduped.push(applicant);
  }

  console.log(`Rows found: ${source.applicants.length}`);
  console.log(`Applicants normalized: ${applicants.length}`);
  console.log(`Applicants after duplicate removal: ${deduped.length}`);
  console.log(`Notes matched: ${lookups.notes.size}`);
  console.log(`Med expire overrides matched: ${lookups.medExpire.size}`);
  console.log(`Med cert dates matched: ${lookups.medCerts.size}`);

  if (dryRun) {
    console.log("Dry run only. No database writes made.");
    console.log(JSON.stringify(deduped.slice(0, 5), null, 2));
    return;
  }

  const pool = createPool();
  try {
    const companyId = await resolveCompanyId(pool, {
      companyId: args["company-id"],
      companySlug: args["company-slug"],
      companyName: args["company-name"],
    });

    let imported = 0;
    for (const applicant of deduped) {
      await upsertApplicant(pool, companyId, applicant);
      imported++;
    }

    console.log(`Imported applicants into companyId=${companyId}: ${imported}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Monitoring import failed:", error);
  process.exit(1);
});
