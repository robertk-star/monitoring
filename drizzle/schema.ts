import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────

export const oauthUserRoleEnum = pgEnum("oauth_user_role", ["user", "admin"]);
export const localUserRoleEnum = pgEnum("local_user_role", ["user", "admin", "viewer"]);
export const monitorStatusEnum = pgEnum("monitor_status", ["On", "Off"]);
export const safetyReportStatusEnum = pgEnum("safety_report_status", [
  "S1 Complete",
  "Emp Sent",
  "Emp Complete",
  "Completed",
]);

// ── Legacy OAuth users ───────────────────────────────────────────────────────
// Kept for compatibility with the current codebase. The Supabase migration will
// use local_users for login unless OAuth is intentionally reintroduced later.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: oauthUserRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Companies ────────────────────────────────────────────────────────────────
// Google Sheet URL columns were intentionally removed for the Supabase version.
// Existing sheet URLs are migration inputs only and should not remain company data.

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ── Local username/password accounts ─────────────────────────────────────────

export const localUsers = pgTable(
  "local_users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull().unique(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    displayName: text("displayName"),
    role: localUserRoleEnum("role").default("user").notNull(),
    companyId: integer("companyId").references(() => companies.id, { onDelete: "set null" }),
    isActive: boolean("isActive").default(true).notNull(),
    mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("local_users_company_id_idx").on(table.companyId),
  })
);

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

// ── Viewer permissions ───────────────────────────────────────────────────────

export const viewerPermissions = pgTable(
  "viewer_permissions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => localUsers.id, { onDelete: "cascade" }),
    companyId: integer("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
    canViewMonitoring: boolean("canViewMonitoring").default(true).notNull(),
    canEditMonitoring: boolean("canEditMonitoring").default(false).notNull(),
    canViewSafetyPerformance: boolean("canViewSafetyPerformance").default(true).notNull(),
    canEditSafetyPerformance: boolean("canEditSafetyPerformance").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserCompany: unique("viewer_permissions_user_company_unique").on(table.userId, table.companyId),
    userIdx: index("viewer_permissions_user_id_idx").on(table.userId),
    companyIdx: index("viewer_permissions_company_id_idx").on(table.companyId),
  })
);

export type ViewerPermission = typeof viewerPermissions.$inferSelect;
export type InsertViewerPermission = typeof viewerPermissions.$inferInsert;

// ── Monitoring applicants: Supabase replacement for Google Sheets ────────────

export const applicants = pgTable(
  "applicants",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
    fileNumber: varchar("fileNumber", { length: 64 }).notNull(),
    applicantName: varchar("applicantName", { length: 255 }).notNull().default(""),
    orderDate: varchar("orderDate", { length: 32 }).notNull().default(""),
    monitorStatus: monitorStatusEnum("monitorStatus").default("Off").notNull(),
    mvrStatus: varchar("mvrStatus", { length: 255 }).notNull().default(""),
    medExpire: varchar("medExpire", { length: 32 }),
    medExpireOverridden: boolean("medExpireOverridden").default(false).notNull(),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueFileNumberCompany: unique("applicants_file_number_company_unique").on(table.fileNumber, table.companyId),
    companyIdx: index("applicants_company_id_idx").on(table.companyId),
    monitorStatusIdx: index("applicants_monitor_status_idx").on(table.monitorStatus),
    fileNumberIdx: index("applicants_file_number_idx").on(table.fileNumber),
  })
);

export type Applicant = typeof applicants.$inferSelect;
export type InsertApplicant = typeof applicants.$inferInsert;

// ── Applicant audit log ──────────────────────────────────────────────────────

export const applicantAuditLog = pgTable(
  "applicant_audit_log",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
    applicantId: integer("applicantId").notNull().references(() => applicants.id, { onDelete: "cascade" }),
    fieldName: varchar("fieldName", { length: 128 }).notNull(),
    oldValue: text("oldValue"),
    newValue: text("newValue"),
    changedBy: integer("changedBy").references(() => localUsers.id, { onDelete: "set null" }),
    changedAt: timestamp("changedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index("applicant_audit_log_company_id_idx").on(table.companyId),
    applicantIdx: index("applicant_audit_log_applicant_id_idx").on(table.applicantId),
    changedByIdx: index("applicant_audit_log_changed_by_idx").on(table.changedBy),
  })
);

export type ApplicantAuditLog = typeof applicantAuditLog.$inferSelect;
export type InsertApplicantAuditLog = typeof applicantAuditLog.$inferInsert;

// ── Safety Performance Reports ───────────────────────────────────────────────

