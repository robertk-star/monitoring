/**
 * Local session helpers — extracted into their own module so they can be
 * mocked independently in unit tests.
 */
import { jwtVerify, SignJWT } from "jose";
import { ENV } from "./_core/env";
import { getLocalUserById } from "./db";
import type { LocalUser } from "../drizzle/schema";

export const LOCAL_SESSION_COOKIE = "saffhire_session";
const JWT_ALG = "HS256";

function getJwtSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

/** Sign a JWT for a local user and return the token string.
 * @param expiresIn - JWT expiry string (e.g. "1d", "30d"). Defaults to "1d".
 */
export async function signLocalSession(
  user: Pick<LocalUser, "id" | "role" | "displayName">,
  expiresIn: string = "1d"
): Promise<string> {
  return new SignJWT({ sub: String(user.id), role: user.role, name: user.displayName })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret());
}

/** Resolve the local session cookie to a LocalUser, or return null. */
export async function getLocalUserFromCookie(
  req: { cookies?: Record<string, string> }
): Promise<LocalUser | null> {
  const token = req.cookies?.[LOCAL_SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const id = parseInt(String(payload.sub), 10);
    const user = await getLocalUserById(id);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}
