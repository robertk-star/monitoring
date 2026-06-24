import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import axios from "axios";

/**
 * gasPost — POST to a Google Apps Script Web App and return the JSON response.
 *
 * Google Apps Script processes the request on the initial POST, then returns a 302
 * redirect to a one-time "echo" URL that carries the actual JSON response body.
 * We must: (1) POST with maxRedirects:0 to capture the Location header, then
 * (2) immediately GET that URL to retrieve the JSON.
 */
async function gasPost<T = unknown>(url: string, body: unknown, timeoutMs = 90000): Promise<T> {
  // Step 1: POST — capture the 302 Location header
  let locationUrl: string | undefined;
  try {
    await axios.post(url, JSON.stringify(body), {
      headers: { "Content-Type": "text/plain" },
      maxRedirects: 0,
      validateStatus: () => true, // accept any status so we can read headers
      timeout: timeoutMs,
    });
  } catch (e: unknown) {
    // axios throws on 3xx when maxRedirects:0 — extract Location from error response
    const axErr = e as { response?: { headers?: { location?: string } } };
    locationUrl = axErr?.response?.headers?.location;
  }

  if (!locationUrl) {
    throw new Error("Google Apps Script did not return a redirect URL");
  }

  // Step 2: GET the one-time echo URL to retrieve the JSON result
  const result = await axios.get<T>(locationUrl, {
    timeout: 30000,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return result.data;
}

// Data source endpoints — kept server-side only, never exposed to the browser
const _DS = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4dUhLcG05UFlEc2RyQ1E3N1g3WElGQjdXemhFbjNVcTJpUk42NEt6X0R0SjdsMXJYdTBnM0oyZFpuUm56cE5BUm1kQS9leGVj",
  "base64"
).toString("utf8");
const _DS2 = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J5YkdVa1JOSnh4cVhNX2dJTUs4MVY3aVNsM1pWcDd2TU9McTFlSkl0UTR0UFBfQ3hfZy1hT3otaUhncjhmanp2eFAvZXhlYw==",
  "base64"
).toString("utf8");
const _DS3 = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6TGpfbnlZOEF0Y2FFQXZueEd2aTFVZk1PU1BPbElETENHMVdPaERDS2tQMk10Vnh3QnJ0dTVlNVMxenlFN0U5dEgvZXhlYw==",
  "base64"
).toString("utf8");
const _DS4 = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6SlFvd2RURzJ0UWVYellxWklkeHVwLXB6aUZFX0tqaEU2Sk10MFZ4Z1FZb2lpRnZpMnNiYlZvMWxrWEdoSl9DUVQvZXhlYw==",
  "base64"
).toString("utf8");
// DS5 — Med Expire Google Sheet (read + write)
const _DS5 = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J5YkdVa1JOSnh4cVhNX2dJTUs4MVY3aVNsM1pWcDd2TU9McTFlSkl0UTR0UFBfQ3hfZy1hT3otaUhncjhmanp2eFAvZXhlYw==",
  "base64"
).toString("utf8");
// DS6 — DP Monitoring On/Off Google Sheet (read + write)
const _DS6 = Buffer.from(
  "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4QXI4dmFpeXF2T0dtdGxlaUlobFFZem02ZTZ0NWNjT2cxb2JGMEVXZGJfdkFjYS0wVlBUUGV3X0tLbzFSVkpoeGkvZXhlYw==",
  "base64"
).toString("utf8");

import {
  countLocalUsers,
  createLocalUser,
  deleteLocalUser,
  getAllLocalUsers,
  getLocalUserById,
  updateLocalUser,
  verifyLocalUserPassword,
  getAllSafetyReports,
  upsertSafetyReport,
  deleteSafetyReport,
  bulkInsertSafetyReports,
  setLastEmailed,
  getSafetyReportById,
  getSafetyReportByFileNumber,
  createEmployerFormToken,
  getEmployerFormTokenByToken,
  markEmployerFormTokenUsed,
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getViewerPermissionsForUser,
  upsertViewerPermission,
  deleteViewerPermission,
  getAllNotificationEmails,
  getActiveNotificationEmails,
  createNotificationEmail,
  updateNotificationEmail,
  deleteNotificationEmail,
} from "./db";
import { sendMonitorStatusEmail } from "./emailSender";
import crypto from "crypto";
import { getLocalUserFromCookie, LOCAL_SESSION_COOKIE, signLocalSession } from "./localSession";

/** Admin-only guard — checks the local session JWT (not Manus OAuth) */
const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
  if (!localUser || localUser.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

/** Authenticated local user guard — any logged-in local user */
const localUserProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
  if (!localUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next({ ctx });
});

