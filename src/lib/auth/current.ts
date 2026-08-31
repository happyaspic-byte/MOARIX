import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./repository";
import { assertPermission, type Permission } from "@/lib/security/permissions";

const secureCookieName = "__Host-moarix_session";
const localCookieName = "moarix_session";

export function secureCookies() {
  // Production must fail closed. Local HTTP smoke/E2E tests may explicitly opt
  // into insecure cookies, but an accidental COOKIE_SECURE=false cannot weaken
  // a real deployment.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true") return true;
  if (process.env.COOKIE_SECURE !== undefined) return process.env.COOKIE_SECURE === "true";
  return process.env.NODE_ENV === "production";
}

export function sessionCookieName() {
  return secureCookies() ? secureCookieName : localCookieName;
}

export async function readSessionToken() {
  const store = await cookies();
  if (secureCookies()) return store.get(secureCookieName)?.value ?? null;
  return store.get(localCookieName)?.value ?? store.get(secureCookieName)?.value ?? null;
}

export async function getCurrentSession() {
  const token = await readSessionToken();
  return token ? findSession(token) : null;
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  assertPermission(session.role, permission);
  return session;
}
