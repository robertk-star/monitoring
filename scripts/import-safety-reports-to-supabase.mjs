import "dotenv/config";
import {
  cleanString,
  createPool,
  normalizeFileNumber,
  parseArgs,
  pickFirst,
  readJsonFile,
  resolveCompanyId,
} from "./migration-utils.mjs";

const boolKeys = new Set([
  "vehicleStraightTruck",
  "vehicleTractorSemitrailer",
  "vehicleBus",
  "vehicleCargoTank",
  "vehicleDoublesTriples",
  "vehicleOther",
  "dotAlcoholTestPositive",
  "dotDrugTestPositive",
  "dotRefusedTest",
  "dotOtherViolations",
]);

const textFields = [
  "applicantName",
  "fileNumber",
  "created",
  "status",
  "followUpDate",
  "notes",
  "prevEmployerName",
  "prevEmployerEmail",
  "prevEmployerStreet",
  "prevEmployerPhone",
  "prevEmployerFax",
  "prevEmployerCityStateZip",
  "employerName",
  "employerAttention",
  "employerStreet",
  "employerCityStateZip",
  "employerPhone",
  "employerFax",
  "employerEmail",
  "confFax",
  "confEmail",
  "employedByCompany",
  "jobTitle",
  "fromDate",
  "toDate",
  "droveMotorVehicle",
  "accidentHistory",
  "accidentDate1",
  "accidentLocation1",
  "accidentInjuries1",
  "accidentFatalities1",
  "accidentHazmat1",
  "accidentDate2",
  "accidentLocation2",
  "accidentInjuries2",
  "accidentFatalities2",
  "accidentHazmat2",
  "accidentDate3",
  "accidentLocation3",
  "accidentInjuries3",
  "accidentFatalities3",
  "accidentHazmat3",
  "otherAccidents",
  "dotCompany",
  "dotEmployee",
  "infoReceivedFrom",
  "infoReceivedDate",
];

const allowedStatuses = new Set(["S1 Complete", "Emp Sent", "Emp Complete", "Completed"]);

function toBool(value) {
  const text = cleanString(value).toLowerCase();
  return ["true", "yes", "y", "1", "checked", "on"].includes(text);
}

function normalizeSafetyReport(row) {
  const fileNumber = normalizeFileNumber(
    pickFirst(row, ["fileNumber", "File #", "File Number", "file_number", "FileNumber"])
  );
  if (!fileNumber) return null;

  const report = {};
  for (const field of textFields) {
    report[field] = cleanString(row[field]);
  }

  report.fileNumber = fileNumber;
  report.applicantName = report.applicantName || pickFirst(row, ["Applicant Name", "Name", "name"]);
  report.status = allowedStatuses.has(report.status) ? report.status : "S1 Complete";

  for (const field of boolKeys) {
    report[field] = toBool(row[field]);
  }

  return report;
}

async function upsertSafetyReport(pool, companyId, report) {
  const fields = [
    "companyId",
    ...textFields,
    ...Array.from(boolKeys),
    "updatedAt",
  ];

  const columnList = fields.map((field) => field === "companyId" || field === "updatedAt" ? `"${field}"` : `"${field}"`).join(", ");
  const values = [companyId, ...textFields.map((field) => report[field] ?? ""), ...Array.from(boolKeys).map((field) => Boolean(report[field]))];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updateFields = [...textFields.filter((field) => field !== "fileNumber"), ...Array.from(boolKeys)]
    .map((field) => `"${field}" = excluded."${field}"`)
    .join(",\n      ");

  await pool.query(
    `insert into safety_reports (${columnList})
     values (${placeholders}, now())
     on conflict ("fileNumber", "companyId") do update set
      ${updateFields},
      "updatedAt" = now()`,
    values
  );
}

function rowsFromSource(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.safetyReports)) return payload.safetyReports;
  if (Array.isArray(payload?.safety_reports)) return payload.safety_reports;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const sourcePath = args.source;
  if (!sourcePath) {
    throw new Error("Provide --source migration/data/safety-reports.json");
  }

  const rows = rowsFromSource(readJsonFile(sourcePath));
  const normalized = rows.map(normalizeSafetyReport).filter(Boolean);

  const seen = new Set();
  const deduped = [];
  for (const report of normalized) {
    if (seen.has(report.fileNumber)) continue;
    seen.add(report.fileNumber);
    deduped.push(report);
  }

  console.log(`Safety rows found: ${rows.length}`);
  console.log(`Safety rows normalized: ${normalized.length}`);
  console.log(`Safety rows after duplicate removal: ${deduped.length}`);

  if (dryRun) {
    console.log("Dry run only. No database writes made.");
    console.log(JSON.stringify(deduped.slice(0, 3), null, 2));
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
    for (const report of deduped) {
      await upsertSafetyReport(pool, companyId, report);
      imported++;
    }
    console.log(`Imported safety reports into companyId=${companyId}: ${imported}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Safety report import failed:", error);
  process.exit(1);
});
