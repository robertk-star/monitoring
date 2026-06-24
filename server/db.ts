import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  Applicant,
  ApplicantAuditLog,
  Company,
  EmployerFormToken,
  InsertApplicant,
  InsertApplicantAuditLog,
  InsertCompany,
  InsertEmployerFormToken,
  InsertLocalUser,
  InsertNotificationEmail,
  InsertSafetyReport,
  InsertUser,
  InsertViewerPermission,
  LocalUser,
  NotificationEmail,
  SafetyReport,
  ViewerPermission,
  applicantAuditLog,
  applicants,
  companies,
  employerFormTokens,
  localUsers,
  notificationEmails,
  safetyReports,
  users,
  viewerPermissions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

const duplicateCodes = new Set(["23505", "ER_DUP_ENTRY", "1062"]);
function isDuplicateKeyError(error: unknown): boolean {
  const err = error as { code?: string; errno?: number };
  return duplicateCodes.has(String(err.code)) || duplicateCodes.has(String(err.errno));
}

function nowUpdate<T extends Record<string, unknown>>(data: T): T & { updatedAt: Date } {
  return { ...data, updatedAt: new Date() };
}


type CompanyWithLegacySheetFields = Company & {
  sheetUrlApplicants: string;
  sheetUrlMedExpire: string;
  sheetUrlNotes: string;
  sheetUrlSR: string;
  sheetUrlBackup: string;
  sheetUrlMonitoringBackup: string;
};

function withLegacySheetFields(company: Company): CompanyWithLegacySheetFields {
  return {
    ...company,
    sheetUrlApplicants: "",
    sheetUrlMedExpire: "",
    sheetUrlNotes: "",
    sheetUrlSR: "",
    sheetUrlBackup: "",
    sheetUrlMonitoringBackup: "",
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    updateSet.updatedAt = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Local user helpers ────────────────────────────────────────────────────────

export async function getLocalUserByUsername(username: string): Promise<LocalUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localUsers).where(eq(localUsers.username, username)).limit(1);
  return result[0];
}

export async function getLocalUserById(id: number): Promise<LocalUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localUsers).where(eq(localUsers.id, id)).limit(1);
  return result[0];
}

export async function getAllLocalUsers(): Promise<Omit<LocalUser, "passwordHash">[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      id: localUsers.id,
      username: localUsers.username,
      displayName: localUsers.displayName,
      role: localUsers.role,
      companyId: localUsers.companyId,
      isActive: localUsers.isActive,
      mustChangePassword: localUsers.mustChangePassword,
      createdAt: localUsers.createdAt,
      updatedAt: localUsers.updatedAt,
      lastSignedIn: localUsers.lastSignedIn,
    })
    .from(localUsers)
    .orderBy(localUsers.createdAt);
  return result;
}

export async function createLocalUser(data: {
  username: string;
  password: string;
  displayName?: string;
  role?: "user" | "admin" | "viewer";
  companyId?: number | null;
  mustChangePassword?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const passwordHash = await bcrypt.hash(data.password, 12);
  const values: InsertLocalUser = {
    username: data.username.trim().toLowerCase(),
    passwordHash,
    displayName: data.displayName ?? data.username,
    role: data.role ?? "user",
    companyId: data.companyId ?? null,
    isActive: true,
    mustChangePassword: data.mustChangePassword ?? true,
  };
  await db.insert(localUsers).values(values);
}

export async function updateLocalUser(
  id: number,
  data: {
    displayName?: string;
    role?: "user" | "admin" | "viewer";
    companyId?: number | null;
    isActive?: boolean;
    password?: string;
    mustChangePassword?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (data.displayName !== undefined) updateSet.displayName = data.displayName;
  if (data.role !== undefined) updateSet.role = data.role;
  if (data.companyId !== undefined) updateSet.companyId = data.companyId;
  if (data.isActive !== undefined) updateSet.isActive = data.isActive;
  if (data.mustChangePassword !== undefined) updateSet.mustChangePassword = data.mustChangePassword;
  if (data.password) {
    updateSet.passwordHash = await bcrypt.hash(data.password, 12);
    if (data.mustChangePassword === undefined) updateSet.mustChangePassword = false;
  }
  if (Object.keys(updateSet).length === 0) return;
  await db.update(localUsers).set(nowUpdate(updateSet)).where(eq(localUsers.id, id));
}

export async function deleteLocalUser(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(localUsers).where(eq(localUsers.id, id));
}

export async function verifyLocalUserPassword(username: string, password: string): Promise<LocalUser | null> {
  const user = await getLocalUserByUsername(username);
  if (!user || !user.isActive) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  const db = await getDb();
  if (db) await db.update(localUsers).set({ lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(localUsers.id, user.id));
  return user;
}

export async function countLocalUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: localUsers.id }).from(localUsers);
  return result.length;
}

