/**
 * generateSafetyPdf.ts
 *
 * Fills the Safety Performance History Records Request PDF template
 * with data from the safety performance edit form.
 *
 * PDF page size: 612 x 792 points (US Letter)
 * Image size at 150dpi: 1275 x 1651 px → scale = 1275/612 = 2.0833 px/pt
 * To convert pixel coords (from image) to PDF points: x_pt = x_px / 2.0833, y_pt = 792 - (y_px / 2.0833)
 * (PDF y=0 is bottom-left; image y=0 is top-left)
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface SafetyPdfData {
  // Section 1 - Applicant
  applicantName?: string;
  prevEmployerName?: string;
  prevEmployerStreet?: string;
  prevEmployerCityStateZip?: string;
  prevEmployerEmail?: string;
  prevEmployerPhone?: string;
  prevEmployerFax?: string;
  // Section 1 - Prospective Employer
  employerName?: string;
  attention?: string;
  employerPhone?: string;
  employerStreet?: string;
  employerCityStateZip?: string;
  confFax?: string;
  confEmail?: string;
  // Section 2
  employedByCompany?: string;
  jobTitle?: string;
  fromDate?: string;
  toDate?: string;
  droveMotorVehicle?: string; // "Yes" | "No"
  vehicleStraightTruck?: boolean;
  vehicleTractorSemitrailer?: boolean;
  vehicleBus?: boolean;
  vehicleCargoTank?: boolean;
  vehicleDoublesTriples?: boolean;
  vehicleOther?: boolean;
  // Section 3 - Accidents
  accidents?: { date?: string; location?: string; injuries?: string; fatalities?: string; hazmat?: string }[];
  otherAccidents?: string;
  // Section 4 - Drug & Alcohol
  dotCompany?: string;
  dotEmployee?: string;
  dotAlcohol?: boolean;
  dotDrug?: boolean;
  dotRefused?: boolean;
  dotOther?: boolean;
  dotPrior?: boolean;
  dotRtd?: boolean;
  // Section 5
  infoReceivedFrom?: string;
  infoReceivedDate?: string;
}

const TEMPLATE_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/safety-performance(1)_4ebe1169.pdf";

// Scale: image px → PDF points (y flipped)
const S = 2.0833; // px per point
const H = 792;    // page height in points

/** Convert image pixel coords to PDF points */
function pt(xPx: number, yPx: number): [number, number] {
  return [xPx / S, H - yPx / S];
}

