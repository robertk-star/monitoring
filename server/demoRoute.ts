/**
 * Public demo route — GET /api/demo
 *
 * Creates a session cookie for the "demo" local user and redirects to the
 * dashboard home page. No password is required. If the demo user does not
 * exist yet, it is created automatically and assigned to the Demo company.
 *
 * The demo user:
 *   - username: "demo"
 *   - role: "user"  (company-scoped, no admin access)
 *   - companyId: the id of the company whose slug is "demo"
 *   - mustChangePassword: false
 *   - isActive: true
 *   - Session expires after 8 hours
 */

import type { Express, Request, Response } from "express";
import { getAllCompanies, getLocalUserByUsername, createLocalUser, updateLocalUser } from "./db";
import { signLocalSession } from "./localSession";
import { LOCAL_SESSION_COOKIE } from "./localSession";
import { getSessionCookieOptions } from "./_core/cookies";

const DEMO_USERNAME = "demo";
const DEMO_DISPLAY_NAME = "Demo Viewer";
const DEMO_COMPANY_SLUG = "demo";
const SESSION_EXPIRES = "8h";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

async function getOrCreateDemoUser(): Promise<{ id: number; role: "user"; displayName: string } | null> {
  // Find the Demo company
  const companies = await getAllCompanies();
  const demoCompany = companies.find(
    (c) => c.slug === DEMO_COMPANY_SLUG || c.name.toLowerCase() === "demo"
  );

  if (!demoCompany) {
    console.warn("[demo] No company with slug='demo' found. Cannot create demo session.");
    return null;
  }

  // Get or create the demo local user
  let user = await getLocalUserByUsername(DEMO_USERNAME);

  if (!user) {
    // Create with a random secure password — nobody will ever log in with it
    const randomPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    await createLocalUser({
      username: DEMO_USERNAME,
      password: randomPassword,
      displayName: DEMO_DISPLAY_NAME,
      role: "user",
      companyId: demoCompany.id,
    });
    user = await getLocalUserByUsername(DEMO_USERNAME);
  }

  if (!user) return null;

  // Ensure the demo user is always active, never forced to change password,
  // and always points to the current demo company
  if (
    !user.isActive ||
    user.mustChangePassword ||
    user.companyId !== demoCompany.id
  ) {
    await updateLocalUser(user.id, {
      isActive: true,
      mustChangePassword: false,
      companyId: demoCompany.id,
    });
  }

  return { id: user.id, role: "user", displayName: DEMO_DISPLAY_NAME };
}

export function registerDemoRoute(app: Express) {
  app.get("/api/demo", async (req: Request, res: Response) => {
    try {
      const demoUser = await getOrCreateDemoUser();

      if (!demoUser) {
        res.status(503).send(
          "Demo mode is not available yet. Please ask an admin to create a company with slug 'demo'."
        );
        return;
      }

      const token = await signLocalSession(demoUser, SESSION_EXPIRES);
      const cookieOptions = getSessionCookieOptions(req);

      res.cookie(LOCAL_SESSION_COOKIE, token, {
        ...cookieOptions,
        maxAge: SESSION_MAX_AGE_MS,
      });

      // Redirect to the dashboard home
      res.redirect("/");
    } catch (err) {
      console.error("[demo] Failed to create demo session:", err);
      res.status(500).send("Failed to start demo session. Please try again.");
    }
  });
}