export async function countAdminUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: localUsers.id }).from(localUsers).where(and(eq(localUsers.role, "admin"), eq(localUsers.isActive, true)));
  return result.length;
}

// ── Company helpers ───────────────────────────────────────────────────────────

export async function getAllCompanies(): Promise<CompanyWithLegacySheetFields[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(companies).orderBy(companies.name);
  return rows.map(withLegacySheetFields);
}

export async function getCompanyById(id: number): Promise<CompanyWithLegacySheetFields | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0] ? withLegacySheetFields(result[0]) : undefined;
}

export async function createCompany(data: InsertCompany): Promise<CompanyWithLegacySheetFields> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(companies).values(data).returning();
  return withLegacySheetFields(row);
}

export async function updateCompany(id: number, data: Partial<InsertCompany>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set(nowUpdate(data as Record<string, unknown>)).where(eq(companies.id, id));
}

export async function deleteCompany(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(companies).where(eq(companies.id, id));
}

// ── Viewer Permission helpers ─────────────────────────────────────────────────

export async function getViewerPermissionsForUser(userId: number): Promise<ViewerPermission[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(viewerPermissions).where(eq(viewerPermissions.userId, userId));
}

export async function upsertViewerPermission(data: InsertViewerPermission): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(viewerPermissions)
    .values(data)
    .onConflictDoUpdate({
      target: [viewerPermissions.userId, viewerPermissions.companyId],
      set: nowUpdate({
        canViewMonitoring: data.canViewMonitoring ?? true,
        canEditMonitoring: data.canEditMonitoring ?? false,
        canViewSafetyPerformance: data.canViewSafetyPerformance ?? true,
        canEditSafetyPerformance: data.canEditSafetyPerformance ?? false,
      }),
    });
}

export async function deleteViewerPermission(userId: number, companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(viewerPermissions).where(and(eq(viewerPermissions.userId, userId), eq(viewerPermissions.companyId, companyId)));
}

// ── Applicant helpers (new Supabase monitoring source) ───────────────────────

export async function getApplicants(companyId?: number): Promise<Applicant[]> {
  const db = await getDb();
  if (!db) return [];
  if (companyId !== undefined) {
    return db.select().from(applicants).where(eq(applicants.companyId, companyId)).orderBy(applicants.id);
  }
  return db.select().from(applicants).orderBy(applicants.id);
}

export async function getApplicantByFileNumber(fileNumber: string, companyId: number): Promise<Applicant | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(applicants)
    .where(and(eq(applicants.fileNumber, fileNumber), eq(applicants.companyId, companyId)))
    .limit(1);
  return rows[0];
}

export async function upsertApplicant(data: InsertApplicant): Promise<Applicant> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .insert(applicants)
    .values(data)
    .onConflictDoUpdate({
      target: [applicants.fileNumber, applicants.companyId],
      set: nowUpdate({
        applicantName: data.applicantName ?? "",
        orderDate: data.orderDate ?? "",
        monitorStatus: data.monitorStatus ?? "Off",
        mvrStatus: data.mvrStatus ?? "",
        medExpire: data.medExpire ?? null,
        medExpireOverridden: data.medExpireOverridden ?? false,
        notes: data.notes ?? "",
      }),
    })
    .returning();
  return row;
}

export async function createApplicantAuditLog(data: InsertApplicantAuditLog): Promise<ApplicantAuditLog> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(applicantAuditLog).values(data).returning();
  return row;
}

// ── Safety Report helpers ─────────────────────────────────────────────────────

