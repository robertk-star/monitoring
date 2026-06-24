/**
 * SaffHire Safety Performance Backup — Google Apps Script
 * =========================================================
 * Deploy this script as a Web App attached to a Google Sheet.
 *
 * Sheet structure (auto-created on first push):
 *   One tab named "Safety Performance Backup"
 *   Row 1 = header row (see COLUMNS below)
 *   Row 2+ = one row per safety report, keyed by File Number
 *
 * Deployment settings:
 *   Execute as: Me
 *   Who has access: Anyone  (the dashboard server calls this URL)
 *
 * Supported actions (POST with JSON body):
 *   { action: "pushAll", reports: [...] }   — full replace/upsert of all records
 *   { action: "upsertOne", report: {...} }  — insert or update a single record
 *   { action: "deleteOne", fileNumber: "..." } — remove a row by file number
 *
 * Supported actions (GET):
 *   ?action=getAll   — returns all rows as JSON
 *   ?action=ping     — health check
 */

// ── Column definitions (order matters — matches the sheet columns) ─────────────
const COLUMNS = [
  "File Number",
  "Applicant Name",
  "Created",
  "Status",
  "Follow Up Date",
  "Notes",
  // Section 1 — Previous Employer
  "Prev Employer Name",
  "Prev Employer Email",
  "Prev Employer Street",
  "Prev Employer Phone",
  "Prev Employer Fax",
  "Prev Employer City/State/Zip",
  // Section 1 — Prospective Employer
  "Employer Name",
  "Employer Attention",
  "Employer Street",
  "Employer City/State/Zip",
  "Employer Phone",
  "Employer Fax",
  "Employer Email",
  "Conf Fax",
  "Conf Email",
  // Section 2 — Employment History
  "Employed By Company",
  "Job Title",
  "From Date",
  "To Date",
  "Drove Motor Vehicle",
  "Vehicle Straight Truck",
  "Vehicle Tractor Semitrailer",
  "Vehicle Bus",
  "Vehicle Cargo Tank",
  "Vehicle Doubles/Triples",
  "Vehicle Other",
  // Section 3 — Accidents
  "Accident History",
  "Accident Date 1",
  "Accident Location 1",
  "Accident Injuries 1",
  "Accident Fatalities 1",
  "Accident Hazmat 1",
  "Accident Date 2",
  "Accident Location 2",
  "Accident Injuries 2",
  "Accident Fatalities 2",
  "Accident Hazmat 2",
  "Accident Date 3",
  "Accident Location 3",
  "Accident Injuries 3",
  "Accident Fatalities 3",
  "Accident Hazmat 3",
  "Other Accidents",
  // Section 4 — DOT
  "DOT Company",
  "DOT Employee",
  "DOT Alcohol Test Positive",
  "DOT Drug Test Positive",
  "DOT Refused Test",
  "DOT Other Violations",
  // Section 5
  "Info Received From",
  "Info Received Date",
  // Metadata
  "Last Emailed",
  "Last Updated",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Safety Performance Backup");
  if (!sheet) {
    sheet = ss.insertSheet("Safety Performance Backup");
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    // Bold the header row
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold");
    // Auto-resize all columns
    sheet.autoResizeColumns(1, COLUMNS.length);
  }
  return sheet;
}

