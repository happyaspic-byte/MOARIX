import { getDatabase } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import type { Role } from "@/lib/security/permissions";
import { createSessionToken, hashSessionToken } from "@/lib/security/session-token";

export const API_TOKEN_MARKER = "mxk_";
export const standardApiTokenResources = [
  "context",
  "master",
  "assets",
  "cases",
  "inspections",
  "quotes",
  "trips",
  "reports",
] as const;

export type StandardApiTokenResource = (typeof standardApiTokenResources)[number];
export type ApiTokenAction = "read" | "write" | "approve";
export type ApiTokenScope = string;

export type ApiTokenContext = SessionContext & {
  authenticationType: "api_token";
  apiTokenId: string;
  apiTokenName: string;
  apiTokenPrefix: string;
  scopes: string[];
};

const TOKEN_PATTERN = /^mxk_[A-Za-z0-9_-]{43}$/;
const SCOPE_PATTERN = /^(?:\*|[a-z][a-z0-9_-]{0,49}:(?:read|write|approve|\*))$/;
const API_TOKEN_HASH_DOMAIN = "moarix:api-token:";
const standardResourceSet = new Set<string>(standardApiTokenResources);

export function normalizeApiTokenScopes(scopes: readonly string[]) {
  const normalized = [...new Set(scopes.map((scope) => scope.trim().toLowerCase()))].sort();
  const invalid = normalized.some((scope) => {
    if (!SCOPE_PATTERN.test(scope)) return true;
    if (scope === "*") return false;
    return !standardResourceSet.has(scope.split(":", 1)[0]!);
  });
  if (normalized.length === 0 || invalid) {
    throw new Error("API token scopes must use *, a supported resource:*, or supported resource:read/resource:write values");
  }
  return normalized;
}

export function hasApiTokenScope(
  scopes: readonly string[],
  required: string,
) {
  const normalizedRequired = required.trim().toLowerCase();
  const match = /^([a-z][a-z0-9_-]{0,49}):(read|write|approve)$/.exec(normalizedRequired);
  if (!match) return false;
  const resource = match[1];
  return scopes.includes("*")
    || scopes.includes(`${resource}:*`)
    || scopes.includes(normalizedRequired);
}

export function hashApiToken(token: string) {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required to hash API tokens in production");
  }
  return hashSessionToken(`${API_TOKEN_HASH_DOMAIN}${token}`);
}

export function createApiTokenCredential() {
  const token = `${API_TOKEN_MARKER}${createSessionToken()}`;
  return {
    token,
    tokenHash: hashApiToken(token),
    tokenPrefix: token.slice(0, 16),
  };
}

export async function authenticateApiToken(token: string): Promise<ApiTokenContext | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const database = await getDatabase();
  const result = await database.query<{
    api_token_id: string;
    api_token_name: string;
    api_token_prefix: string;
    user_id: string;
    company_id: string;
    user_name: string;
    email: string;
    company_name: string;
    company_timezone: string;
    role: Role;
    scopes: string[];
    expires_at: Date | string;
  }>("SELECT * FROM public.moarix_find_api_token($1)", [hashApiToken(token)]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    sessionId: row.api_token_id,
    authenticationType: "api_token",
    apiTokenId: row.api_token_id,
    apiTokenName: row.api_token_name,
    apiTokenPrefix: row.api_token_prefix,
    scopes: row.scopes,
    userId: row.user_id,
    companyId: row.company_id,
    userName: row.user_name,
    email: row.email,
    companyName: row.company_name,
    companyTimezone: row.company_timezone,
    role: row.role,
    expiresAt: new Date(row.expires_at),
  };
}