export async function getAllSafetyReports(companyId?: number): Promise<SafetyReport[]> {
  const db = await getDb();
  if (!db) return [];
  if (companyId !== undefined) {
    return db.select().from(safetyReports).where(eq(safetyReports.companyId, companyId)).orderBy(safetyReports.id);
  }
  return db.select().from(safetyReports).orderBy(safetyReports.id);
}

export async function upsertSafetyReport(data: InsertSafetyReport): Promise<SafetyReport> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const { id, createdAt, updatedAt, ...updateData } = data as SafetyReport;
    await db.update(safetyReports).set(nowUpdate(updateData)).where(eq(safetyReports.id, id));
    const result = await db.select().from(safetyReports).where(eq(safetyReports.id, id)).limit(1);
    return result[0];
  }
  if (data.fileNumber && data.companyId) {
    const existing = await db.select().from(safetyReports)
      .where(and(eq(safetyReports.fileNumber, data.fileNumber), eq(safetyReports.companyId, data.companyId)))
      .limit(1);
    if (existing.length > 0) {
      const { createdAt, updatedAt, ...updateData } = data as SafetyReport;
      await db.update(safetyReports).set(nowUpdate(updateData)).where(eq(safetyReports.id, existing[0].id));
      const result = await db.select().from(safetyReports).where(eq(safetyReports.id, existing[0].id)).limit(1);
      return result[0];
    }
  }
  const [row] = await db.insert(safetyReports).values(data).returning();
  return row;
}

export async function deleteSafetyReport(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(safetyReports).where(eq(safetyReports.id, id));
}

export async function bulkInsertSafetyReports(records: InsertSafetyReport[]): Promise<{ inserted: number; duplicates: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (records.length === 0) return { inserted: 0, duplicates: 0 };

  let inserted = 0;
  let duplicates = 0;

  for (const record of records) {
    try {
      await db.insert(safetyReports).values(record);
      inserted++;
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) duplicates++;
      else throw error;
    }
  }

  return { inserted, duplicates };
}

export async function setLastEmailed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(safetyReports).set({ lastEmailed: new Date(), updatedAt: new Date() }).where(eq(safetyReports.id, id));
}

export async function getSafetyReportById(id: number): Promise<SafetyReport | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(safetyReports).where(eq(safetyReports.id, id)).limit(1);
  return result[0];
}

export async function getSafetyReportByFileNumber(fileNumber: string, companyId?: number): Promise<SafetyReport | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  if (companyId !== undefined) {
    const result = await db.select().from(safetyReports)
      .where(and(eq(safetyReports.fileNumber, fileNumber), eq(safetyReports.companyId, companyId)))
      .limit(1);
    return result[0];
  }
  const result = await db.select().from(safetyReports).where(eq(safetyReports.fileNumber, fileNumber)).limit(1);
  return result[0];
}

// ── Employer Form Token helpers ───────────────────────────────────────────────

export async function createEmployerFormToken(data: InsertEmployerFormToken): Promise<EmployerFormToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(employerFormTokens).values(data).returning();
  return row;
}

export async function getEmployerFormTokenByToken(token: string): Promise<EmployerFormToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employerFormTokens).where(eq(employerFormTokens.token, token)).limit(1);
  return result[0];
}

export async function markEmployerFormTokenUsed(token: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employerFormTokens).set({ used: true }).where(eq(employerFormTokens.token, token));
}

// ── Notification Email helpers ────────────────────────────────────────────────

export async function getAllNotificationEmails(): Promise<NotificationEmail[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationEmails).orderBy(notificationEmails.createdAt);
}

export async function getActiveNotificationEmails(): Promise<NotificationEmail[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationEmails).where(eq(notificationEmails.isActive, true));
}

export async function createNotificationEmail(data: { label: string; email: string }): Promise<NotificationEmail> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertNotificationEmail = { label: data.label, email: data.email, isActive: true };
  const [row] = await db.insert(notificationEmails).values(values).returning();
  return row;
}

export async function updateNotificationEmail(id: number, data: Partial<{ label: string; email: string; isActive: boolean }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notificationEmails).set(nowUpdate(data)).where(eq(notificationEmails.id, id));
}

export async function deleteNotificationEmail(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(notificationEmails).where(eq(notificationEmails.id, id));
}
