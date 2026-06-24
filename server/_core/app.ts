import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDemoRoute } from "../demoRoute";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getApplicants } from "../db";

/**
 * Build the API-only Express app.
 *
 * This is shared by:
 * - local/dev Express server in server/_core/index.ts
 * - Vercel serverless function in api/[...path].ts
 *
 * Do not call app.listen() in this file. Vercel imports this module and invokes
 * the Express handler for each /api/* request.
 */
export function createApiApp() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, app: "saffhire-monitoring", runtime: "api" });
  });

  app.get("/api/monitoring/applicants", async (req, res) => {
    try {
      const rawCompanyId = Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId;
      const companyId = rawCompanyId ? Number(rawCompanyId) : undefined;
      if (rawCompanyId && (!Number.isFinite(companyId) || companyId <= 0)) {
        res.status(400).json({ status: "error", message: "Invalid companyId" });
        return;
      }

      const rows = await getApplicants(companyId);
      const data = rows.map((row, index) => ({
        id: String(row.id ?? index + 1),
        fileNumber: row.fileNumber,
        name: row.applicantName,
        orderDate: row.orderDate,
        monitorStatus: row.monitorStatus,
        mvrStatus: row.mvrStatus,
        medExpire: row.medExpire ?? "",
        medExpireOverridden: row.medExpireOverridden,
        notes: row.notes,
      }));

      res.status(200).json({
        status: "ok",
        source: "supabase",
        data,
        message: data.length > 0 ? "Loaded from Supabase applicants table" : "No Supabase applicants found yet. Run Phase 1C import before switching fully off Google Sheets.",
      });
    } catch (error) {
      console.error("[monitoring/applicants] Supabase read failed:", error);
      res.status(500).json({ status: "error", message: "Failed to load Supabase applicants" });
    }
  });

  // Kept for compatibility while OAuth routes are still present in the legacy app.
  // The migrated app continues to use custom local username/password login.
  registerOAuthRoutes(app);

  // Public demo access — GET /api/demo
  registerDemoRoute(app);

  // tRPC API — /api/trpc/*
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return app;
}