export const safetyReports = pgTable(
  "safety_reports",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId").notNull().default(1).references(() => companies.id, { onDelete: "cascade" }),
    applicantName: varchar("applicantName", { length: 255 }).notNull().default(""),
    fileNumber: varchar("fileNumber", { length: 64 }).notNull().default(""),
    created: varchar("created", { length: 32 }).notNull().default(""),
    status: safetyReportStatusEnum("status").default("S1 Complete").notNull(),
    followUpDate: varchar("followUpDate", { length: 32 }).notNull().default(""),
    notes: varchar("notes", { length: 1000 }).notNull().default(""),
    prevEmployerName: varchar("prevEmployerName", { length: 255 }).notNull().default(""),
    prevEmployerEmail: varchar("prevEmployerEmail", { length: 320 }).notNull().default(""),
    prevEmployerStreet: varchar("prevEmployerStreet", { length: 255 }).notNull().default(""),
    prevEmployerPhone: varchar("prevEmployerPhone", { length: 64 }).notNull().default(""),
    prevEmployerFax: varchar("prevEmployerFax", { length: 64 }).notNull().default(""),
    prevEmployerCityStateZip: varchar("prevEmployerCityStateZip", { length: 255 }).notNull().default(""),
    employerName: varchar("employerName", { length: 255 }).notNull().default(""),
    employerAttention: varchar("employerAttention", { length: 255 }).notNull().default(""),
    employerStreet: varchar("employerStreet", { length: 255 }).notNull().default(""),
    employerCityStateZip: varchar("employerCityStateZip", { length: 255 }).notNull().default(""),
    employerPhone: varchar("employerPhone", { length: 64 }).notNull().default(""),
    employerFax: varchar("employerFax", { length: 64 }).notNull().default(""),
    employerEmail: varchar("employerEmail", { length: 320 }).notNull().default(""),
    confFax: varchar("confFax", { length: 64 }).notNull().default(""),
    confEmail: varchar("confEmail", { length: 320 }).notNull().default(""),
    employedByCompany: varchar("employedByCompany", { length: 255 }).notNull().default(""),
    jobTitle: varchar("jobTitle", { length: 255 }).notNull().default(""),
    fromDate: varchar("fromDate", { length: 32 }).notNull().default(""),
    toDate: varchar("toDate", { length: 32 }).notNull().default(""),
    droveMotorVehicle: varchar("droveMotorVehicle", { length: 32 }).notNull().default(""),
    vehicleStraightTruck: boolean("vehicleStraightTruck").notNull().default(false),
    vehicleTractorSemitrailer: boolean("vehicleTractorSemitrailer").notNull().default(false),
    vehicleBus: boolean("vehicleBus").notNull().default(false),
    vehicleCargoTank: boolean("vehicleCargoTank").notNull().default(false),
    vehicleDoublesTriples: boolean("vehicleDoublesTriples").notNull().default(false),
    vehicleOther: boolean("vehicleOther").notNull().default(false),
    accidentHistory: varchar("accidentHistory", { length: 32 }).notNull().default(""),
    accidentDate1: varchar("accidentDate1", { length: 32 }).notNull().default(""),
    accidentLocation1: varchar("accidentLocation1", { length: 255 }).notNull().default(""),
    accidentInjuries1: varchar("accidentInjuries1", { length: 32 }).notNull().default(""),
    accidentFatalities1: varchar("accidentFatalities1", { length: 32 }).notNull().default(""),
    accidentHazmat1: varchar("accidentHazmat1", { length: 32 }).notNull().default(""),
    accidentDate2: varchar("accidentDate2", { length: 32 }).notNull().default(""),
    accidentLocation2: varchar("accidentLocation2", { length: 255 }).notNull().default(""),
    accidentInjuries2: varchar("accidentInjuries2", { length: 32 }).notNull().default(""),
    accidentFatalities2: varchar("accidentFatalities2", { length: 32 }).notNull().default(""),
    accidentHazmat2: varchar("accidentHazmat2", { length: 32 }).notNull().default(""),
    accidentDate3: varchar("accidentDate3", { length: 32 }).notNull().default(""),
    accidentLocation3: varchar("accidentLocation3", { length: 255 }).notNull().default(""),
    accidentInjuries3: varchar("accidentInjuries3", { length: 32 }).notNull().default(""),
    accidentFatalities3: varchar("accidentFatalities3", { length: 32 }).notNull().default(""),
    accidentHazmat3: varchar("accidentHazmat3", { length: 32 }).notNull().default(""),
    otherAccidents: varchar("otherAccidents", { length: 1000 }).notNull().default(""),
    dotCompany: varchar("dotCompany", { length: 255 }).notNull().default(""),
    dotEmployee: varchar("dotEmployee", { length: 255 }).notNull().default(""),
    dotAlcoholTestPositive: boolean("dotAlcoholTestPositive").notNull().default(false),
    dotDrugTestPositive: boolean("dotDrugTestPositive").notNull().default(false),
    dotRefusedTest: boolean("dotRefusedTest").notNull().default(false),
    dotOtherViolations: boolean("dotOtherViolations").notNull().default(false),
    infoReceivedFrom: varchar("infoReceivedFrom", { length: 255 }).notNull().default(""),
    infoReceivedDate: varchar("infoReceivedDate", { length: 32 }).notNull().default(""),
    lastEmailed: timestamp("lastEmailed", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueFileNumberCompany: unique("safety_reports_file_number_company_unique").on(table.fileNumber, table.companyId),
    companyIdx: index("safety_reports_company_id_idx").on(table.companyId),
    fileNumberIdx: index("safety_reports_file_number_idx").on(table.fileNumber),
  })
);

export type SafetyReport = typeof safetyReports.$inferSelect;
export type InsertSafetyReport = typeof safetyReports.$inferInsert;

// ── Employer form one-time tokens ────────────────────────────────────────────

export const employerFormTokens = pgTable(
  "employer_form_tokens",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    safetyReportId: integer("safetyReportId").notNull().references(() => safetyReports.id, { onDelete: "cascade" }),
    fileNumber: varchar("fileNumber", { length: 64 }).notNull(),
    applicantEmail: varchar("applicantEmail", { length: 320 }).notNull().default(""),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  },
  (table) => ({
    safetyReportIdx: index("employer_form_tokens_safety_report_id_idx").on(table.safetyReportId),
    fileNumberIdx: index("employer_form_tokens_file_number_idx").on(table.fileNumber),
  })
);

export type EmployerFormToken = typeof employerFormTokens.$inferSelect;
export type InsertEmployerFormToken = typeof employerFormTokens.$inferInsert;

// ── Notification emails ──────────────────────────────────────────────────────

export const notificationEmails = pgTable("notification_emails", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 128 }).notNull().default(""),
  email: varchar("email", { length: 320 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type NotificationEmail = typeof notificationEmails.$inferSelect;
export type InsertNotificationEmail = typeof notificationEmails.$inferInsert;
