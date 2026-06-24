/**
 * SaffHire Monitoring + Safety Performance Backup Script
 * -------------------------------------------------------
 * Deploy this as a Google Apps Script Web App attached to your backup Google Sheet.
 *
 * Setup:
 *   1. Open your backup Google Sheet → Extensions → Apps Script
 *   2. Paste this entire file, replacing any existing code
 *   3. Deploy → New deployment → Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   4. Copy the Web App URL and paste it into:
 *      Settings → Companies → Edit → "Monitoring Backup Sheet URL"
 *
 * How it works:
 *   - The dashboard sends a POST request with all current data
 *   - This script creates a new timestamped tab for each backup run
 *   - Monitoring data and Safety Performance data each get their own tab
 *   - Old tabs are kept as history (you can delete them manually if needed)
 *
 * Endpoints:
 *   POST /exec  { type: "monitoring", rows: [...] }
 *   POST /exec  { type: "safetyPerformance", rows: [...] }
 *   POST /exec  { type: "both", monitoring: [...], safetyPerformance: [...] }
 *   GET  /exec?action=ping  → health check
 */

// ─── Entry Points ────────────────────────────────────────────────────────────

function doGet(e) {
  if (e.parameter.action === "ping") {
    return jsonResponse({ status: "ok", message: "SaffHire Backup Script is running" });
  }
  return jsonResponse({ status: "error", message: "Use POST to push backup data" });
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var type = payload.type;
    var timestamp = getTimestamp();
    var results = {};

    if (type === "monitoring" || type === "both") {
      var monRows = type === "both" ? payload.monitoring : payload.rows;
      var monTab = writeMonitoringBackup(monRows, timestamp);
      results.monitoringTab = monTab;
    }

    if (type === "safetyPerformance" || type === "both") {
      var spRows = type === "both" ? payload.safetyPerformance : payload.rows;
      var spTab = writeSafetyPerformanceBackup(spRows, timestamp);
      results.safetyPerformanceTab = spTab;
    }

    if (!results.monitoringTab && !results.safetyPerformanceTab) {
      return jsonResponse({ status: "error", message: "Unknown type: " + type });
    }

    return jsonResponse({
      status: "ok",
      timestamp: timestamp,
      tabs: results
    });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ─── Monitoring Backup ────────────────────────────────────────────────────────

function writeMonitoringBackup(rows, timestamp) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = "MON " + timestamp;
  var sheet = ss.insertSheet(tabName);

  // Header row
  var headers = [
    "File Number",
    "Applicant Name",
    "Order Date",
    "Monitor Status",
    "MVR Status",
    "Med Expire",
    "Notes",
    "Backup Timestamp"
  ];
  sheet.appendRow(headers);

  // Style header
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#0F172A");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");

  // Data rows
  if (rows && rows.length > 0) {
    var dataRows = rows.map(function(r) {
      return [
        r.fileNumber || "",
        r.name || "",
        r.orderDate || "",
        r.monitorStatus || "",
        r.mvrStatus || "",
        r.medExpire || "",
        r.notes || "",
        new Date().toISOString()
      ];
    });
    sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  }

  // Auto-resize columns
  sheet.autoResizeColumns(1, headers.length);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add summary info at top
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1).setValue("SaffHire Monitoring Backup — " + timestamp + " — " + (rows ? rows.length : 0) + " records");
  sheet.getRange(1, 1, 1, headers.length).merge();
  sheet.getRange(1, 1).setBackground("#1E3A5F").setFontColor("#FFFFFF").setFontWeight("bold");

  return tabName;
}

// ─── Safety Performance Backup ────────────────────────────────────────────────

function writeSafetyPerformanceBackup(rows, timestamp) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = "SP " + timestamp;
  var sheet = ss.insertSheet(tabName);

  // Header row
  var headers = [
    "File Number",
    "Applicant Name",
    "Created Date",
    "Status",
    "Follow Up Date",
    "Last Emailed",
    "Employer 1 Name",
    "Employer 1 Phone",
    "Employer 1 Fax",
    "Employer 1 Email",
    "Employer 1 Street",
    "Employer 1 City",
    "Employer 1 State",
    "Employer 1 Zip",
    "Employer 2 Name",
    "Employer 2 Phone",
    "Employer 2 Fax",
    "Employer 2 Email",
    "Employer 2 Street",
    "Employer 2 City",
    "Employer 2 State",
    "Employer 2 Zip",
    "Employer 3 Name",
    "Employer 3 Phone",
    "Employer 3 Fax",
    "Employer 3 Email",
    "Employer 3 Street",
    "Employer 3 City",
    "Employer 3 State",
    "Employer 3 Zip",
    "Backup Timestamp"
  ];
  sheet.appendRow(headers);

  // Style header
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#0F172A");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");

  // Data rows
  if (rows && rows.length > 0) {
    var dataRows = rows.map(function(r) {
      var emps = r.employers || [];
      var e1 = emps[0] || {};
      var e2 = emps[1] || {};
      var e3 = emps[2] || {};
      return [
        r.fileNumber || "",
        r.applicantName || "",
        r.created || "",
        r.status || "",
        r.followUpDate || "",
        r.lastEmailed || "",
        e1.name || "", e1.phone || "", e1.fax || "", e1.email || "",
        e1.street || "", e1.city || "", e1.state || "", e1.zip || "",
        e2.name || "", e2.phone || "", e2.fax || "", e2.email || "",
        e2.street || "", e2.city || "", e2.state || "", e2.zip || "",
        e3.name || "", e3.phone || "", e3.fax || "", e3.email || "",
        e3.street || "", e3.city || "", e3.state || "", e3.zip || "",
        new Date().toISOString()
      ];
    });
    sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  }

  // Auto-resize columns
  sheet.autoResizeColumns(1, headers.length);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add summary info at top
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1).setValue("SaffHire Safety Performance Backup — " + timestamp + " — " + (rows ? rows.length : 0) + " records");
  sheet.getRange(1, 1, 1, headers.length).merge();
  sheet.getRange(1, 1).setBackground("#1E3A5F").setFontColor("#FFFFFF").setFontWeight("bold");

  return tabName;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimestamp() {
  var now = new Date();
  var pad = function(n) { return n < 10 ? "0" + n : n; };
  return (
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" +
    pad(now.getMinutes())
  );
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
