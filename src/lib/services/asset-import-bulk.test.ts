import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import { bulkImportAssets } from "./asset-import-service";
import { createCounterparty } from "./master-data";
import { createCustomerSite } from "./operations-service";

const companyId = randomUUID();
const userId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 자산 가져오기 관리자",
  email: "asset-import-test@example.invalid",
  companyName: "Synthetic Asset Import Test",
  companyTimezone: "Asia/Seoul",
  role: "owner",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-asset-import-"));
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
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-asset-import', 'Synthetic Asset Import Test')",
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

describe("bulkImportAssets customer and site reassignment", () => {
  it("moves an existing asset to a different customer and site when the CSV target changes", async () => {
    const sourceCustomerId = await createCounterparty(session, {
      code: "synthetic-source",
      kind: "customer",
      name: "Synthetic Source Customer",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const sourceSiteId = await createCustomerSite(session, {
      counterpartyId: sourceCustomerId,
      code: "synthetic-source-site",
      name: "Synthetic Source Site",
      timezone: "Asia/Seoul",
    });
    const targetCustomerId = await createCounterparty(session, {
      code: "synthetic-target",
      kind: "customer",
      name: "Synthetic Target Customer",
      paymentTermsDays: 0,
      creditLimit: "0",
    });
    const targetSiteId = await createCustomerSite(session, {
      counterpartyId: targetCustomerId,
      code: "synthetic-target-site",
      name: "Synthetic Target Site",
      timezone: "Asia/Seoul",
    });

    const created = await bulkImportAssets(session, [{
      lineNumber: 2,
      assetTag: "SYN-ASSET-REHOME-001",
      vendorAssetId: "SYN-VENDOR-REHOME-001",
      productName: "everRun Express",
      productFamily: "everrun",
      productModel: "everRun Express",
      softwareVersion: "",
      protectionMode: "ha",
      operatingSystem: "",
      managementIp: "",
      serialNumber: "SYN-ASSET-REHOME-001",
      status: "active",
      customerCode: "SYNTHETIC-SOURCE",
      siteCode: "SYNTHETIC-SOURCE-SITE",
      businessSystem: "SYN-VENDOR-REHOME-001 - everRun Express",
      environment: "production",
      hardwareVendor: "",
      rackLocation: "",
      serviceMethod: "hybrid",
      installedAt: "",
      warrantyUntil: "",
      supportUntil: "2026-09-30",
      notes: "initial placement",
    }]);
    expect(created).toMatchObject({ totalCount: 1, insertedCount: 1, updatedCount: 0 });

    const moved = await bulkImportAssets(session, [{
      lineNumber: 2,
      assetTag: "SYN-ASSET-REHOME-001",
      vendorAssetId: "SYN-VENDOR-REHOME-001",
      productName: "everRun Express",
      productFamily: "everrun",
      productModel: "everRun Express",
      softwareVersion: "",
      protectionMode: "ha",
      operatingSystem: "",
      managementIp: "",
      serialNumber: "SYN-ASSET-REHOME-001",
      status: "active",
      customerCode: "SYNTHETIC-TARGET",
      siteCode: "SYNTHETIC-TARGET-SITE",
      businessSystem: "SYN-VENDOR-REHOME-001 - everRun Express",
      environment: "production",
      hardwareVendor: "",
      rackLocation: "",
      serviceMethod: "hybrid",
      installedAt: "",
      warrantyUntil: "",
      supportUntil: "2026-09-30",
      notes: "entitlement rehome",
    }]);
    expect(moved).toMatchObject({ totalCount: 1, insertedCount: 0, updatedCount: 1 });

    const after = await withCompany(companyId, async (tx) => {
      const result = await tx.query<{
        counterparty_id: string;
        site_id: string;
        asset_tag: string;
        notes: string | null;
      }>(
        `SELECT counterparty_id, site_id, asset_tag, notes
         FROM assets WHERE company_id = $1 AND lower(asset_tag) = lower('SYN-ASSET-REHOME-001')`,
        [companyId],
      );
      return result.rows[0];
    });
    expect(after?.counterparty_id).toBe(targetCustomerId);
    expect(after?.site_id).toBe(targetSiteId);
    expect(after?.counterparty_id).not.toBe(sourceCustomerId);
    expect(after?.site_id).not.toBe(sourceSiteId);
    expect(after?.notes).toBe("entitlement rehome");
  }, 20_000);
});
