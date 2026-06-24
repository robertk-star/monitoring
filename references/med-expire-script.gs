/**
 * SaffHire Med Expire Google Apps Script
 * ----------------------------------------
 * Attach this to your "DP Medical Expire Dates" Google Sheet.
 *
 * Sheet structure:
 *   Column A — File #
 *   Column B — Exp Date  (original, never overwritten by this script)
 *   Column C — Overwrite (manually set dates from the dashboard)
 *
 * Endpoints:
 *   GET  /exec                     → returns all rows; if column C has a value, that date is returned as medExpire
 *   POST /exec { action: "overwrite" | "upsert", fileNumber, medExpire }
 *                                  → writes the new date to column C in the matching row as plain text
 *   GET  /exec?action=ping         → health check
 *
 * Deploy:
 *   Extensions → Apps Script → paste this file → Deploy → New deployment
 *   Execute as: Me | Who has access: Anyone
 *
 * IMPORTANT: After pasting, go to Deploy → Manage deployments → Edit → New version → Deploy
 */

// ─── Spreadsheet ID — open by ID so this works as a standalone Web App ───────
var SPREADSHEET_ID = "1yaz2Ho09KyoPxppNPutJWjD9ztuK1X377r9IO9l6FYM";

function getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getActiveSheet();
}

// ─── GET: Return all rows, preferring column C over column B ─────────────────

function doGet(e) {
  if (e.parameter.action === "ping") {
    return jsonResponse({ status: "ok", message: "Med Expire Script is running" });
  }

  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return jsonResponse({ status: "ok", data: [] });
    }

    // Read columns A, B, C in one call for efficiency
    var range = sheet.getRange(2, 1, lastRow - 1, 3);
    var values = range.getValues();

    var data = [];
    for (var i = 0; i < values.length; i++) {
      var fileNumber = String(values[i][0]).trim();
      var rawExpDate  = values[i][1];
      var rawOverwrite = values[i][2];

      if (!fileNumber || fileNumber === "") continue;

      var expDate   = formatDateValue(rawExpDate);
      var overwrite = formatDateValue(rawOverwrite);

      // Prefer column C (Overwrite) if it has a value; otherwise use column B
      var displayDate = (overwrite && overwrite !== "") ? overwrite : expDate;

      data.push({
        fileNumber:   fileNumber,
        medExpire:    displayDate,
        originalDate: expDate,
        overwrite:    overwrite || "",
        lastUpdated:  ""
      });
    }

    return jsonResponse({ status: "ok", data: data });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ─── POST: Write overwrite date to column C as plain text ────────────────────

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === "overwrite" || action === "upsert") {
      return handleOverwrite(payload);
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ─── Write to column C (Overwrite) as plain text ─────────────────────────────

function handleOverwrite(payload) {
  var fileNumber = String(payload.fileNumber || "").trim();
  var medExpire  = String(payload.medExpire  || "").trim();

  if (!fileNumber) {
    return jsonResponse({ status: "error", message: "fileNumber is required" });
  }

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return jsonResponse({ status: "error", message: "Sheet has no data rows" });
  }

  // Search column A for the matching file number
  var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRow = -1;

  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === fileNumber) {
      targetRow = i + 2; // +2 because data starts at row 2 (row 1 is header)
      break;
    }
  }

  if (targetRow === -1) {
    // File number not found — append a new row with the overwrite date as plain text
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1).setValue(fileNumber);
    sheet.getRange(newRow, 3).setNumberFormat("@");
    sheet.getRange(newRow, 3).setValue(medExpire);
    return jsonResponse({ status: "ok", action: "appended", fileNumber: fileNumber, overwrite: medExpire });
  }

  // Force column C to store as plain text (not a Date object)
  var cell = sheet.getRange(targetRow, 3);
  cell.setNumberFormat("@");   // "@" = plain text format in Google Sheets
  cell.setValue(medExpire);

  return jsonResponse({ status: "ok", action: "updated", fileNumber: fileNumber, row: targetRow, overwrite: medExpire });
}

// ─── Helper: format a cell value as MM/DD/YYYY string ────────────────────────

function formatDateValue(val) {
  if (!val || val === "") return "";

  // If it's already a string in MM/DD/YYYY format, return as-is
  if (typeof val === "string") {
    var trimmed = val.trim();
    if (trimmed === "" || trimmed === "undefined") return "";
    return trimmed;
  }

  // If Google Sheets returned a Date object, format it as MM/DD/YYYY
  if (val instanceof Date) {
    var month = val.getMonth() + 1;
    var day   = val.getDate();
    var year  = val.getFullYear();
    if (year < 1900) return ""; // empty/zero date
    return (month < 10 ? "0" + month : month) + "/" +
           (day   < 10 ? "0" + day   : day)   + "/" +
           year;
  }

  return String(val).trim();
}

// ─── Helper: JSON response ────────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