/** Convert a report object → array of cell values in COLUMNS order */
function reportToRow(report) {
  return [
    report.fileNumber       || "",
    report.applicantName    || "",
    report.created          || "",
    report.status           || "",
    report.followUpDate     || "",
    report.notes            || "",
    report.prevEmployerName || "",
    report.prevEmployerEmail || "",
    report.prevEmployerStreet || "",
    report.prevEmployerPhone || "",
    report.prevEmployerFax  || "",
    report.prevEmployerCityStateZip || "",
    report.employerName     || "",
    report.employerAttention || "",
    report.employerStreet   || "",
    report.employerCityStateZip || "",
    report.employerPhone    || "",
    report.employerFax      || "",
    report.employerEmail    || "",
    report.confFax          || "",
    report.confEmail        || "",
    report.employedByCompany || "",
    report.jobTitle         || "",
    report.fromDate         || "",
    report.toDate           || "",
    report.droveMotorVehicle || "",
    report.vehicleStraightTruck     ? "Yes" : "No",
    report.vehicleTractorSemitrailer ? "Yes" : "No",
    report.vehicleBus               ? "Yes" : "No",
    report.vehicleCargoTank         ? "Yes" : "No",
    report.vehicleDoublesTriples    ? "Yes" : "No",
    report.vehicleOther             ? "Yes" : "No",
    report.accidentHistory  || "",
    report.accidentDate1    || "",
    report.accidentLocation1 || "",
    report.accidentInjuries1 || "",
    report.accidentFatalities1 || "",
    report.accidentHazmat1  || "",
    report.accidentDate2    || "",
    report.accidentLocation2 || "",
    report.accidentInjuries2 || "",
    report.accidentFatalities2 || "",
    report.accidentHazmat2  || "",
    report.accidentDate3    || "",
    report.accidentLocation3 || "",
    report.accidentInjuries3 || "",
    report.accidentFatalities3 || "",
    report.accidentHazmat3  || "",
    report.otherAccidents   || "",
    report.dotCompany       || "",
    report.dotEmployee      || "",
    report.dotAlcoholTestPositive ? "Yes" : "No",
    report.dotDrugTestPositive    ? "Yes" : "No",
    report.dotRefusedTest         ? "Yes" : "No",
    report.dotOtherViolations     ? "Yes" : "No",
    report.infoReceivedFrom || "",
    report.infoReceivedDate || "",
    report.lastEmailed      || "",
    new Date().toISOString(),   // Last Updated — always stamp the current time
  ];
}

/** Build a Map of fileNumber → rowIndex (1-based) from the sheet */
function buildFileNumberIndex(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Map();
  const fileNums = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const index = new Map();
  for (let i = 0; i < fileNums.length; i++) {
    const fn = String(fileNums[i][0]).trim();
    if (fn) index.set(fn, i + 2); // +2 because row 1 is header
  }
  return index;
}

// ── GET handler ────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || "ping";

  if (action === "ping") {
    return jsonResponse({ status: "ok", message: "Safety Performance Backup script is running" });
  }

  if (action === "getAll") {
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse({ status: "ok", data: [] });

    const rows = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
    const data = rows.map((row) => {
      const obj = {};
      COLUMNS.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
    return jsonResponse({ status: "ok", data });
  }

  return jsonResponse({ status: "error", message: "Unknown GET action: " + action });
}

// ── POST handler ───────────────────────────────────────────────────────────────

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ status: "error", message: "Invalid JSON body" });
  }

  const action = body.action;

  // ── pushAll: replace the entire sheet with the provided records ─────────────
  if (action === "pushAll") {
    const reports = body.reports || [];
    const sheet = getOrCreateSheet();

    // Clear existing data rows (keep header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    if (reports.length > 0) {
      const rows = reports.map(reportToRow);
      sheet.getRange(2, 1, rows.length, COLUMNS.length).setValues(rows);
    }

    return jsonResponse({
      status: "ok",
      message: `Pushed ${reports.length} records to backup sheet`,
      count: reports.length,
    });
  }

  // ── upsertOne: insert or update a single record ─────────────────────────────
  if (action === "upsertOne") {
    const report = body.report;
    if (!report || !report.fileNumber) {
      return jsonResponse({ status: "error", message: "Missing report.fileNumber" });
    }

    const sheet = getOrCreateSheet();
    const index = buildFileNumberIndex(sheet);
    const row = reportToRow(report);

    if (index.has(report.fileNumber)) {
      // Update existing row
      const rowNum = index.get(report.fileNumber);
      sheet.getRange(rowNum, 1, 1, COLUMNS.length).setValues([row]);
      return jsonResponse({ status: "ok", message: "Updated row for " + report.fileNumber });
    } else {
      // Append new row
      sheet.appendRow(row);
      return jsonResponse({ status: "ok", message: "Inserted row for " + report.fileNumber });
    }
  }

  // ── deleteOne: remove a row by file number ──────────────────────────────────
  if (action === "deleteOne") {
    const fileNumber = body.fileNumber;
    if (!fileNumber) {
      return jsonResponse({ status: "error", message: "Missing fileNumber" });
    }

    const sheet = getOrCreateSheet();
    const index = buildFileNumberIndex(sheet);

    if (index.has(fileNumber)) {
      sheet.deleteRow(index.get(fileNumber));
      return jsonResponse({ status: "ok", message: "Deleted row for " + fileNumber });
    }
    return jsonResponse({ status: "ok", message: "Row not found for " + fileNumber + " (nothing deleted)" });
  }

  return jsonResponse({ status: "error", message: "Unknown action: " + action });
}

// ── Utility ────────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
