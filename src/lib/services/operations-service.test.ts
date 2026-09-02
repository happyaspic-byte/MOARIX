import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import { createCounterparty } from "./master-data";
import {
  createCustomerSite,
  deleteCustomerSite,
  getCustomerSite,
  listCustomerSites,
  updateCustomerSite,
} from "./operations-service";

const companyId = randomUUID();
const userId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 사업장 관리자",
  email: "site-test@example.invalid",
  companyName: "Synthetic Site Test",
  companyTimezone: "Asia/Seoul",
  role: "admin",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-operations-service-"));
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
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-site-test', 'Synthetic Site Test')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, 'not-a-login-password-hash')",
      [userId, session.email, session.userName],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'admin')",
      [companyId, userId],
    );
  });
});

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("customer site update and delete", () => {
  it("updates site location and contact fields, and clears the contact when the fields are empty", async () => {
    const customerId = await createCounterparty(session, {
      code: "site-cust",
      kind: "customer",
      name: "사업장 고객",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const siteId = await createCustomerSite(session, {
      counterpartyId: customerId,
      code: "changwon",
      name: "창원",
      address: "Changwon-si",
      contactName: "현장 담당",
      contactPhone: "055-000-0000",
      contactEmail: "plant@example.invalid",
      timezone: "Asia/Seoul",
    });

    await updateCustomerSite(session, siteId, {
      counterpartyId: customerId,
      code: "changwon",
      name: "창원 1공장",
      address: "Changwon-si, Gyeongsangnam-do, 51573, Korea, Republic of",
      contactName: "현장 담당 수정",
      contactPhone: "055-111-1111",
      contactEmail: "updated@example.invalid",
      timezone: "Asia/Seoul",
    });
    expect(await getCustomerSite(companyId, siteId)).toMatchObject({
      id: siteId,
      name: "창원 1공장",
      contact_name: "현장 담당 수정",
      contact_phone: "055-111-1111",
      contact_email: "updated@example.invalid",
    });

    await updateCustomerSite(session, siteId, {
      counterpartyId: customerId,
      code: "changwon",
      name: "창원 1공장",
      address: "Changwon-si, Gyeongsangnam-do, 51573, Korea, Republic of",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      timezone: "Asia/Seoul",
    });
    const cleared = await getCustomerSite(companyId, siteId);
    expect(cleared).toMatchObject({
      contact_name: null,
      contact_phone: null,
      contact_email: null,
    });
  }, 20_000);

  it("blocks moving a site to another customer while assets exist, then allows delete after the assets are retired", async () => {
    const firstCustomerId = await createCounterparty(session, {
      code: "move-from",
      kind: "customer",
      name: "이전 출발 고객",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const secondCustomerId = await createCounterparty(session, {
      code: "move-to",
      kind: "customer",
      name: "이전 도착 고객",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const siteId = await createCustomerSite(session, {
      counterpartyId: firstCustomerId,
      code: "shared-plant",
      name: "공유 공장",
      timezone: "Asia/Seoul",
    });
    const assetId = randomUUID();
    await withCompany(companyId, async (tx) => {
      await tx.query(
        `INSERT INTO assets
           (id, company_id, counterparty_id, site_id, asset_tag, product_name, product_family, protection_mode, status)
         VALUES ($1, $2, $3, $4, 'SYN-SITE-ASSET', 'Synthetic Platform', 'everrun', 'ha', 'active')`,
        [assetId, companyId, firstCustomerId, siteId],
      );
    });

    await expect(updateCustomerSite(session, siteId, {
      counterpartyId: secondCustomerId,
      code: "shared-plant",
      name: "공유 공장",
      timezone: "Asia/Seoul",
    })).rejects.toThrow("Customer site has linked assets");
    await expect(deleteCustomerSite(session, siteId)).rejects.toThrow("Customer site has linked assets");

    await withCompany(companyId, async (tx) => {
      await tx.query("UPDATE assets SET status = 'retired' WHERE id = $1", [assetId]);
    });
    await deleteCustomerSite(session, siteId);
    expect((await listCustomerSites(companyId)).some((row) => row.id === siteId)).toBe(false);

    await updateCustomerSite(session, siteId, {
      counterpartyId: firstCustomerId,
      code: "shared-plant",
      name: "공유 공장 재활성",
      timezone: "Asia/Seoul",
    });
    expect((await listCustomerSites(companyId)).some((row) => row.id === siteId && row.name === "공유 공장 재활성")).toBe(true);
    expect(await getCustomerSite(companyId, siteId)).toMatchObject({
      name: "공유 공장 재활성",
    });
  }, 20_000);

  it("rejects updates and deletes for an unknown site", async () => {
    const customerId = await createCounterparty(session, {
      code: "unknown-site-cust",
      kind: "customer",
      name: "없는 사업장 고객",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const missing = randomUUID();
    await expect(updateCustomerSite(session, missing, {
      counterpartyId: customerId,
      code: "missing",
      name: "없는 사업장",
      timezone: "Asia/Seoul",
    })).rejects.toThrow("Customer site not found");
    await expect(deleteCustomerSite(session, missing)).rejects.toThrow("Customer site not found");
  }, 20_000);
});
