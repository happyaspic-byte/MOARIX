import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import {
  createCounterparty,
  deleteCounterparty,
  getCounterparty,
  listCounterparties,
  updateCounterparty,
} from "./master-data";
import { createCustomerSite, deleteCustomerSite } from "./operations-service";

const companyId = randomUUID();
const userId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 기준정보 관리자",
  email: "master-data-test@example.invalid",
  companyName: "Synthetic Master Data Test",
  companyTimezone: "Asia/Seoul",
  role: "owner",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-master-data-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-master-data', 'Synthetic Master Data Test')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, 'not-a-login-password-hash')",
      [userId, session.email, session.userName],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
  });
});

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("counterparty update and delete", () => {
  it("updates customer fields, reactivates a soft-deleted row, and blocks delete while sites or assets remain", async () => {
    const id = await createCounterparty(session, {
      code: "syn-cust",
      kind: "customer",
      name: "합성 고객",
      representativeName: "담당자 A",
      email: "a@example.invalid",
      phone: "010-0000-0001",
      address: "서울",
      paymentTermsDays: 30,
      creditLimit: "0",
    });

    const updated = await updateCounterparty(session, id, {
      code: "syn-cust",
      kind: "customer",
      name: "합성 고객 수정",
      representativeName: "담당자 B",
      email: "",
      phone: "010-0000-0002",
      address: "",
      paymentTermsDays: 45,
      creditLimit: "1000",
    });
    expect(updated).toMatchObject({
      id,
      code: "SYN-CUST",
      name: "합성 고객 수정",
      representative_name: "담당자 B",
      email: null,
      phone: "010-0000-0002",
      address: null,
      payment_terms_days: 45,
      credit_limit: "1000.0000",
      is_active: true,
    });

    const siteId = await createCustomerSite(session, {
      counterpartyId: id,
      code: "plant-1",
      name: "합성 공장",
      contactName: "현장 담당",
      contactPhone: "010-1111-2222",
      contactEmail: "site@example.invalid",
      timezone: "Asia/Seoul",
    });
    await expect(deleteCounterparty(session, id)).rejects.toThrow("Counterparty has linked sites");

    await deleteCustomerSite(session, siteId);
    await deleteCounterparty(session, id);
    const afterDelete = await getCounterparty(companyId, id);
    expect(afterDelete?.is_active).toBe(false);
    expect((await listCounterparties(companyId)).some((row) => row.id === id && row.is_active)).toBe(false);

    const reactivated = await updateCounterparty(session, id, {
      code: "syn-cust",
      kind: "customer",
      name: "합성 고객 재활성",
      paymentTermsDays: 15,
      creditLimit: "0",
    });
    expect(reactivated.is_active).toBe(true);
    expect(reactivated.name).toBe("합성 고객 재활성");
  }, 20_000);

  it("refuses to delete a customer that still has a non-retired asset", async () => {
    const customerId = await createCounterparty(session, {
      code: "syn-asset-cust",
      kind: "customer",
      name: "자산 연결 고객",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const siteId = await createCustomerSite(session, {
      counterpartyId: customerId,
      code: "asset-site",
      name: "자산 사업장",
      timezone: "Asia/Seoul",
    });
    await withCompany(companyId, async (tx) => {
      await tx.query(
        `INSERT INTO assets
           (id, company_id, counterparty_id, site_id, asset_tag, product_name, product_family, protection_mode)
         VALUES ($1, $2, $3, $4, 'SYN-CP-ASSET', 'Synthetic Platform', 'everrun', 'ha')`,
        [randomUUID(), companyId, customerId, siteId],
      );
    });

    await expect(deleteCounterparty(session, customerId)).rejects.toThrow("Counterparty has linked assets");
    await expect(deleteCustomerSite(session, siteId)).rejects.toThrow("Customer site has linked assets");
  }, 20_000);

  it("rejects updates and deletes for an unknown counterparty", async () => {
    const missing = randomUUID();
    await expect(updateCounterparty(session, missing, {
      code: "missing",
      kind: "customer",
      name: "없는 거래처",
      paymentTermsDays: 0,
      creditLimit: "0",
    })).rejects.toThrow("Counterparty not found");
    await expect(deleteCounterparty(session, missing)).rejects.toThrow("Counterparty not found");
  }, 20_000);
});
