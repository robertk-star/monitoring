/**
 * Tests for notification email management procedures.
 * Covers: notificationEmails.list, .add, .remove, .update, .verifySMTP
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { Request, Response } from "express";

// ── Mock the database module ──────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getAllNotificationEmails: vi.fn(),
    getActiveNotificationEmails: vi.fn(),
    createNotificationEmail: vi.fn(),
    updateNotificationEmail: vi.fn(),
    deleteNotificationEmail: vi.fn(),
  };
});

// ── Mock the email sender ─────────────────────────────────────────────────────
vi.mock("./emailSender", () => ({
  sendMonitorStatusEmail: vi.fn().mockResolvedValue(undefined),
  verifySMTPConnection: vi.fn().mockResolvedValue(true),
}));

// ── Mock localSession so adminProcedure passes ────────────────────────────────
vi.mock("./localSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./localSession")>();
  return {
    ...actual,
    getLocalUserFromCookie: vi.fn(),
  };
});

import * as db from "./db";
import * as localSession from "./localSession";

const ADMIN_USER = {
  id: 1,
  username: "admin",
  displayName: "Admin",
  role: "admin" as const,
  companyId: null,
  isActive: true,
  mustChangePassword: false,
  passwordHash: "hash",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: null,
};

function createAdminContext() {
  vi.mocked(localSession.getLocalUserFromCookie).mockResolvedValue(ADMIN_USER);
  return {
    user: null,
    req: { cookies: { local_session: "token" } } as unknown as Request,
    res: {} as Response,
  };
}

const SAMPLE_EMAILS = [
  { id: 1, label: "Robert K", email: "robertk@saffhire.com", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, label: "Jane D", email: "janed@example.com", isActive: false, createdAt: new Date(), updatedAt: new Date() },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notificationEmails.list", () => {
  it("returns all notification emails for admin", async () => {
    vi.mocked(db.getAllNotificationEmails).mockResolvedValue(SAMPLE_EMAILS);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notificationEmails.list();
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("robertk@saffhire.com");
    expect(result[1].isActive).toBe(false);
  });
});

describe("notificationEmails.add", () => {
  it("creates a new notification email recipient", async () => {
    const newEmail = { id: 3, label: "New User", email: "new@example.com", isActive: true, createdAt: new Date(), updatedAt: new Date() };
    vi.mocked(db.createNotificationEmail).mockResolvedValue(newEmail);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notificationEmails.add({ label: "New User", email: "new@example.com" });
    expect(result.email).toBe("new@example.com");
    expect(db.createNotificationEmail).toHaveBeenCalledWith({ label: "New User", email: "new@example.com" });
  });

  it("rejects invalid email addresses", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notificationEmails.add({ label: "Bad", email: "not-an-email" })).rejects.toThrow();
  });
});

describe("notificationEmails.remove", () => {
  it("deletes a notification email by id", async () => {
    vi.mocked(db.deleteNotificationEmail).mockResolvedValue(undefined);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notificationEmails.remove({ id: 1 });
    expect(result.success).toBe(true);
    expect(db.deleteNotificationEmail).toHaveBeenCalledWith(1);
  });
});

describe("notificationEmails.update", () => {
  it("toggles isActive status", async () => {
    vi.mocked(db.updateNotificationEmail).mockResolvedValue(undefined);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notificationEmails.update({ id: 1, isActive: false });
    expect(result.success).toBe(true);
    expect(db.updateNotificationEmail).toHaveBeenCalledWith(1, { isActive: false });
  });
});

describe("notificationEmails.verifySMTP", () => {
  it("returns ok:true when SMTP connection succeeds", async () => {
    const { verifySMTPConnection } = await import("./emailSender");
    vi.mocked(verifySMTPConnection).mockResolvedValue(true);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notificationEmails.verifySMTP();
    expect(result.ok).toBe(true);
  });
});
