import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module to avoid real database calls in tests
vi.mock("./db", () => ({
  verifyLocalUserPassword: vi.fn(),
  getLocalUserById: vi.fn(),
  countLocalUsers: vi.fn(),
  createLocalUser: vi.fn(),
  getAllLocalUsers: vi.fn(),
  updateLocalUser: vi.fn(),
  deleteLocalUser: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// Mock localSession so adminProcedure and localAuth.me can be tested without real JWTs
vi.mock("./localSession", () => ({
  LOCAL_SESSION_COOKIE: "saffhire_session",
  signLocalSession: vi.fn().mockResolvedValue("mock-jwt-token"),
  getLocalUserFromCookie: vi.fn(),
}));

import * as db from "./db";
import * as localSession from "./localSession";

const ADMIN_USER = {
  id: 1,
  username: "admin",
  passwordHash: "$2a$12$hash",
  displayName: "Admin User",
  role: "admin" as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: null,
};

function createPublicContext(): { ctx: TrpcContext; cookies: Record<string, string> } {
  const cookies: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => { cookies[name] = value; },
      clearCookie: (name: string) => { delete cookies[name]; },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies };
}

function createAdminContext(): TrpcContext {
  // Make getLocalUserFromCookie return an admin user so adminProcedure passes
  vi.mocked(localSession.getLocalUserFromCookie).mockResolvedValue(ADMIN_USER);

  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: { saffhire_session: "mock-token" },
    } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("localAuth.hasUsers", () => {
  it("returns false when no users exist", async () => {
    vi.mocked(db.countLocalUsers).mockResolvedValue(0);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.localAuth.hasUsers();
    expect(result).toEqual({ hasUsers: false });
  });

  it("returns true when users exist", async () => {
    vi.mocked(db.countLocalUsers).mockResolvedValue(3);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.localAuth.hasUsers();
    expect(result).toEqual({ hasUsers: true });
  });
});

describe("localAuth.login", () => {
  it("returns success and sets cookie on valid credentials", async () => {
    vi.mocked(db.verifyLocalUserPassword).mockResolvedValue(ADMIN_USER);

    const { ctx, cookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.localAuth.login({ username: "admin", password: "password123" });

    expect(result.success).toBe(true);
    expect(result.user.username).toBe("admin");
    expect(result.user.role).toBe("admin");
    expect(cookies["saffhire_session"]).toBe("mock-jwt-token");
  });

  it("throws UNAUTHORIZED on invalid credentials", async () => {
    vi.mocked(db.verifyLocalUserPassword).mockResolvedValue(null);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.localAuth.login({ username: "admin", password: "wrongpassword" })
    ).rejects.toThrow("Invalid username or password");
  });
});

describe("localAuth.setupAdmin", () => {
  it("creates admin account when no users exist", async () => {
    vi.mocked(db.countLocalUsers).mockResolvedValue(0);
    vi.mocked(db.createLocalUser).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.localAuth.setupAdmin({ username: "admin", password: "password123" });
    expect(result).toEqual({ success: true });
    expect(db.createLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "admin", role: "admin" })
    );
  });

  it("rejects setup when users already exist", async () => {
    vi.mocked(db.countLocalUsers).mockResolvedValue(1);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.localAuth.setupAdmin({ username: "admin2", password: "password123" })
    ).rejects.toThrow("Setup already complete");
  });
});

describe("users.list (admin only)", () => {
  it("returns user list for admin", async () => {
    vi.mocked(db.getAllLocalUsers).mockResolvedValue([
      { id: 1, username: "admin", displayName: "Admin", role: "admin", isActive: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null },
    ]);
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.users.list();
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("admin");
  });
});
