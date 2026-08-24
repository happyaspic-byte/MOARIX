import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import {
  getDatabase,
  withCompany,
  type QueryResult,
  type TransactionClient,
} from "@/lib/db/client";
import type { Role } from "@/lib/security/permissions";
import { updateMember } from "./admin";

const companyId = randomUUID();
const firstOwnerId = randomUUID();
const secondOwnerId = randomUUID();
let databaseDirectory = "";

function ownerSession(userId: string): SessionContext {
  return {
    sessionId: randomUUID(),
    userId,
    companyId,
    userName: "Synthetic Owner",
    email: `${userId}@example.invalid`,
    companyName: "Synthetic Owner Invariant",
    companyTimezone: "Asia/Seoul",
    role: "owner",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };
}

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-admin-service-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  await database.query(
    "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-owner-invariant', 'Synthetic Owner Invariant')",
    [companyId],
  );
  await database.query(
    `INSERT INTO users (id, email, name, password_hash) VALUES
       ($1, $3, 'Synthetic Owner A', 'not-a-login-password-hash'),
       ($2, $4, 'Synthetic Owner B', 'not-a-login-password-hash')`,
    [firstOwnerId, secondOwnerId, `${firstOwnerId}@example.invalid`, `${secondOwnerId}@example.invalid`],
  );
  await database.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES
       ($1, $2, 'owner'),
       ($1, $3, 'owner')`,
    [companyId, firstOwnerId, secondOwnerId],
  );
});

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("administrator owner invariant", () => {
  it("locks the complete active-owner set in deterministic order before the target row", async () => {
    const database = await getDatabase();
    const statements: Array<{ text: string; params: unknown[] }> = [];
    const fakeQuery = async (text: string, params: unknown[] = []): Promise<QueryResult> => {
      statements.push({ text, params });
      if (text.includes("FROM company_members m JOIN users u")) {
        return {
          rows: [{ role: "owner", is_active: true, name: "Synthetic Owner B" }],
          rowCount: 1,
        };
      }
      if (text.includes("COUNT(*)::text AS count")) {
        return { rows: [{ count: "2" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    const fakeTransaction: TransactionClient = {
      query: fakeQuery as TransactionClient["query"],
      exec: async () => undefined,
    };
    const transactionSpy = vi.spyOn(database, "transaction");
    transactionSpy.mockImplementationOnce(
      (async (work: (tx: TransactionClient) => Promise<unknown>) => work(fakeTransaction)) as typeof database.transaction,
    );

    await updateMember(ownerSession(firstOwnerId), {
      userId: secondOwnerId,
      role: "admin",
      isActive: true,
    });
    transactionSpy.mockRestore();

    const normalized = statements.map(({ text }) => text.replace(/\s+/g, " ").trim());
    const ownerLockIndex = normalized.findIndex((text) =>
      text.includes("role = 'owner' AND is_active = true ORDER BY user_id FOR UPDATE"),
    );
    const targetLockIndex = normalized.findIndex((text) =>
      text.includes("FROM company_members m JOIN users u ON u.id = m.user_id"),
    );

    expect(ownerLockIndex).toBeGreaterThan(-1);
    expect(targetLockIndex).toBeGreaterThan(ownerLockIndex);
    expect(normalized[targetLockIndex]).toContain("FOR UPDATE OF m");
    expect(statements[ownerLockIndex]?.params).toEqual([companyId]);
  });

  it("allows one owner demotion and rejects the mutation that would leave zero owners", async () => {
    await updateMember(ownerSession(firstOwnerId), {
      userId: secondOwnerId,
      role: "admin",
      isActive: true,
    });

    await expect(
      updateMember(ownerSession(firstOwnerId), {
        userId: firstOwnerId,
        role: "admin",
        isActive: true,
      }),
    ).rejects.toThrow("Cannot change the last active owner");

    const state = await withCompany(companyId, async (tx) => {
      const memberships = await tx.query<{ user_id: string; role: Role; is_active: boolean }>(
        `SELECT user_id, role, is_active
         FROM company_members
         WHERE company_id = $1
         ORDER BY user_id`,
        [companyId],
      );
      const audits = await tx.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE company_id = $1 AND action = 'member.updated'",
        [companyId],
      );
      return { memberships: memberships.rows, audits: audits.rows };
    });

    expect(state.memberships).toEqual(
      [
        { user_id: firstOwnerId, role: "owner", is_active: true },
        { user_id: secondOwnerId, role: "admin", is_active: true },
      ].sort((left, right) => left.user_id.localeCompare(right.user_id)),
    );
    expect(state.audits).toHaveLength(1);
  });
});
