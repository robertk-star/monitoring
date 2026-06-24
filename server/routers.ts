import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  countLocalUsers,
  createLocalUser,
  deleteLocalUser,
  getAllLocalUsers,
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
  createNotificationEmail,
  updateNotificationEmail,
  deleteNotificationEmail,
  getApplicants,
} from "./db";
import crypto from "crypto";
import { getLocalUserFromCookie, LOCAL_SESSION_COOKIE, signLocalSession } from "./localSession";

const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
  if (!localUser || localUser.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

const localUserProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
  if (!localUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next({ ctx });
});

const safetyReportInput = z.object({
  id: z.number().optional(),
  companyId: z.number().optional(),
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

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

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

  safetyReports: router({
    list: publicProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input }) => getAllSafetyReports(input?.companyId)),

    upsert: publicProcedure
      .input(safetyReportInput)
      .mutation(async ({ input }) => upsertSafetyReport(input)),

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

    generatePdf: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const report = await getSafetyReportById(input.id);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        const { generateSafetyPerformancePdf } = await import("./safetyPdfGenerator");
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
          base64: Buffer.from(pdfBytes).toString("base64"),
          filename: `safety-performance-${report.fileNumber || report.id}.pdf`,
        };
      }),
  }),

  employerForm: router({
    createToken: publicProcedure
      .input(z.object({
        safetyReportId: z.number(),
        fileNumber: z.string(),
        origin: z.string(),
        srSheetUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await createEmployerFormToken({
          token,
          safetyReportId: input.safetyReportId,
          fileNumber: input.fileNumber,
          applicantEmail: "",
          used: false,
          expiresAt,
        });
        const formUrl = `${input.origin}/employer-form/${token}`;
        return { token, formUrl, applicantEmail: "" };
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

        const { token: _token, ...rest } = input;
        await upsertSafetyReport({ ...report, ...rest, status: "Emp Complete" as const });
        await markEmployerFormTokenUsed(input.token);
        return { success: true };
      }),
  }),

  companyAccess: router({
    myCompanies: localUserProcedure.query(async ({ ctx }) => {
      const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
      if (!localUser) return [];
      if (localUser.role === "admin") return getAllCompanies();
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

    myPermissions: localUserProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const localUser = await getLocalUserFromCookie(ctx.req as { cookies?: Record<string, string> });
        if (!localUser) return null;
        if (localUser.role === "admin" || localUser.role === "user") {
          return {
            canViewMonitoring: true,
            canEditMonitoring: true,
            canViewSafetyPerformance: true,
            canEditSafetyPerformance: true,
          };
        }
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

  companies: router({
    list: adminProcedure.query(async () => getAllCompanies()),
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => getCompanyById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(128),
        isActive: z.boolean().default(true),
        sheetUrlApplicants: z.string().optional(),
        sheetUrlMedExpire: z.string().optional(),
        sheetUrlNotes: z.string().optional(),
        sheetUrlSR: z.string().optional(),
        sheetUrlBackup: z.string().optional(),
        sheetUrlMonitoringBackup: z.string().optional(),
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
        isActive: z.boolean().optional(),
        sheetUrlApplicants: z.string().optional(),
        sheetUrlMedExpire: z.string().optional(),
        sheetUrlNotes: z.string().optional(),
        sheetUrlSR: z.string().optional(),
        sheetUrlBackup: z.string().optional(),
        sheetUrlMonitoringBackup: z.string().optional(),
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

  viewerPermissions: router({
    getForUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => getViewerPermissionsForUser(input.userId)),
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

  users: router({
    list: adminProcedure.query(async () => getAllLocalUsers()),
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

  notificationEmails: router({
    list: adminProcedure.query(async () => getAllNotificationEmails()),
    add: adminProcedure
      .input(z.object({ label: z.string().max(128).default(""), email: z.string().email("Invalid email address") }))
      .mutation(async ({ input }) => createNotificationEmail({ label: input.label, email: input.email })),
    update: adminProcedure
      .input(z.object({ id: z.number(), label: z.string().max(128).optional(), email: z.string().email().optional(), isActive: z.boolean().optional() }))
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
      const { verifySMTPConnection } = await import("./emailSender");
      const ok = await verifySMTPConnection();
      return { ok };
    }),
  }),

  backup: router({
    getCsvData: localUserProcedure
      .input(z.object({
        companyId: z.number(),
        companyName: z.string().optional(),
        monitoringRows: z.array(z.object({
          fileNumber: z.string(),
          name: z.string(),
          orderDate: z.string(),
          monitorStatus: z.string(),
          mvrStatus: z.string().optional(),
          medExpire: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const applicants = await getApplicants(input.companyId);
        const reports = await getAllSafetyReports(input.companyId);
        const company = await getCompanyById(input.companyId);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

        const monHeaders = ["File Number", "Applicant Name", "Order Date", "Monitor Status", "MVR Status", "Med Expire", "Notes"];
        const monRows = applicants.map((r) => [r.fileNumber, r.applicantName, r.orderDate, r.monitorStatus, r.mvrStatus, r.medExpire ?? "", r.notes].map(csvEscape).join(","));
        const monitoringCsv = [monHeaders.join(","), ...monRows].join("\n");

        const spHeaders = ["File Number", "Applicant Name", "Created", "Status", "Follow Up Date", "Last Emailed", "Employer 1 Name", "Employer 1 Phone", "Employer 1 Fax", "Employer 1 Email", "Employer 1 Address", "Employer 2 Name", "Employer 2 Phone", "Employer 2 Fax", "Employer 2 Email", "Employer 2 Address"];
        const spRows = reports.map((r) => [
          r.fileNumber,
          r.applicantName,
          r.created,
          r.status,
          r.followUpDate ?? "",
          r.lastEmailed ? r.lastEmailed.toISOString() : "",
          r.prevEmployerName ?? "",
          r.prevEmployerPhone ?? "",
          r.prevEmployerFax ?? "",
          r.prevEmployerEmail ?? "",
          `${r.prevEmployerStreet ?? ""} ${r.prevEmployerCityStateZip ?? ""}`.trim(),
          r.employerName ?? "",
          r.employerPhone ?? "",
          r.employerFax ?? "",
          r.employerEmail ?? "",
          `${r.employerStreet ?? ""} ${r.employerCityStateZip ?? ""}`.trim(),
        ].map(csvEscape).join(","));
        const safetyPerformanceCsv = [spHeaders.join(","), ...spRows].join("\n");

        return {
          monitoringCsv,
          safetyPerformanceCsv,
          timestamp: ts,
          companyName: input.companyName || company?.name || "company",
          monitoringCount: applicants.length,
          safetyPerformanceCount: reports.length,
        };
      }),
  }),

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
        accidents: z.array(z.object({ date: z.string().optional(), location: z.string().optional(), injuries: z.string().optional(), fatalities: z.string().optional(), hazmat: z.string().optional() })).optional(),
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
        const { generateSafetyPerformancePdf } = await import("./safetyPdfGenerator");
        const accidents = input.accidents ?? [];
        const pdfBytes = await generateSafetyPerformancePdf({
          applicantName: input.applicantName ?? "",
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
        return { base64: Buffer.from(pdfBytes).toString("base64") };
      }),
  }),
});

export type AppRouter = typeof appRouter;
