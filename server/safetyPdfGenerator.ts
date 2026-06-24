/**
 * Safety Performance History Records Request PDF Generator
 * Uses the official FMCSA 850-F form as a fillable PDF template.
 * Fills all named form fields directly via pdf-lib.
 *
 * Template CDN:
 * https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/fmcsa-safety-performance-template_d1c41d1c.pdf
 */

import { PDFDocument } from "pdf-lib";

const TEMPLATE_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/fmcsa-safety-performance-template_d1c41d1c.pdf";

export interface SafetyReportData {
  applicantName?: string;
  ssn?: string;
  dob?: string;
  prevEmployerName?: string;
  prevEmployerStreet?: string;
  prevEmployerCityStateZip?: string;
  prevEmployerEmail?: string;
  prevEmployerPhone?: string;
  prevEmployerFax?: string;
  applicationDate?: string;
  employerName?: string;
  employerAttention?: string;
  employerPhone?: string;
  employerFax?: string;
  employerEmail?: string;
  employerStreet?: string;
  employerCityStateZip?: string;
  confFax?: string;
  confEmail?: string;
  applicantDate?: string;
  // Section 2
  wasEmployed?: boolean;
  jobTitle?: string;
  fromDate?: string;
  toDate?: string;
  droveMotorVehicle?: boolean | string;  // DB stores "Yes"/"No"/""
  vehicleStraightTruck?: boolean;
  vehicleTractorSemitrailer?: boolean;
  vehicleBus?: boolean;
  vehicleCargoTank?: boolean;
  vehicleDoublesTriples?: boolean;
  vehicleOther?: boolean | string;  // DB stores boolean, form shows text
  completedBy?: string;
  company?: string;
  companyStreet?: string;
  companyCityStateZip?: string;
  companyTelephone?: string;
  noSafetyHistory?: boolean;
  // Section 3
  noAccidentData?: boolean;
  accidentDate1?: string;
  accidentLocation1?: string;
  accidentInjuries1?: string;
  accidentFatalities1?: string;
  accidentHazmat1?: string;
  accidentDate2?: string;
  accidentLocation2?: string;
  accidentInjuries2?: string;
  accidentFatalities2?: string;
  accidentHazmat2?: string;
  accidentDate3?: string;
  accidentLocation3?: string;
  accidentInjuries3?: string;
  accidentFatalities3?: string;
  accidentHazmat3?: string;
  otherAccidents?: string;
  // Section 4
  notSubjectToDOT?: boolean;
  dotFrom?: string;
  dotTo?: string;
  violatedDrugAlcohol?: boolean;
  failedRehab?: boolean;
  failedRehabNA?: boolean;
  rehabCheckHere?: boolean;
  completedSAP?: boolean;
  completedSAPNA?: boolean;
  // Section 5a
  sentByFax?: boolean;
  sentByMail?: boolean;
  sentByEmail?: boolean;
  sentByOther?: string;
  sentBy?: string;
  sentDate?: string;
  subsequentAttempts1?: string;
  subsequentAttempts2?: string;
  subsequentAttempts3?: string;
  // Section 5b
  infoReceivedFrom?: string;
  recordedBy?: string;
  methodFax?: boolean;
  methodMail?: boolean;
  methodEmail?: boolean;
  methodTelephone?: boolean;
  methodOther?: string;
  recordedDate?: string;
  // Legacy compat
  fileNumber?: string;
  employedByCompany?: string;
  dotCompany?: string;
  dotEmployee?: string;
  dotAlcoholTestPositive?: boolean;
  dotDrugTestPositive?: boolean;
  dotRefusedTest?: boolean;
  dotOtherViolations?: boolean;
  infoReceivedDate?: string;
  created?: string;
}