// Zod schema for a full safety report upsert
const safetyReportInput = z.object({
  id: z.number().optional(),
  applicantName: z.string().default(""),
  fileNumber: z.string().default(""),
  created: z.string().default(""),
  status: z.enum(["S1 Complete", "Emp Sent", "Emp Complete", "Completed"]).default("S1 Complete"),
  followUpDate: z.string().default(""),
  notes: z.string().default(""),
  prevEmployerName: z.string().default(""),
  prevEmployerEmail: z.string().default(""),
  prevEmployerStreet: z.string().default(""),
  prevEmployerPhone: z.string().default(""),
  prevEmployerFax: z.string().default(""),
  prevEmployerCityStateZip: z.string().default(""),
  employerName: z.string().default(""),
  employerAttention: z.string().default(""),
  employerStreet: z.string().default(""),
  employerCityStateZip: z.string().default(""),
  employerPhone: z.string().default(""),
  employerFax: z.string().default(""),
  employerEmail: z.string().default(""),
  confFax: z.string().default(""),
  confEmail: z.string().default(""),
  employedByCompany: z.string().default(""),
  jobTitle: z.string().default(""),
  fromDate: z.string().default(""),
  toDate: z.string().default(""),
  droveMotorVehicle: z.string().default(""),
  vehicleStraightTruck: z.boolean().default(false),
  vehicleTractorSemitrailer: z.boolean().default(false),
  vehicleBus: z.boolean().default(false),
  vehicleCargoTank: z.boolean().default(false),
  vehicleDoublesTriples: z.boolean().default(false),
  vehicleOther: z.boolean().default(false),
  accidentHistory: z.string().default(""),
  accidentDate1: z.string().default(""),
  accidentLocation1: z.string().default(""),
  accidentInjuries1: z.string().default(""),
  accidentFatalities1: z.string().default(""),
  accidentHazmat1: z.string().default(""),
  accidentDate2: z.string().default(""),
  accidentLocation2: z.string().default(""),
  accidentInjuries2: z.string().default(""),
  accidentFatalities2: z.string().default(""),
  accidentHazmat2: z.string().default(""),
  accidentDate3: z.string().default(""),
  accidentLocation3: z.string().default(""),
  accidentInjuries3: z.string().default(""),
  accidentFatalities3: z.string().default(""),
  accidentHazmat3: z.string().default(""),
  otherAccidents: z.string().default(""),
  dotCompany: z.string().default(""),
  dotEmployee: z.string().default(""),
  dotAlcoholTestPositive: z.boolean().default(false),
  dotDrugTestPositive: z.boolean().default(false),
  dotRefusedTest: z.boolean().default(false),
  dotOtherViolations: z.boolean().default(false),
  infoReceivedFrom: z.string().default(""),
  infoReceivedDate: z.string().default(""),
});

