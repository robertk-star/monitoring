import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const { Pool } = pg;
const SESSION_COOKIE = "saffhire_session";
const COOKIE_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "saffhire-dev-secret");

type LocalUserRow = {
  id: number;
  username: string;
  passwordHash: string;
  displayName: string | null;
  role: "user" | "admin" | "viewer";
  companyId: number | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

function sendJson(res: any, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

function setCookie(res: any, token: string, maxAgeSeconds: number) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    "Secure",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; "));
}

function publicUser(user: LocalUserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    role: user.role,
    companyId: user.companyId ?? null,
    mustChangePassword: user.mustChangePassword,
    isDemo: user.username === "demo",
  };
}

function createPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

async function getUserByUsername(username: string): Promise<LocalUserRow | null> {
  const pool = createPool();
  try {
    const result = await pool.query(
      `select id, username, "passwordHash", "displayName", role, "companyId", "isActive", "mustChangePassword"
       from local_users
       where lower(username) = lower($1)
       limit 1`,
      [username.trim()]
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

async function getOnlyActiveAdmin(): Promise<LocalUserRow | null> {
  const pool = createPool();
  try {
    const result = await pool.query(
      `select id, username, "passwordHash", "displayName", role, "companyId", "isActive", "mustChangePassword"
       from local_users
       where role = 'admin' and "isActive" = true
       order by id asc
       limit 2`
    );
    return result.rows.length === 1 ? result.rows[0] : null;
  } finally {
    await pool.end();
  }
}

async function updateLastSignedIn(id: number) {
  const pool = createPool();
  try {
    await pool.query(`update local_users set "lastSignedIn" = now(), "updatedAt" = now() where id = $1`, [id]);
  } finally {
    await pool.end();
  }
}

async function signSession(user: LocalUserRow, expiresIn: string) {
  return new SignJWT({ sub: String(user.id), role: user.role, name: user.displayName ?? user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(COOKIE_SECRET);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { status: "error", message: "Method not allowed" });

  try {
    if (!process.env.DATABASE_URL) return sendJson(res, 500, { status: "error", message: "DATABASE_URL is missing in Vercel" });
    if (!process.env.JWT_SECRET) return sendJson(res, 500, { status: "error", message: "JWT_SECRET is missing in Vercel" });

    const body = await readBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const rememberMe = Boolean(body.rememberMe);

    let user = await getUserByUsername(username);
    if (!user || !user.isActive) {
      user = await getOnlyActiveAdmin();
    }

    if (!user || !user.isActive) {
      return sendJson(res, 401, { status: "error", message: "No active admin user was found. Create or reset the admin user in Supabase." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return sendJson(res, 401, { status: "error", message: "Password did not match the admin account. Reset the admin password in Supabase or use the password created during setup." });
    }

    await updateLastSignedIn(user.id);

    const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
    const token = await signSession(user, rememberMe ? "30d" : "1d");
    setCookie(res, token, maxAgeSeconds);

    return sendJson(res, 200, {
      status: "ok",
      success: true,
      mustChangePassword: user.mustChangePassword,
      user: publicUser(user),
    });
  } catch (error: any) {
    console.error("[api/auth/login]", error);
    return sendJson(res, 500, { status: "error", message: error?.message || "Could not log in" });
  }
}
