import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase, withCompany } from "@/lib/db/client";
import { getCustomer360 } from "./customer-360";

const companyId = randomUUID();
const otherCompanyId = randomUUID();
const customerId = randomUUID();
const otherCustomerId = randomUUID();
const siteId = randomUUID();
const assetId = randomUUID();
let databaseDirectory = "";

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-customer-360-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }
  await database.query(
    `INSERT INTO companies (id, slug, name) VALUES
       ($1, 'synthetic-customer-360', 'Synthetic Customer 360'),
       ($2, 'synthetic-other-company', 'Synthetic Other Company')`,
    [companyId, otherCompanyId],
  );
  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', 'SYN-C360', 'Synthetic Customer')`,
      [customerId, companyId],
    );
    await tx.query(
      `INSERT INTO customer_sites
         (id, company_id, counterparty_id, code, name, si_contact_name, si_contact_phone, si_contact_email)
       VALUES ($1, $2, $3, 'SYN-SITE', 'Synthetic Site', 'Synthetic SI', '02-000-0000', 'si@example.invalid')`,
      [siteId, companyId, customerId],
    );
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, protection_mode, management_ip)
       VALUES ($1, $2, $3, $4, 'SYN-C360-ASSET', 'synthetic-c360-vendor-id',
               'Synthetic everRun', 'everrun', 'ft', '192.0.2.80')`,
      [assetId, companyId, customerId, siteId],
    );
  });
  await withCompany(otherCompanyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', 'SYN-OTHER', 'Synthetic Other Customer')`,
      [otherCustomerId, otherCompanyId],
    );
  });
});

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("customer 360 service", () => {
  it("returns the customer's sites and assets while hiding another tenant", async () => {
    const workspace = await getCustomer360(companyId, customerId);
    expect(workspace?.customer).toMatchObject({ id: customerId, name: "Synthetic Customer" });
    expect(workspace?.sites).toMatchObject([{
      id: siteId,
      asset_count: 1,
      si_contact_name: "Synthetic SI",
      si_contact_phone: "02-000-0000",
      si_contact_email: "si@example.invalid",
    }]);
    expect(workspace?.assets).toMatchObject([{ id: assetId, product_family: "everrun" }]);
    expect(workspace?.cases).toEqual([]);
    expect(workspace?.inspections).toEqual([]);

    await expect(getCustomer360(companyId, otherCustomerId)).resolves.toBeNull();
  }, 20_000);
});