export async function generateSafetyPdf(data: SafetyPdfData): Promise<Uint8Array> {
  // Fetch the template PDF
  const templateBytes = await fetch(TEMPLATE_URL).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 9;
  const color = rgb(0, 0, 0);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];

  const draw = (page: ReturnType<typeof pdfDoc.getPages>[0], text: string, xPx: number, yPx: number, maxWidth?: number) => {
    if (!text) return;
    let t = text;
    if (maxWidth) {
      // Truncate to fit
      while (t.length > 0 && font.widthOfTextAtSize(t, fontSize) > maxWidth) {
        t = t.slice(0, -1);
      }
    }
    const [x, y] = pt(xPx, yPx);
    page.drawText(t, { x, y, size: fontSize, font, color });
  };

  const check = (page: ReturnType<typeof pdfDoc.getPages>[0], checked: boolean | undefined, xPx: number, yPx: number) => {
    if (!checked) return;
    const [x, y] = pt(xPx, yPx);
    page.drawText("✓", { x, y, size: 8, font, color });
  };

  // ─── PAGE 1 ───────────────────────────────────────────────────────────────

  // Section 1 — Applicant name (below "I, (Print Name)" label)
  draw(page1, data.applicantName ?? "", 155, 348, 280);

  // Previous Employer
  draw(page1, data.prevEmployerName ?? "", 155, 405, 380);
  draw(page1, data.prevEmployerStreet ?? "", 155, 430, 380);
  draw(page1, data.prevEmployerCityStateZip ?? "", 155, 455, 280);

  // Email / Phone / Fax (right column)
  draw(page1, data.prevEmployerEmail ?? "", 820, 405, 200);
  draw(page1, data.prevEmployerPhone ?? "", 820, 430, 200);
  draw(page1, data.prevEmployerFax ?? "", 820, 455, 200);

  // Prospective Employer
  draw(page1, data.employerName ?? "", 230, 530, 280);
  draw(page1, data.attention ?? "", 155, 555, 280);
  draw(page1, data.employerPhone ?? "", 690, 555, 180);
  draw(page1, data.employerStreet ?? "", 155, 580, 380);
  draw(page1, data.employerCityStateZip ?? "", 155, 605, 380);

  // Confidential fax / email
  draw(page1, data.confFax ?? "", 390, 645, 300);
  draw(page1, data.confEmail ?? "", 390, 668, 300);

  // Section 2 — Employment Verification
  // "Was employed" checkboxes — Yes at ~(540, 1205), No at ~(590, 1205)
  if (data.employedByCompany === "Yes") check(page1, true, 540, 1205);
  else if (data.employedByCompany === "No") check(page1, true, 590, 1205);

  // Job title, from, to
  draw(page1, data.jobTitle ?? "", 200, 1228, 160);
  draw(page1, data.fromDate ?? "", 530, 1228, 100);
  draw(page1, data.toDate ?? "", 740, 1228, 100);

  // Drove motor vehicle — Yes/No checkboxes
  if (data.droveMotorVehicle === "Yes") check(page1, true, 415, 1255);
  else if (data.droveMotorVehicle === "No") check(page1, true, 460, 1255);

  // Vehicle type checkboxes
  check(page1, data.vehicleStraightTruck, 640, 1255);
  check(page1, data.vehicleTractorSemitrailer, 760, 1255);
  check(page1, data.vehicleBus, 870, 1255);
  check(page1, data.vehicleCargoTank, 70, 1278);
  check(page1, data.vehicleDoublesTriples, 160, 1278);
  check(page1, data.vehicleOther, 280, 1278);

  // Completed by / Company / Street / City / Telephone / Signature / Date
  draw(page1, data.prevEmployerName ?? "", 155, 1310, 700);
  draw(page1, data.prevEmployerName ?? "", 155, 1335, 700);
  draw(page1, data.prevEmployerStreet ?? "", 155, 1360, 700);
  draw(page1, data.prevEmployerCityStateZip ?? "", 155, 1385, 500);
  draw(page1, data.prevEmployerPhone ?? "", 870, 1385, 180);

  // ─── PAGE 2 ───────────────────────────────────────────────────────────────

  // Employee name header
  draw(page2, data.applicantName ?? "", 340, 52, 300);

  // Section 3 — Accident History
  const accidents = data.accidents ?? [];
  const accidentRows = [
    { yDate: 248, yLoc: 248, yInj: 248, yFat: 248, yHaz: 248 },
    { yDate: 270, yLoc: 270, yInj: 270, yFat: 270, yHaz: 270 },
    { yDate: 292, yLoc: 292, yInj: 292, yFat: 292, yHaz: 292 },
  ];
  accidents.slice(0, 3).forEach((acc, i) => {
    const row = accidentRows[i];
    draw(page2, acc.date ?? "", 80, row.yDate, 90);
    draw(page2, acc.location ?? "", 200, row.yLoc, 380);
    draw(page2, acc.injuries ?? "", 760, row.yInj, 60);
    draw(page2, acc.fatalities ?? "", 880, row.yFat, 60);
    draw(page2, acc.hazmat ?? "", 1010, row.yHaz, 60);
  });
  draw(page2, data.otherAccidents ?? "", 155, 360, 900);

  // Section 4 — Drug & Alcohol
  draw(page2, data.dotCompany ?? "", 380, 490, 120);
  draw(page2, data.dotEmployee ?? "", 560, 490, 120);

  // Q1 Yes/No/N/A checkboxes
  check(page2, data.dotAlcohol, 1105, 600);   // Yes
  check(page2, data.dotDrug, 1155, 600);       // No
  check(page2, data.dotRefused, 1205, 600);    // N/A

  // Q2 Yes/No/N/A
  check(page2, data.dotOther, 1105, 700);
  check(page2, data.dotPrior, 1155, 700);

  // Q3 Yes/No
  check(page2, data.dotRtd, 1105, 770);

  // Section 5b — Info received
  draw(page2, data.infoReceivedFrom ?? "", 300, 1480, 400);
  draw(page2, data.infoReceivedDate ?? "", 300, 1560, 200);

  return pdfDoc.save();
}
