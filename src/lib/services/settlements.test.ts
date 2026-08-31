import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase, withCompany } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import { createSettlement, listOpenDocuments } from "./settlements";

const companyId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const otherCustomerId = randomUUID();
const invoiceId = randomUUID();
const billId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 정산 담당자",
  email: "settlements@example.invalid",
  companyName: "Synthetic Settlement Company",
  companyTimezone: "UTC",
  role: "owner",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-settlements-"));
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

  await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO companies (id, slug, name, timezone) VALUES ($1, 'synthetic-settlements', 'Synthetic Settlement Company', 'UTC')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'settlements@example.invalid', '합성 정산 담당자', 'not-a-login-password-hash')",
      [userId],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', 'SYN-SETTLEMENT-CUSTOMER', 'Synthetic Settlement Customer'),
              ($3, $2, 'customer', 'SYN-SETTLEMENT-OTHER', 'Synthetic Other Customer')`,
      [customerId, companyId, otherCustomerId],
    );
    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date,
          grand_total, created_by)
       VALUES
         ($1, $2, 'invoice', 'SYN-SETTLEMENT-INVOICE', $3, 'posted', CURRENT_DATE, CURRENT_DATE, 100, $4),
         ($5, $2, 'bill', 'SYN-SETTLEMENT-BILL', $6, 'posted', CURRENT_DATE, CURRENT_DATE, 80, $4)`,
      [invoiceId, companyId, customerId, userId, billId, otherCustomerId],
    );
  });
}, 60_000);

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("settlement service and ledger constraints", () => {
  it("allocates a receipt and reports the remaining open amount", async () => {
    await createSettlement(session, {
      counterpartyId: customerId,
      direction: "receipt",
      amount: "40",
      settledOn: "2026-08-31",
      method: "bank",
      documentIds: [invoiceId],
    });

    const open = await listOpenDocuments(companyId, "invoice", "UTC");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: invoiceId, grand_total: "100.0000", allocated: "40.0000", open_amount: "60.0000" });
  });

  it("rejects direction, counterparty, and settlement-total mismatches in the database", async () => {
    await expect(withCompany(companyId, async (tx) => {
      const settlementId = randomUUID();
      await tx.query(
        `INSERT INTO settlements
           (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
         VALUES ($1, $2, $3, 'payment', 10, CURRENT_DATE, 'bank', $4)`,
        [settlementId, companyId, customerId, userId],
      );
      await tx.query(
        `INSERT INTO settlement_allocations (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, 1)`,
        [randomUUID(), companyId, settlementId, invoiceId],
      );
    })).rejects.toThrow(/direction/i);

    await expect(withCompany(companyId, async (tx) => {
      const settlementId = randomUUID();
      await tx.query(
        `INSERT INTO settlements
           (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
         VALUES ($1, $2, $3, 'receipt', 10, CURRENT_DATE, 'bank', $4)`,
        [settlementId, companyId, customerId, userId],
      );
      await tx.query(
        `INSERT INTO settlement_allocations (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, 11)`,
        [randomUUID(), companyId, settlementId, invoiceId],
      );
    })).rejects.toThrow(/settlement amount/i);

    await expect(withCompany(companyId, async (tx) => {
      const settlementId = randomUUID();
      await tx.query(
        `INSERT INTO settlements
           (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
         VALUES ($1, $2, $3, 'receipt', 10, CURRENT_DATE, 'bank', $4)`,
        [settlementId, companyId, customerId, userId],
      );
      await tx.query(
        `INSERT INTO settlement_allocations (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, 1)`,
        [randomUUID(), companyId, settlementId, billId],
      );
    })).rejects.toThrow(/counterparty|direction/i);

    await expect(withCompany(companyId, (tx) => tx.query(
      "UPDATE documents SET grand_total = 1 WHERE id = $1",
      [invoiceId],
    ))).rejects.toThrow(/immutable/i);
  });
});
