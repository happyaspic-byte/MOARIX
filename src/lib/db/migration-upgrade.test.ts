import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("database migration upgrade", () => {
  it("upgrades a populated 0.3 database through the Stratus 0.4 migrations", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "moarix-upgrade-"));
    temporaryDirectories.push(directory);
    const database = new PGlite(path.join(directory, "pglite"));
    const migrationDirectory = path.join(process.cwd(), "migrations");
    const migrations = (await readdir(migrationDirectory))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    const legacyMigrations = migrations.filter((name) => name < "005_");
    const stratusMigrations = migrations.filter((name) => name >= "005_");

    for (const name of legacyMigrations) {
      await database.exec(await readFile(path.join(migrationDirectory, name), "utf8"));
    }

    const companyId = randomUUID();
    const userId = randomUUID();
    const customerId = randomUUID();
    const siteId = randomUUID();
    const assetId = randomUUID();
    const manualDateAssetId = randomUUID();
    const caseId = randomUUID();
    const inspectionId = randomUUID();
    const secondInspectionId = randomUUID();
    const legacyDocumentId = randomUUID();
    await database.query(
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'upgrade-fixture', 'Synthetic Upgrade Fixture')",
      [companyId],
    );
    await database.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'upgrade@example.invalid', '합성 업그레이드 사용자', 'not-a-login-hash')",
      [userId],
    );
    await database.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
    await database.query("SELECT set_config('app.current_company_id', $1, false)", [companyId]);
    await database.query(
      "INSERT INTO counterparties (id, company_id, kind, code, name) VALUES ($1, $2, 'customer', 'SYN-UPGRADE', 'Synthetic Upgrade Customer')",
      [customerId, companyId],
    );
    await database.query(
      "INSERT INTO customer_sites (id, company_id, counterparty_id, code, name) VALUES ($1, $2, $3, 'SYN-SITE', 'Synthetic Upgrade Site')",
      [siteId, companyId, customerId],
    );
    await database.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, protection_mode, contract_status)
       VALUES ($1, $2, $3, $4, 'SYN-UPGRADE-ASSET', 'synthetic-upgrade-id',
               'Synthetic everRun', 'everrun', 'ft', 'active')`,
      [assetId, companyId, customerId, siteId],
    );
    await database.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, product_name,
          product_family, protection_mode, next_inspection_date)
       VALUES ($1, $2, $3, $4, 'SYN-MANUAL-DATE-ASSET', 'Synthetic Manual Date Asset',
               'other', 'none', '2026-12-31')`,
      [manualDateAssetId, companyId, customerId, siteId],
    );
    await database.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, title, created_by, updated_at)
       VALUES ($1, $2, 'SYN-UPGRADE-CASE', $3, $4, 'Synthetic Upgrade Case', $5,
               '2020-01-01T00:00:00Z')`,
      [caseId, companyId, customerId, assetId, userId],
    );
    await database.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, body, author_name, created_by, created_at)
       VALUES ($1, $2, $3, 'customer_reply', 'Synthetic legacy update',
               'Synthetic Customer', $4, '2026-03-01T00:00:00Z')`,
      [randomUUID(), companyId, caseId, userId],
    );
    await database.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, created_by)
       VALUES ($1, $2, 'quote', 'Q-2026-00001', $3, 'posted', '2027-01-15', $4)`,
      [legacyDocumentId, companyId, customerId, userId],
    );
    await database.query(
      "INSERT INTO document_counters (company_id, kind, next_value) VALUES ($1, 'quote', 2)",
      [companyId],
    );
    await database.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, scheduled_date, engineer_id, created_by)
       VALUES
         ($1, $2, 'SYN-UPGRADE-INSP', $3, $4, 'quarterly', '2026-10-20', $6, $6),
         ($5, $2, 'SYN-UPGRADE-INSP-EARLY', $3, $4, 'preventive', '2026-09-10', $6, $6)`,
      [inspectionId, companyId, assetId, siteId, secondInspectionId, userId],
    );
    await database.query("UPDATE assets SET next_inspection_date = '2026-10-20' WHERE id = $1", [assetId]);

    for (const name of stratusMigrations) {
      await database.exec(await readFile(path.join(migrationDirectory, name), "utf8"));
    }

    const preserved = await database.query<{ asset_id: string; case_id: string; inspection_id: string }>(
      `SELECT asset.id AS asset_id, service_case.id AS case_id, inspection.id AS inspection_id
       FROM assets asset
       JOIN service_cases service_case ON service_case.asset_id = asset.id
       JOIN maintenance_inspections inspection ON inspection.asset_id = asset.id
       WHERE asset.id = $1 AND inspection.id = $2`,
      [assetId, inspectionId],
    );
    expect(preserved.rows).toEqual([{ asset_id: assetId, case_id: caseId, inspection_id: inspectionId }]);

    const newTables = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN
         ('asset_nodes', 'asset_network_interfaces', 'asset_virtual_machines',
          'asset_support_contracts', 'asset_licenses', 'inspection_check_items',
          'service_case_watchers')
       ORDER BY table_name`,
    );
    expect(newTables.rows).toHaveLength(7);
    const backfilledChecklist = await database.query<{ item_count: string }>(
      `SELECT COUNT(*)::text AS item_count
       FROM inspection_check_items
       WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(backfilledChecklist.rows).toEqual([{ item_count: "6" }]);
    const yearlyCounter = await database.query<{ next_value: string }>(
      "SELECT next_value::text FROM document_counters WHERE company_id = $1 AND kind = 'quote:2026'",
      [companyId],
    );
    expect(yearlyCounter.rows).toEqual([{ next_value: "2" }]);
    const repairedInspectionDate = await database.query<{ next_inspection_date: string | null }>(
      "SELECT next_inspection_date::text FROM assets WHERE id = $1",
      [assetId],
    );
    expect(repairedInspectionDate.rows).toEqual([{ next_inspection_date: "2026-09-10" }]);
    const preservedManualDate = await database.query<{ next_inspection_date: string | null }>(
      "SELECT next_inspection_date::text FROM assets WHERE id = $1",
      [manualDateAssetId],
    );
    expect(preservedManualDate.rows).toEqual([{ next_inspection_date: "2026-12-31" }]);
    const repairedCaseUpdatedAt = await database.query<{ updated_at: string }>(
      "SELECT updated_at::text FROM service_cases WHERE id = $1",
      [caseId],
    );
    expect(new Date(repairedCaseUpdatedAt.rows[0]!.updated_at).toISOString()).toBe("2026-03-01T00:00:00.000Z");
    await database.close();
  }, 30_000);
});
