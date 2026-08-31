import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./repository";
import { assertPermission, type Permission } from "@/lib/security/permissions";

const secureCookieName = "__Host-moarix_session";
const localCookieName = "moarix_session";

type HeaderReader = { get(name: string): string | null };

export type SessionCookiePolicy = {
  name: typeof secureCookieName | typeof localCookieName;
  secure: boolean;
};

function optionalBooleanEnvironment(name: string) {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either true or false`);
}

export function sessionCookiePolicy(): SessionCookiePolicy {
  const configuredSecure = optionalBooleanEnvironment("COOKIE_SECURE");
  const allowInsecure = optionalBooleanEnvironment("ALLOW_INSECURE_COOKIES");

  if (process.env.NODE_ENV === "production") {
    if (configuredSecure === true && allowInsecure === false) {
      return { name: secureCookieName, secure: true };
    }
    if (configuredSecure === false && allowInsecure === true) {
      return { name: localCookieName, secure: false };
    }
    throw new Error(
      "Invalid production session cookie policy: use COOKIE_SECURE=true with ALLOW_INSECURE_COOKIES=false for HTTPS, or COOKIE_SECURE=false with ALLOW_INSECURE_COOKIES=true only for trusted LAN HTTP",
    );
  }

  const secure = configuredSecure ?? false;
  return { name: secure ? secureCookieName : localCookieName, secure };
}

export function secureCookies() {
  return sessionCookiePolicy().secure;
}

export function sessionCookieName() {
  return sessionCookiePolicy().name;
}

export function requestProtocol(requestHeaders: HeaderReader): "http" | "https" | null {
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol === "http" || forwardedProtocol === "https") return forwardedProtocol;

  const origin = requestHeaders.get("origin");
  if (!origin) return null;
  try {
    const protocol = new URL(origin).protocol;
    if (protocol === "http:") return "http";
    if (protocol === "https:") return "https";
  } catch {
    // Invalid or non-HTTP origins do not provide reliable transport evidence.
  }
  return null;
}

export function hasSessionCookieTransportMismatch(requestHeaders: HeaderReader) {
  return sessionCookiePolicy().secure && requestProtocol(requestHeaders) === "http";
}

export async function readSessionToken() {
  const store = await cookies();
  const policy = sessionCookiePolicy();
  if (policy.secure) return store.get(secureCookieName)?.value ?? null;
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