export async function generateSafetyPerformancePdf(
  data: SafetyReportData
): Promise<Uint8Array> {
  const templateBytes = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch PDF template: ${r.status}`);
    return r.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const setText = (name: string, value: string | undefined) => {
    if (!value) return;
    try { form.getTextField(name).setText(value); } catch { /* skip */ }
  };

  const setCheck = (name: string, checked: boolean | undefined) => {
    if (!checked) return;
    try { form.getCheckBox(name).check(); } catch { /* skip */ }
  };

  // ── Section 1 ──────────────────────────────────────────────────────────────
  setText("I Print Name", data.applicantName);
  setText("Social Security Number", data.ssn);
  setText("Date of Birth", data.dob);
  setText("Previous Employer 1", data.prevEmployerName);
  setText("Previous Employer 2", data.prevEmployerStreet);
  setText("City State Zip", data.prevEmployerCityStateZip);
  setText("Email", data.prevEmployerEmail);
  setText("Telephone", data.prevEmployerPhone);
  setText("Fax No", data.prevEmployerFax);
  setText("records within the previous 3 years from", data.applicationDate ?? data.created);
  setText("Prospective Employer 1", data.employerName);
  setText("Prospective Employer 2", data.employerAttention);
  setText("Telephone_2", data.employerPhone);
  setText("Prospective Employer 3", data.employerStreet);
  setText("City State Zip_2", data.employerCityStateZip);
  setText("Prospective employers confidential fax number", data.confFax);
  setText("Prospective employers confidential email address", data.confEmail);
  setText("Date", data.applicantDate ?? data.created);

  // ── Section 2 ──────────────────────────────────────────────────────────────
  if (data.wasEmployed === true) {
    setCheck("The applicant named above was or is employed or used by us Yes", true);
  } else if (data.wasEmployed === false) {
    setCheck("No", true);
  }
  setText("Employed as job title", data.jobTitle);
  setText("from my", data.fromDate);
  setText("to my", data.toDate);
  const droveBool = data.droveMotorVehicle === true || data.droveMotorVehicle === 'Yes';
  const droveNo = data.droveMotorVehicle === false || data.droveMotorVehicle === 'No';
  if (droveBool) setCheck("Did heshe drive a motor vehicle for you  Yes", true);
  else if (droveNo) setCheck("No_2", true);
  setCheck("Straight Truck", data.vehicleStraightTruck);
  setCheck("TractorSemitrailer", data.vehicleTractorSemitrailer);
  setCheck("Bus", data.vehicleBus);
  setCheck("Cargo Tank", data.vehicleCargoTank);
  setCheck("DoublesTriples", data.vehicleDoublesTriples);
  setText("Other Specify", typeof data.vehicleOther === 'boolean' ? (data.vehicleOther ? 'Yes' : '') : data.vehicleOther);
  setText("Completed by", data.completedBy);
  setText("Company 1", data.company ?? data.employedByCompany);
  setText("Company 2", data.companyStreet);
  setText("City State Zip_3", data.companyCityStateZip);
  setText("Telephone_3", data.companyTelephone);
  setCheck("If there is no safety performance history to report check here", data.noSafetyHistory);

  // ── Page 2 header ──────────────────────────────────────────────────────────
  setText("Employee Name", data.applicantName);
  setText("Date_3", data.applicantDate ?? data.created);

  // ── Section 3 – Accident History ──────────────────────────────────────────
  setCheck("3 years prior to the application date shown on SIDE 1 or check here", data.noAccidentData);
  setText("Date_4", data.accidentDate1);
  setText("Location 1", data.accidentLocation1);
  setText("No of Injuries No of Fatalities", data.accidentInjuries1);
  setText("1_2", data.accidentFatalities1);
  setText("Hazmat Spill 1", data.accidentHazmat1);
  setText("2", data.accidentDate2);
  setText("Location 2", data.accidentLocation2);
  setText("1", data.accidentInjuries2);
  setText("2_3", data.accidentFatalities2);
  setText("Hazmat Spill 2", data.accidentHazmat2);
  setText("3", data.accidentDate3);
  setText("Location 3", data.accidentLocation3);
  setText("2_2", data.accidentInjuries3);
  setText("3_2", data.accidentFatalities3);
  setText("Hazmat Spill 3", data.accidentHazmat3);
  setText("Please provide information concerning any other commercial motor vehicle accidents involving the applicant that were reported", data.otherAccidents);

  // ── Section 4 – Drug & Alcohol ─────────────────────────────────────────────
  setCheck("If applicant was not subject to DOT testing requirements under 49 CFR Part 40 while employed by you please check here", data.notSubjectToDOT);
  setText("to", data.dotFrom ?? data.dotCompany);
  setText("undefined", data.dotTo ?? data.dotEmployee);
  if (data.violatedDrugAlcohol === true || data.dotAlcoholTestPositive || data.dotDrugTestPositive || data.dotRefusedTest || data.dotOtherViolations) {
    setCheck("Yes", true);
  } else if (data.violatedDrugAlcohol === false) {
    setCheck("No", true);
  }
  if (data.failedRehab === true) {
    setCheck("Yes1", true);
  } else if (data.failedRehab === false) {
    setCheck("No1", true);
  }
  setCheck("No3", data.failedRehabNA);
  setCheck("or completed such a program check here", data.rehabCheckHere);
  if (data.completedSAP === true) {
    setCheck("Yes2", true);
  } else if (data.completedSAP === false) {
    setCheck("No2", true);
  }
  setCheck("No4", data.completedSAPNA);

  // ── Section 5a ─────────────────────────────────────────────────────────────
  setCheck("Check Box1", data.sentByFax);
  setCheck("Check Box2", data.sentByMail);
  setCheck("Check Box3", data.sentByEmail);
  setCheck("Check Box4", !!data.sentByOther);
  setText("undefined_6", data.sentByOther);
  setText("This form was check one", data.sentBy);
  setText("Date_5", data.sentDate);
  setText("Subsequent attempts to contact previous employer 39123c1 1", data.subsequentAttempts1);
  setText("Subsequent attempts to contact previous employer 39123c1 2", data.subsequentAttempts2);
  setText("Subsequent attempts to contact previous employer 39123c1 3", data.subsequentAttempts3);

  // ── Section 5b ─────────────────────────────────────────────────────────────
  setText("Complete below when information is obtained", data.infoReceivedFrom);
  setText("Information received from", data.infoReceivedFrom);
  setCheck("Check Box5", data.methodFax);
  setCheck("Check Box6", data.methodMail);
  setCheck("Check Box7", data.methodEmail);
  setCheck("Check Box8", data.methodTelephone);
  setText("Recorded by", data.recordedBy);
  setText("undefined_8", data.methodOther);

  // Flatten so fields are baked into the PDF
  form.flatten();

  return pdfDoc.save();
}
