import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/lib/db/client";
import {
  createApiTokenCredential,
  authenticateApiToken,
  hasApiTokenScope,
  hashApiToken,
  normalizeApiTokenScopes,
} from "./api-token";

const companyId = randomUUID();
const userId = randomUUID();
let databaseDirectory = "";

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-api-token-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");
  process.env.SESSION_SECRET = "api-token-unit-test-secret-with-at-least-32-characters";

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-api-token', 'Synthetic API Token Company')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'api-token@example.invalid', '합성 API 사용자', 'not-a-login-hash')",
      [userId],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'manager')",
      [companyId, userId],
    );
  });
}, 90_000);

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("API token credentials", () => {
  it("creates opaque 256-bit credentials and stores only a safe prefix/hash representation", () => {
    const first = createApiTokenCredential();
    const second = createApiTokenCredential();

    expect(first.token).toMatch(/^mxk_[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenPrefix).toBe(first.token.slice(0, 16));
    expect(first.tokenHash).toHaveLength(64);
    expect(first.tokenHash).toBe(hashApiToken(first.token));
    expect(first.tokenHash).not.toContain(first.tokenPrefix);
  });

  it("refuses the development HMAC fallback in production", () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", "");
      expect(() => createApiTokenCredential()).toThrow(/SESSION_SECRET/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("normalizes scopes and recognizes exact, resource and global grants", () => {
    expect(normalizeApiTokenScopes([" Assets:Read ", "assets:read", "cases:*", "trips:approve"]))
      .toEqual(["assets:read", "cases:*", "trips:approve"]);
    expect(() => normalizeApiTokenScopes([])).toThrow(/scopes/i);
    expect(() => normalizeApiTokenScopes(["assets:delete"])).toThrow(/scopes/i);
    expect(() => normalizeApiTokenScopes(["unknown:read"])).toThrow(/scopes/i);
    expect(hasApiTokenScope(["assets:read"], "assets:read")).toBe(true);
    expect(hasApiTokenScope(["assets:read"], "assets:write")).toBe(false);
    expect(hasApiTokenScope(["cases:*"], "cases:write")).toBe(true);
    expect(hasApiTokenScope(["trips:write"], "trips:approve")).toBe(false);
    expect(hasApiTokenScope(["trips:approve"], "trips:approve")).toBe(true);
    expect(hasApiTokenScope(["*"], "trips:write")).toBe(true);
    expect(hasApiTokenScope(["*"], "trips:delete")).toBe(false);
  });

  it("restores an active tenant context and rejects revoked or expired credentials", async () => {
    const database = await getDatabase();
    const active = createApiTokenCredential();
    const activeId = randomUUID();
    await database.query(
      `INSERT INTO api_tokens
         (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, 'Synthetic CLI', $4, $5, $6, now() + interval '1 day')`,
      [activeId, companyId, userId, active.tokenHash, active.tokenPrefix, ["assets:read", "cases:*"]],
    );
    const stored = await database.query<{ token_hash: string; token_prefix: string }>(
      "SELECT token_hash::text, token_prefix FROM api_tokens WHERE id = $1",
      [activeId],
    );
    expect(stored.rows).toEqual([{ token_hash: active.tokenHash, token_prefix: active.tokenPrefix }]);
    expect(Object.values(stored.rows[0]!)).not.toContain(active.token);

    await expect(authenticateApiToken(active.token)).resolves.toMatchObject({
      sessionId: activeId,
      authenticationType: "api_token",
      apiTokenId: activeId,
      apiTokenName: "Synthetic CLI",
      apiTokenPrefix: active.tokenPrefix,
      companyId,
      userId,
      role: "manager",
      scopes: ["assets:read", "cases:*"],
    });
    const lastUsed = await database.query<{ used: boolean }>(
      "SELECT last_used_at IS NOT NULL AS used FROM api_tokens WHERE id = $1",
      [activeId],
    );
    expect(lastUsed.rows).toEqual([{ used: true }]);

    await database.query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1", [activeId]);
    await expect(authenticateApiToken(active.token)).resolves.toBeNull();

    const expired = createApiTokenCredential();
    await database.query(
      `INSERT INTO api_tokens
         (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at, created_at)
       VALUES ($1, $2, $3, 'Expired CLI', $4, $5, $6,
               now() - interval '1 minute', now() - interval '1 day')`,
      [randomUUID(), companyId, userId, expired.tokenHash, expired.tokenPrefix, ["context:read"]],
    );
    await expect(authenticateApiToken(expired.token)).resolves.toBeNull();
    await expect(authenticateApiToken("not-an-api-token")).resolves.toBeNull();

    const inactiveMember = createApiTokenCredential();
    await database.query(
      `INSERT INTO api_tokens
         (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, 'Inactive member CLI', $4, $5, $6, now() + interval '1 day')`,
      [randomUUID(), companyId, userId, inactiveMember.tokenHash, inactiveMember.tokenPrefix, ["context:read"]],
    );
    await database.query(
      "UPDATE company_members SET is_active = false WHERE company_id = $1 AND user_id = $2",
      [companyId, userId],
    );
    await expect(authenticateApiToken(inactiveMember.token)).resolves.toBeNull();
  });
});