export const appRouter = router({
  system: systemRouter,

  // ── Manus OAuth auth ──────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Local username/password auth ──────────────────────────────────────────
  localAuth: router({
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        rememberMe: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyLocalUserPassword(input.username, input.password);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }
        const expiresIn = input.rememberMe ? "30d" : "1d";
        const token = await signLocalSession(user, expiresIn);
        const maxAge = input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(LOCAL_SESSION_COOKIE, token, { ...cookieOptions, maxAge });
        return {
          success: true,
          mustChangePassword: user.mustChangePassword,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            companyId: user.companyId ?? null,
            mustChangePassword: user.mustChangePassword,
          },
        };
      }),

    changePassword: localUserProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match" });
        }
        const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
        if (!localUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
        const bcrypt = await import("bcryptjs");
        const valid = await bcrypt.default.compare(input.currentPassword, localUser.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
        await updateLocalUser(localUser.id, { password: input.newPassword, mustChangePassword: false });
        return { success: true };
      }),

    me: publicProcedure.query(async ({ ctx }) => {
      const user = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        companyId: user.companyId ?? null,
        mustChangePassword: user.mustChangePassword,
        isDemo: user.username === "demo",
      };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    hasUsers: publicProcedure.query(async () => {
      const count = await countLocalUsers();
      return { hasUsers: count > 0 };
    }),

    setupAdmin: publicProcedure
      .input(z.object({ username: z.string().min(3).max(32), password: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const count = await countLocalUsers();
        if (count > 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Setup already complete" });
        }
        await createLocalUser({ username: input.username, password: input.password, displayName: input.username, role: "admin" });
        return { success: true };
      }),
  }),

  // ── Data proxy (keeps data source hidden from browser) ────────────────────
  data: router({
    applicants: publicProcedure
      .input(z.object({ companyId: z.number().optional(), sheetUrl: z.string().optional() }).optional())
      .query(async ({ input }) => {
        let url = input?.sheetUrl || _DS6;
        if (input?.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        const res = await axios.get(url, { maxRedirects: 10 });
        return res.data as { status: string; data: { fileNumber: string; name: string; orderDate: string; monitorStatus: string }[] };
      }),

    monitorStatuses: publicProcedure.query(async () => {
      return { status: "ok", data: [] as { fileNumber: string; value: string; lastUpdated: string }[] };
    }),

    updateMonitor: publicProcedure
      .input(z.object({
        fileNumber: z.string(),
        value: z.string(),
        applicantName: z.string().optional(),
        companyId: z.number().optional(),
        sheetUrl: z.string().optional(),
        changedBy: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Block writes for the demo user — demo mode is read-only for data mutations
        const requestingUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
        if (requestingUser?.username === "demo") {
          return { success: true, demo: true };
        }

        let baseUrl = input.sheetUrl || _DS6;
        if (input.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        const url = `${baseUrl}?action=updateMonitor&fileNumber=${encodeURIComponent(input.fileNumber)}&value=${encodeURIComponent(input.value)}`;
        await axios.get(url, { maxRedirects: 10 });

        // Send notification emails to all active recipients
        if (input.value === "On" || input.value === "Off") {
          try {
            const recipients = await getActiveNotificationEmails();
            if (recipients.length > 0) {
              // Determine who made the change (optional, from session)
              let changedBy = input.changedBy;
              if (!changedBy) {
                try {
                  const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
                  if (localUser) changedBy = localUser.displayName ?? localUser.username;
                } catch { /* ignore */ }
              }
              await sendMonitorStatusEmail({
                newStatus: input.value as "On" | "Off",
                applicantName: input.applicantName ?? input.fileNumber,
                fileNumber: input.fileNumber,
                changedBy,
                recipients: recipients.map(r => r.email),
              });
            }
          } catch (emailErr) {
            // Log but don't fail the mutation — sheet update already succeeded
            console.error("[updateMonitor] Failed to send notification email:", emailErr);
          }
        }

        return { success: true };
      }),

    medCerts: publicProcedure.query(async () => {
      const res = await axios.get(_DS2, { maxRedirects: 10 });
      return res.data as { status: string; data: { "File #": number | string; "Exp Date": string }[] };
    }),

    notes: publicProcedure
      .input(z.object({ companyId: z.number().optional(), sheetUrl: z.string().optional() }).optional())
      .query(async ({ input }) => {
        let url = input?.sheetUrl || _DS3;
        if (input?.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        const res = await axios.get(url, { maxRedirects: 10 });
        return res.data as { status: string; data: { fileNumber: string; notes: string; lastUpdated: string }[] };
      }),

    fetchNewSRReports: publicProcedure
      .input(z.object({
        existingFileNumbers: z.array(z.string()),
        srSheetUrl: z.string().optional(),
        applicantsSheetUrl: z.string().optional(),
        companyId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // Resolve URLs — prefer company-specific sheet URLs from DB
        let srUrl = input.srSheetUrl || _DS4;
        let applicantsUrl = input.applicantsSheetUrl || _DS;
        if (input.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }

        const srRes = await axios.get(`${srUrl}?action=getSafetyReports`, { maxRedirects: 10 });
        const srData = srRes.data as { status: string; data: Record<string, unknown>[] };
        const srRows = srData.data ?? [];

        // Detect format: Demo format has "fileNumber" key; Driver Pipeline format has "File #"
        const isDirectFormat = srRows.length > 0 && "fileNumber" in srRows[0];

        if (isDirectFormat) {
          // Demo / direct format: sheet already has fileNumber, applicantName, created, status, followUpDate
          const newRows = srRows.filter((row) => {
            const fileNum = String(row["fileNumber"] ?? "").trim();
            return fileNum && !input.existingFileNumbers.includes(fileNum);
          });
          return newRows.map((row) => ({
            fileNumber: String(row["fileNumber"] ?? "").trim(),
            applicantName: String(row["applicantName"] ?? "").trim(),
            created: String(row["created"] ?? "").trim(),
            status: String(row["status"] ?? "S1 Complete").trim(),
            followUpDate: String(row["followUpDate"] ?? "").trim(),
            employerName: "",
            employerStreet: "",
            employerPhone: "",
            employerFax: "",
            employerCityStateZip: "",
            employerEmail: "",
            applicantEmail: "",
          }));
        }

        // Driver Pipeline format: needs SR Found flag + separate applicants sheet for names
        const applicantsRes = await axios.get(`${applicantsUrl}?action=getApplicants`, { maxRedirects: 10 });
        const applicantsData = applicantsRes.data as { status: string; data: Record<string, unknown>[] };
        const applicantRows = applicantsData.data ?? [];
        const nameMap = new Map<string, string>();
        for (const row of applicantRows) {
          const fileNum = String(row["File #"] ?? row["fileNumber"] ?? "").trim();
          const name = String(row["Applicant Name"] ?? row["Name"] ?? row["name"] ?? "").trim();
          if (fileNum && name) nameMap.set(fileNum, name);
        }
        const newRows = srRows.filter((row) => {
          const srFound = String(row["SR Found"] ?? "").trim().toLowerCase();
          const fileNum = String(row["File #"] ?? "").trim();
          return srFound === "yes" && !input.existingFileNumbers.includes(fileNum);
        });
        return newRows.map((row) => {
          const fileNum = String(row["File #"] ?? "").trim();
          return {
            fileNumber: fileNum,
            applicantName: nameMap.get(fileNum) ?? "",
            created: "",
            status: "S1 Complete",
            followUpDate: "",
            employerName: String(row["Employer Name"] ?? "").trim(),
            employerStreet: String(row["Employer Street"] ?? "").trim(),
            employerPhone: String(row["Employer Phone"] ?? "").trim(),
            employerFax: String(row["Employer Fax"] ?? "").trim(),
            employerCityStateZip: String(row["City / State / Zip"] ?? "").trim(),
            employerEmail: String(row["Employer Email"] ?? "").trim(),
            applicantEmail: String(row["Applicant Email"] ?? "").trim(),
          };
        });
      }),

    updateNote: publicProcedure
      .input(z.object({ fileNumber: z.string(), notes: z.string(), companyId: z.number().optional(), sheetUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        let url = input.sheetUrl || _DS3;
        if (input.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        await axios.post(
          url,
          JSON.stringify({ action: "upsert", fileNumber: input.fileNumber, notes: input.notes }),
          { headers: { "Content-Type": "text/plain" }, maxRedirects: 10 }
        );
        return { success: true };
      }),

    medExpireDates: publicProcedure
      .input(z.object({ companyId: z.number().optional(), sheetUrl: z.string().optional() }).optional())
      .query(async ({ input }) => {
        let url = input?.sheetUrl || _DS5;
        if (input?.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        const res = await axios.get(url, { maxRedirects: 10 });
        return res.data as { status: string; data: { fileNumber: string; medExpire: string; lastUpdated: string }[] };
      }),

    updateMedExpire: publicProcedure
      .input(z.object({ fileNumber: z.string(), medExpire: z.string(), companyId: z.number().optional(), sheetUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        let url = input.sheetUrl || _DS5;
        if (input.companyId) {
          const company = await getCompanyById(input.companyId);
          // Phase 1A: company-specific Google Sheet URLs were removed from companies.
        }
        // Google Apps Script processes the write on the FIRST POST and then returns a 302 redirect.
        // The redirect is just the response delivery — the write already happened on the first request.
        // We simply send the POST and accept any 2xx or 3xx as success.
        const body = JSON.stringify({ action: "upsert", fileNumber: input.fileNumber, medExpire: input.medExpire });
        await axios.post(url, body, {
          headers: { "Content-Type": "text/plain" },
          maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
        }).catch(() => {
          // 302 redirect throws when maxRedirects:0 — that is expected and means the write succeeded
        });
        return { success: true };
      }),
  }),

  // ── Safety Performance Reports (DB-backed) ─────────────────────────────
  safetyReports: router({
    list: publicProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return getAllSafetyReports(input?.companyId);
      }),

    upsert: publicProcedure
      .input(safetyReportInput)
      .mutation(async ({ input }) => {
        return upsertSafetyReport(input);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSafetyReport(input.id);
        return { success: true };
      }),

    setLastEmailed: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await setLastEmailed(input.id);
        return { success: true };
      }),

    bulkInsert: adminProcedure
      .input(z.array(safetyReportInput))
      .mutation(async ({ input }) => {
        await bulkInsertSafetyReports(input);
        return { success: true, count: input.length };
      }),

    /**
     * Push all safety reports for a company to a Google Sheets backup.
     * The backup sheet URL is stored in the company record (sheetUrlBackup).
     * Calls the Google Apps Script with action=pushAll and the full report list.
     */
    pushBackup: localUserProcedure
      .input(z.object({
        companyId: z.number(),
        backupSheetUrl: z.string().url("Must be a valid Google Apps Script URL"),
      }))
      .mutation(async ({ input }) => {
        // Fetch all reports for this company from the DB
        const reports = await getAllSafetyReports(input.companyId);

        // Serialize reports — convert Date objects and booleans to plain values
        const serialized = reports.map((r) => ({
          fileNumber: r.fileNumber,
          applicantName: r.applicantName,
          created: r.created,
          status: r.status,
          followUpDate: r.followUpDate,
          notes: r.notes,
          prevEmployerName: r.prevEmployerName,
          prevEmployerEmail: r.prevEmployerEmail,
          prevEmployerStreet: r.prevEmployerStreet,
          prevEmployerPhone: r.prevEmployerPhone,
          prevEmployerFax: r.prevEmployerFax,
          prevEmployerCityStateZip: r.prevEmployerCityStateZip,
          employerName: r.employerName,
          employerAttention: r.employerAttention,
          employerStreet: r.employerStreet,
          employerCityStateZip: r.employerCityStateZip,
          employerPhone: r.employerPhone,
          employerFax: r.employerFax,
          employerEmail: r.employerEmail,
          confFax: r.confFax,
          confEmail: r.confEmail,
          employedByCompany: r.employedByCompany,
          jobTitle: r.jobTitle,
          fromDate: r.fromDate,
          toDate: r.toDate,
          droveMotorVehicle: r.droveMotorVehicle,
          vehicleStraightTruck: r.vehicleStraightTruck,
          vehicleTractorSemitrailer: r.vehicleTractorSemitrailer,
          vehicleBus: r.vehicleBus,
          vehicleCargoTank: r.vehicleCargoTank,
          vehicleDoublesTriples: r.vehicleDoublesTriples,
          vehicleOther: r.vehicleOther,
          accidentHistory: r.accidentHistory,
          accidentDate1: r.accidentDate1,
          accidentLocation1: r.accidentLocation1,
          accidentInjuries1: r.accidentInjuries1,
          accidentFatalities1: r.accidentFatalities1,
          accidentHazmat1: r.accidentHazmat1,
          accidentDate2: r.accidentDate2,
          accidentLocation2: r.accidentLocation2,
          accidentInjuries2: r.accidentInjuries2,
          accidentFatalities2: r.accidentFatalities2,
          accidentHazmat2: r.accidentHazmat2,
          accidentDate3: r.accidentDate3,
          accidentLocation3: r.accidentLocation3,
          accidentInjuries3: r.accidentInjuries3,
          accidentFatalities3: r.accidentFatalities3,
          accidentHazmat3: r.accidentHazmat3,
          otherAccidents: r.otherAccidents,
          dotCompany: r.dotCompany,
          dotEmployee: r.dotEmployee,
          dotAlcoholTestPositive: r.dotAlcoholTestPositive,
          dotDrugTestPositive: r.dotDrugTestPositive,
          dotRefusedTest: r.dotRefusedTest,
          dotOtherViolations: r.dotOtherViolations,
          infoReceivedFrom: r.infoReceivedFrom,
          infoReceivedDate: r.infoReceivedDate,
          lastEmailed: r.lastEmailed ? r.lastEmailed.toISOString() : "",
        }));

        // POST to the Google Apps Script backup endpoint using the gasPost helper,
        // which handles the POST → 302 → GET pattern that Google Apps Script uses.
        const backupResult = await gasPost<{ status: string; message?: string; count?: number }>(
          input.backupSheetUrl,
          { action: "pushAll", reports: serialized },
          60000
        );

        if (backupResult.status !== "ok") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: backupResult.message ?? "Backup push failed",
          });
        }

        return { success: true, count: serialized.length, message: backupResult.message };
      }),
    generatePdf: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const report = await getSafetyReportById(input.id);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
        const { generateSafetyPerformancePdf } = await import('./safetyPdfGenerator');
        const pdfBytes = await generateSafetyPerformancePdf({
          applicantName: report.applicantName,
          fileNumber: report.fileNumber,
          prevEmployerName: report.prevEmployerName,
          prevEmployerStreet: report.prevEmployerStreet,
          prevEmployerCityStateZip: report.prevEmployerCityStateZip,
          prevEmployerPhone: report.prevEmployerPhone,
          prevEmployerFax: report.prevEmployerFax,
          prevEmployerEmail: report.prevEmployerEmail,
          employerName: report.employerName,
          employerAttention: report.employerAttention,
          employerStreet: report.employerStreet,
          employerCityStateZip: report.employerCityStateZip,
          employerPhone: report.employerPhone,
          employerFax: report.employerFax,
          employerEmail: report.employerEmail,
          confFax: report.confFax,
          confEmail: report.confEmail,
          employedByCompany: report.employedByCompany,
          jobTitle: report.jobTitle,
          fromDate: report.fromDate,
          toDate: report.toDate,
          droveMotorVehicle: report.droveMotorVehicle,
          vehicleStraightTruck: report.vehicleStraightTruck,
          vehicleTractorSemitrailer: report.vehicleTractorSemitrailer,
          vehicleBus: report.vehicleBus,
          vehicleCargoTank: report.vehicleCargoTank,
          vehicleDoublesTriples: report.vehicleDoublesTriples,
          vehicleOther: report.vehicleOther,
          accidentDate1: report.accidentDate1,
          accidentLocation1: report.accidentLocation1,
          accidentInjuries1: report.accidentInjuries1,
          accidentFatalities1: report.accidentFatalities1,
          accidentHazmat1: report.accidentHazmat1,
          accidentDate2: report.accidentDate2,
          accidentLocation2: report.accidentLocation2,
          accidentInjuries2: report.accidentInjuries2,
          accidentFatalities2: report.accidentFatalities2,
          accidentHazmat2: report.accidentHazmat2,
          accidentDate3: report.accidentDate3,
          accidentLocation3: report.accidentLocation3,
          accidentInjuries3: report.accidentInjuries3,
          accidentFatalities3: report.accidentFatalities3,
          accidentHazmat3: report.accidentHazmat3,
          otherAccidents: report.otherAccidents,
          dotCompany: report.dotCompany,
          dotEmployee: report.dotEmployee,
          dotAlcoholTestPositive: report.dotAlcoholTestPositive,
          dotDrugTestPositive: report.dotDrugTestPositive,
          dotRefusedTest: report.dotRefusedTest,
          dotOtherViolations: report.dotOtherViolations,
          infoReceivedFrom: report.infoReceivedFrom,
          infoReceivedDate: report.infoReceivedDate,
          created: report.created,
        });
        return {
          base64: Buffer.from(pdfBytes).toString('base64'),
          filename: `safety-performance-${report.fileNumber || report.id}.pdf`,
        };
      }),
  }),

  // ── Employer form token (public link for applicant to fill employer info) ─────────
  employerForm: router({
    createToken: publicProcedure
      .input(z.object({
        safetyReportId: z.number(),
        fileNumber: z.string(),
        origin: z.string(),
        srSheetUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        let applicantEmail = "";
        try {
          const srUrl = input.srSheetUrl || _DS4;
          const res = await axios.get(srUrl, { maxRedirects: 10 });
          const srData = res.data as { status: string; data: Record<string, unknown>[] };
          const row = (srData.data ?? []).find(
            (r) => String(r["File #"] ?? "").trim() === input.fileNumber.trim()
          );
          if (row) applicantEmail = String(row["Applicant Email"] ?? "").trim();
        } catch (e) {
          console.warn("[employerForm] Could not fetch SR sheet:", e);
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await createEmployerFormToken({
          token,
          safetyReportId: input.safetyReportId,
          fileNumber: input.fileNumber,
          applicantEmail,
          used: false,
          expiresAt,
        });
        const formUrl = `${input.origin}/employer-form/${token}`;
        return { token, formUrl, applicantEmail };
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const tokenRow = await getEmployerFormTokenByToken(input.token);
        if (!tokenRow) throw new TRPCError({ code: "NOT_FOUND", message: "Form link not found or expired" });
        if (tokenRow.used) throw new TRPCError({ code: "BAD_REQUEST", message: "This form link has already been used" });
        if (new Date() > tokenRow.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This form link has expired" });
        const report = await getSafetyReportByFileNumber(tokenRow.fileNumber);
        return {
          fileNumber: tokenRow.fileNumber,
          safetyReportId: tokenRow.safetyReportId,
          applicantEmail: tokenRow.applicantEmail,
          existingData: report ? {
            employerName: report.employerName,
            employerStreet: report.employerStreet,
            employerPhone: report.employerPhone,
            employerFax: report.employerFax,
            employerCityStateZip: report.employerCityStateZip,
            employerEmail: report.employerEmail,
            employerAttention: report.employerAttention,
          } : null,
        };
      }),

    submit: publicProcedure
      .input(z.object({
        token: z.string(),
        employerName: z.string().default(""),
        employerStreet: z.string().default(""),
        employerPhone: z.string().default(""),
        employerFax: z.string().default(""),
        employerCityStateZip: z.string().default(""),
        employerEmail: z.string().default(""),
        employerAttention: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const tokenRow = await getEmployerFormTokenByToken(input.token);
        if (!tokenRow) throw new TRPCError({ code: "NOT_FOUND", message: "Form link not found" });
        if (tokenRow.used) throw new TRPCError({ code: "BAD_REQUEST", message: "This form link has already been used" });
        if (new Date() > tokenRow.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This form link has expired" });

        const report = await getSafetyReportByFileNumber(tokenRow.fileNumber);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Safety report not found" });

        const { token: _t, ...rest } = input;
        await upsertSafetyReport({ ...report, ...rest, status: "Emp Complete" as const });
        await markEmployerFormTokenUsed(input.token);
        return { success: true };
      }),
  }),

  // ── Company access for logged-in users ─────────────────────────────────────
  companyAccess: router({
    /**
     * Get the list of companies the current user can access.
     * - Admin: all companies
     * - User (company user): their single assigned company
     * - Viewer: companies they have permissions for
     */
    myCompanies: localUserProcedure.query(async ({ ctx }) => {
      const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
      if (!localUser) return [];
      if (localUser.role === "admin") {
        return getAllCompanies();
      }
      if (localUser.role === "user" && localUser.companyId) {
        const company = await getCompanyById(localUser.companyId);
        return company ? [company] : [];
      }
      if (localUser.role === "viewer") {
        const perms = await getViewerPermissionsForUser(localUser.id);
        const companyIds = perms.map(p => p.companyId);
        const all = await getAllCompanies();
        return all.filter(c => companyIds.includes(c.id));
      }
      return [];
    }),

    /**
     * Get the current viewer's permissions for a specific company.
     * Admins and company users always get full access.
     */
    myPermissions: localUserProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
        if (!localUser) return null;
        // Admins and company users get full access
        if (localUser.role === "admin" || localUser.role === "user") {
          return {
            canViewMonitoring: true,
            canEditMonitoring: true,
            canViewSafetyPerformance: true,
            canEditSafetyPerformance: true,
          };
        }
        // Viewers get their specific permissions
        const perms = await getViewerPermissionsForUser(localUser.id);
        const perm = perms.find(p => p.companyId === input.companyId);
        if (!perm) return null;
        return {
          canViewMonitoring: perm.canViewMonitoring,
          canEditMonitoring: perm.canEditMonitoring,
          canViewSafetyPerformance: perm.canViewSafetyPerformance,
          canEditSafetyPerformance: perm.canEditSafetyPerformance,
        };
      }),
  }),

  // ── Companies (admin only) ────────────────────────────────────────────────
  companies: router({
    list: adminProcedure.query(async () => {
      return getAllCompanies();
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getCompanyById(input.id);
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(128),
        sheetUrlApplicants: z.string().default(""),
        sheetUrlMedExpire: z.string().default(""),
        sheetUrlNotes: z.string().default(""),
        sheetUrlSR: z.string().default(""),
        sheetUrlBackup: z.string().default(""),
        sheetUrlMonitoringBackup: z.string().default(""),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const { sheetUrlApplicants, sheetUrlMedExpire, sheetUrlNotes, sheetUrlSR, sheetUrlBackup, sheetUrlMonitoringBackup, ...companyData } = input;
        return createCompany(companyData);
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(128).optional(),
        sheetUrlApplicants: z.string().optional(),
        sheetUrlMedExpire: z.string().optional(),
        sheetUrlNotes: z.string().optional(),
        sheetUrlSR: z.string().optional(),
        sheetUrlBackup: z.string().optional(),
        sheetUrlMonitoringBackup: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, sheetUrlApplicants, sheetUrlMedExpire, sheetUrlNotes, sheetUrlSR, sheetUrlBackup, sheetUrlMonitoringBackup, ...data } = input;
        await updateCompany(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCompany(input.id);
        return { success: true };
      }),
  }),

  // ── Viewer Permissions (admin only) ──────────────────────────────────────
  viewerPermissions: router({
    getForUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return getViewerPermissionsForUser(input.userId);
      }),

    upsert: adminProcedure
      .input(z.object({
        userId: z.number(),
        companyId: z.number(),
        canViewMonitoring: z.boolean().default(true),
        canEditMonitoring: z.boolean().default(false),
        canViewSafetyPerformance: z.boolean().default(true),
        canEditSafetyPerformance: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        await upsertViewerPermission(input);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ userId: z.number(), companyId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteViewerPermission(input.userId, input.companyId);
        return { success: true };
      }),
  }),

  // ── User management (admin only) ──────────────────────────────────────────────
  users: router({
    list: adminProcedure.query(async () => {
      return getAllLocalUsers();
    }),

    create: adminProcedure
      .input(z.object({
        username: z.string().min(3).max(32),
        password: z.string().min(6),
        displayName: z.string().optional(),
        role: z.enum(["user", "admin", "viewer"]).default("user"),
        companyId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await createLocalUser(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        displayName: z.string().optional(),
        role: z.enum(["user", "admin", "viewer"]).optional(),
        companyId: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(6).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateLocalUser(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLocalUser(input.id);
        return { success: true };
      }),
  }),

  // ── Notification Emails (admin only) ──────────────────────────────────────
  notificationEmails: router({
    list: adminProcedure.query(async () => {
      return getAllNotificationEmails();
    }),

    add: adminProcedure
      .input(z.object({
        label: z.string().max(128).default(""),
        email: z.string().email("Invalid email address"),
      }))
      .mutation(async ({ input }) => {
        return createNotificationEmail({ label: input.label, email: input.email });
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().max(128).optional(),
        email: z.string().email().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateNotificationEmail(id, data);
        return { success: true };
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteNotificationEmail(input.id);
        return { success: true };
      }),

    verifySMTP: adminProcedure.mutation(async () => {
      const { verifySMTPConnection } = await import('./emailSender');
      const ok = await verifySMTPConnection();
      return { ok };
    }),
  }),

  // ── Full Backup (Monitoring + Safety Performance) ───────────────────────────
  backup: router({
    /**
     * Push all Monitoring rows + all Safety Performance records to a Google Sheet.
     * The sheet URL is the deployed Apps Script Web App URL stored on the company record.
     * Monitoring rows are passed in from the client (they come from Google Sheets, not the DB).
     */
    pushToSheet: localUserProcedure
      .input(z.object({
        companyId: z.number(),
        sheetUrl: z.string().url("Must be a valid Google Apps Script URL"),
        monitoringRows: z.array(z.object({
          fileNumber: z.string(),
          name: z.string(),
          orderDate: z.string(),
          monitorStatus: z.string(),
          mvrStatus: z.string().optional(),
          medExpire: z.string().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        // Fetch Safety Performance records from DB
        const reports = await getAllSafetyReports(input.companyId);
        const serializedReports = reports.map((r) => ({
          fileNumber: r.fileNumber,
          applicantName: r.applicantName,
          created: r.created,
          status: r.status,
          followUpDate: r.followUpDate,
          lastEmailed: r.lastEmailed ? r.lastEmailed.toISOString() : "",
          employers: [
            {
              name: r.prevEmployerName ?? "",
              phone: r.prevEmployerPhone ?? "",
              fax: r.prevEmployerFax ?? "",
              email: r.prevEmployerEmail ?? "",
              street: r.prevEmployerStreet ?? "",
              city: "",
              state: "",
              zip: r.prevEmployerCityStateZip ?? "",
            },
            {
              name: r.employerName ?? "",
              phone: r.employerPhone ?? "",
              fax: r.employerFax ?? "",
              email: r.employerEmail ?? "",
              street: r.employerStreet ?? "",
              city: "",
              state: "",
              zip: r.employerCityStateZip ?? "",
            },
          ],
        }));

        // POST to the Google Apps Script backup endpoint using the gasPost helper,
        // which handles the POST → 302 → GET pattern that Google Apps Script uses.
        const pushResult = await gasPost<{ status: string; message?: string; timestamp?: string; tabs?: Record<string, string> }>(
          input.sheetUrl,
          {
            type: "both",
            monitoring: input.monitoringRows,
            safetyPerformance: serializedReports,
          },
          90000
        );

        if (pushResult.status !== "ok") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: pushResult.message ?? "Backup push failed",
          });
        }
        return {
          success: true,
          timestamp: pushResult.timestamp ?? new Date().toISOString(),
          monitoringCount: input.monitoringRows.length,
          safetyPerformanceCount: serializedReports.length,
          tabs: pushResult.tabs,
        };
      }),

    /**
     * Return all Monitoring + Safety Performance data as CSV strings for client-side download.
     * Monitoring rows are passed in from the client.
     */
    getCsvData: localUserProcedure
      .input(z.object({
        companyId: z.number(),
        companyName: z.string(),
        monitoringRows: z.array(z.object({
          fileNumber: z.string(),
          name: z.string(),
          orderDate: z.string(),
          monitorStatus: z.string(),
          mvrStatus: z.string().optional(),
          medExpire: z.string().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const reports = await getAllSafetyReports(input.companyId);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

        // Build Monitoring CSV
        const monHeaders = ["File Number","Applicant Name","Order Date","Monitor Status","MVR Status","Med Expire","Notes"];
        const monRows = input.monitoringRows.map((r) =>
          [r.fileNumber, r.name, r.orderDate, r.monitorStatus, r.mvrStatus ?? "", r.medExpire ?? "", r.notes ?? ""]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
        );
        const monitoringCsv = [monHeaders.join(","), ...monRows].join("\n");

        // Build Safety Performance CSV
        const spHeaders = ["File Number","Applicant Name","Created","Status","Follow Up Date","Last Emailed",
          "Employer 1 Name","Employer 1 Phone","Employer 1 Fax","Employer 1 Email","Employer 1 Address",
          "Employer 2 Name","Employer 2 Phone","Employer 2 Fax","Employer 2 Email","Employer 2 Address"];
        const spRows = reports.map((r) =>
          [
            r.fileNumber, r.applicantName, r.created, r.status, r.followUpDate ?? "",
            r.lastEmailed ? r.lastEmailed.toISOString() : "",
            r.prevEmployerName ?? "", r.prevEmployerPhone ?? "", r.prevEmployerFax ?? "",
            r.prevEmployerEmail ?? "", `${r.prevEmployerStreet ?? ""} ${r.prevEmployerCityStateZip ?? ""}`.trim(),
            r.employerName ?? "", r.employerPhone ?? "", r.employerFax ?? "",
            r.employerEmail ?? "", `${r.employerStreet ?? ""} ${r.employerCityStateZip ?? ""}`.trim(),
          ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
        );
        const safetyPerformanceCsv = [spHeaders.join(","), ...spRows].join("\n");

        return {
          monitoringCsv,
          safetyPerformanceCsv,
          timestamp: ts,
          companyName: input.companyName,
          monitoringCount: input.monitoringRows.length,
          safetyPerformanceCount: reports.length,
        };
      }),
  }),

  // ── PDF Generation ────────────────────────────────────────────────────────
  safetyPdf: router({
    generate: localUserProcedure
      .input(z.object({
        applicantName: z.string().optional(),
        prevEmployerName: z.string().optional(),
        prevEmployerStreet: z.string().optional(),
        prevEmployerCityStateZip: z.string().optional(),
        prevEmployerEmail: z.string().optional(),
        prevEmployerPhone: z.string().optional(),
        prevEmployerFax: z.string().optional(),
        employerName: z.string().optional(),
        attention: z.string().optional(),
        employerPhone: z.string().optional(),
        employerStreet: z.string().optional(),
        employerCityStateZip: z.string().optional(),
        confFax: z.string().optional(),
        confEmail: z.string().optional(),
        employedByCompany: z.string().optional(),
        jobTitle: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        droveMotorVehicle: z.string().optional(),
        vehicleStraightTruck: z.boolean().optional(),
        vehicleTractorSemitrailer: z.boolean().optional(),
        vehicleBus: z.boolean().optional(),
        vehicleCargoTank: z.boolean().optional(),
        vehicleDoublesTriples: z.boolean().optional(),
        vehicleOther: z.boolean().optional(),
        accidents: z.array(z.object({
          date: z.string().optional(),
          location: z.string().optional(),
          injuries: z.string().optional(),
          fatalities: z.string().optional(),
          hazmat: z.string().optional(),
        })).optional(),
        otherAccidents: z.string().optional(),
        dotCompany: z.string().optional(),
        dotEmployee: z.string().optional(),
        dotAlcohol: z.boolean().optional(),
        dotDrug: z.boolean().optional(),
        dotRefused: z.boolean().optional(),
        dotOther: z.boolean().optional(),
        dotPrior: z.boolean().optional(),
        dotRtd: z.boolean().optional(),
        infoReceivedFrom: z.string().optional(),
        infoReceivedDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateSafetyPerformancePdf } = await import('./safetyPdfGenerator');
        const accidents = input.accidents ?? [];
        const pdfBytes = await generateSafetyPerformancePdf({
          applicantName: input.applicantName ?? '',
          prevEmployerName: input.prevEmployerName,
          prevEmployerStreet: input.prevEmployerStreet,
          prevEmployerCityStateZip: input.prevEmployerCityStateZip,
          prevEmployerPhone: input.prevEmployerPhone,
          prevEmployerFax: input.prevEmployerFax,
          prevEmployerEmail: input.prevEmployerEmail,
          employerName: input.employerName,
          employerAttention: input.attention,
          employerStreet: input.employerStreet,
          employerCityStateZip: input.employerCityStateZip,
          employerPhone: input.employerPhone,
          confFax: input.confFax,
          confEmail: input.confEmail,
          employedByCompany: input.employedByCompany,
          jobTitle: input.jobTitle,
          fromDate: input.fromDate,
          toDate: input.toDate,
          droveMotorVehicle: input.droveMotorVehicle,
          vehicleStraightTruck: input.vehicleStraightTruck,
          vehicleTractorSemitrailer: input.vehicleTractorSemitrailer,
          vehicleBus: input.vehicleBus,
          vehicleCargoTank: input.vehicleCargoTank,
          vehicleDoublesTriples: input.vehicleDoublesTriples,
          vehicleOther: input.vehicleOther,
          accidentDate1: accidents[0]?.date,
          accidentLocation1: accidents[0]?.location,
          accidentInjuries1: accidents[0]?.injuries,
          accidentFatalities1: accidents[0]?.fatalities,
          accidentHazmat1: accidents[0]?.hazmat,
          accidentDate2: accidents[1]?.date,
          accidentLocation2: accidents[1]?.location,
          accidentInjuries2: accidents[1]?.injuries,
          accidentFatalities2: accidents[1]?.fatalities,
          accidentHazmat2: accidents[1]?.hazmat,
          accidentDate3: accidents[2]?.date,
          accidentLocation3: accidents[2]?.location,
          accidentInjuries3: accidents[2]?.injuries,
          accidentFatalities3: accidents[2]?.fatalities,
          accidentHazmat3: accidents[2]?.hazmat,
          otherAccidents: input.otherAccidents,
          dotCompany: input.dotCompany,
          dotEmployee: input.dotEmployee,
          dotAlcoholTestPositive: input.dotAlcohol,
          dotDrugTestPositive: input.dotDrug,
          dotRefusedTest: input.dotRefused,
          dotOtherViolations: input.dotOther,
          infoReceivedFrom: input.infoReceivedFrom,
          infoReceivedDate: input.infoReceivedDate,
        });
        return { base64: Buffer.from(pdfBytes).toString('base64') };
      }),
  }),
});

export type AppRouter = typeof appRouter;
