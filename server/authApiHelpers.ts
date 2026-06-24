import { parse, serialize } from "cookie";
import { LOCAL_SESSION_COOKIE } from "./localSession";

export async function readJsonBody(req: any) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

export function sendJson(res: any, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res: any) {
  sendJson(res, 405, { status: "error", message: "Method not allowed" });
}

export function attachCookies(req: any) {
  const header = req.headers?.cookie;
  req.cookies = typeof header === "string" ? parse(header) : {};
}

export function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    companyId: user.companyId ?? null,
    mustChangePassword: user.mustChangePassword,
    isDemo: user.username === "demo",
  };
}

export function setSessionCookie(res: any, token: string, maxAgeSeconds: number) {
  res.setHeader(
    "Set-Cookie",
    serialize(LOCAL_SESSION_COOKIE, token, {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      maxAge: maxAgeSeconds,
    })
  );
}

export function clearSessionCookie(res: any) {
  res.setHeader(
    "Set-Cookie",
    serialize(LOCAL_SESSION_COOKIE, "", {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      maxAge: 0,
    })
  );
}
