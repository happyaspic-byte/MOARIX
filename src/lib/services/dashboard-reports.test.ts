import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase, withCompany } from "@/lib/db/client";
import { getDashboard } from "./dashboard";
import { getStandardReports } from "./reports";

const companyId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const siteId = randomUUID();
const assetIds = new Map<string, string>();
let databaseDirectory = "";

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-dashboard-reports-"));
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
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-report-test', 'Synthetic Report Test')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'report-test@example.invalid', '합성 보고서 담당자', 'not-a-login-password-hash')",
      [userId],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      "INSERT INTO counterparties (id, company_id, kind, code, name) VALUES ($1, $2, 'customer', 'SYN-REPORT-CUSTOMER', 'Synthetic Report Customer')",
      [customerId, companyId],
    );
    await tx.query(
      "INSERT INTO customer_sites (id, company_id, counterparty_id, code, name) VALUES ($1, $2, $3, 'SYN-REPORT-SITE', 'Synthetic Report Site')",
      [siteId, companyId, customerId],
    );

    const fixtures = [
      { key: "d90", customerStatus: "active", customerDays: 90, vendorStatus: "active" },
      { key: "d60", customerStatus: "active", customerDays: 60, vendorStatus: "active" },
      { key: "d30", customerStatus: "active", customerDays: 30, vendorStatus: "active" },
      { key: "d0", customerStatus: "active", customerDays: 0, vendorStatus: "active" },
      { key: "customer-expired", customerStatus: "expired", customerDays: -1, vendorStatus: "active" },
      { key: "customer-uncontracted", customerStatus: "not_contracted", customerDays: null, vendorStatus: "active" },
      { key: "vendor-gap", customerStatus: "active", customerDays: 365, vendorStatus: "not_contracted" },
      { key: "vendor-unverified", customerStatus: "active", customerDays: 365, vendorStatus: null },
      { key: "covered", customerStatus: "active", customerDays: 365, vendorStatus: "active" },
    ] as const;

    for (const [position, fixture] of fixtures.entries()) {
      const assetId = randomUUID();
      assetIds.set(fixture.key, assetId);
      await tx.query(
        `INSERT INTO assets
           (id, company_id, counterparty_id, site_id, asset_tag, product_name,
            product_family, protection_mode, contract_status, support_until)
         VALUES ($1, $2, $3, $4, $5, 'Synthetic Support Fixture', 'everrun', 'ft', $6,
                 CASE WHEN $7::integer IS NULL THEN NULL ELSE moarix_company_today() + $7::integer END)`,
        [assetId, companyId, customerId, siteId, `SYN-RISK-${String(position + 1).padStart(2, "0")}`, fixture.customerStatus, fixture.customerDays],
      );
      if (fixture.vendorStatus) {
        await tx.query(
          `INSERT INTO asset_support_contracts
             (id, company_id, asset_id, scope, status, provider_name, service_method,
              ends_on, coverage_summary, created_by)
           VALUES ($1, $2, $3, 'vendor_support', $4, 'Synthetic Vendor', 'remote',
                   CASE WHEN $4 = 'not_contracted' THEN NULL ELSE moarix_company_today() + 365 END,
                   '합성 벤더 지원 검증 데이터', $5)`,
          [randomUUID(), companyId, assetId, fixture.vendorStatus, userId],
        );
      }
    }

    const coveredAssetId = assetIds.get("covered");
    if (!coveredAssetId) throw new Error("Synthetic covered asset fixture is missing");
    await tx.query(
      `INSERT INTO asset_licenses
         (id, company_id, asset_id, product_name, license_type, quantity, status, expires_on, created_by)
       VALUES
         ($1, $4, $5, 'Synthetic D60 License', 'subscription', 1, 'active', moarix_company_today() + 60, $6),
         ($2, $4, $5, 'Synthetic Expired License', 'subscription', 1, 'active', moarix_company_today() - 1, $6),
         ($3, $4, $5, 'Synthetic Perpetual License', 'perpetual', 1, 'active', NULL, $6)`,
      [randomUUID(), randomUUID(), randomUUID(), companyId, coveredAssetId, userId],
    );
    await tx.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, status,
          scheduled_date, engineer_id, created_by)
       VALUES ($1, $2, 'INSP-SYN-REPORT-01', $3, $4, 'quarterly', 'scheduled',
               moarix_company_today() + 20, $5, $5)`,
      [randomUUID(), companyId, coveredAssetId, siteId, userId],
    );
    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date,
          grand_total, created_by)
       VALUES
         ($1, $5, 'invoice', 'SYN-CURRENT-INVOICE', $6, 'posted', moarix_company_today(), 100, $7),
         ($2, $5, 'bill', 'SYN-CURRENT-BILL', $6, 'posted', moarix_company_today(), 50, $7),
         ($3, $5, 'invoice', 'SYN-FUTURE-INVOICE', $6, 'posted',
          (date_trunc('year', moarix_company_today()) + interval '1 year')::date, 900, $7),
         ($4, $5, 'bill', 'SYN-FUTURE-BILL', $6, 'posted',
          (date_trunc('year', moarix_company_today()) + interval '1 year')::date, 800, $7)`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), companyId, customerId, userId],
    );
    await tx.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, status,
          scheduled_date, engineer_id, created_by)
       VALUES ($1, $2, 'INSP-SYN-FUTURE-YEAR', $3, $4, 'quarterly', 'scheduled',
               (date_trunc('year', moarix_company_today()) + interval '1 year')::date, $5, $5)`,
      [randomUUID(), companyId, coveredAssetId, siteId, userId],
    );
  });
}, 60_000);

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("dashboard and reports Stratus risk SQL", () => {
  it("uses the same effective support and license boundaries as the domain model", async () => {
    const dashboard = await getDashboard(companyId);
    expect(Number(dashboard.metrics.monthSales)).toBe(100);
    expect(Number(dashboard.metrics.monthPurchases)).toBe(50);
    expect(dashboard.metrics).toMatchObject({
      renewal90Assets: 1,
      renewal60Assets: 1,
      renewal30Assets: 1,
      expiresTodayAssets: 1,
      customerExpiredAssets: 1,
      customerUncontractedAssets: 1,
      vendorGapAssets: 1,
      vendorUnverifiedAssets: 1,
      expiringLicenses: 1,
      expiredLicenses: 1,
      dueInspections: 1,
    });

    const reports = await getStandardReports(companyId);
    const documentSummary = new Map(reports.documentSummary.map((row) => [`${row.kind}:${row.status}`, row]));
    expect(documentSummary.get("invoice:posted")?.document_count).toBe("1");
    expect(Number(documentSummary.get("invoice:posted")?.total_amount)).toBe(100);
    expect(documentSummary.get("bill:posted")?.document_count).toBe("1");
    expect(Number(documentSummary.get("bill:posted")?.total_amount)).toBe(50);
    expect(reports.inspectionSummary).toEqual([
      expect.objectContaining({ status: "scheduled", inspection_count: "1" }),
    ]);
    const supportCounts = Object.fromEntries(reports.supportSummary.map((row) => [row.support_state, Number(row.asset_count)]));
    expect(supportCounts).toMatchObject({
      covered: 1,
      renewal_90: 1,
      renewal_60: 1,
      renewal_30: 1,
      expires_today: 1,
      expired: 1,
      not_contracted: 1,
      vendor_gap: 1,
      vendor_unverified: 1,
    });
    expect(reports.supportQueue).toHaveLength(8);

    const licenseCounts = Object.fromEntries(reports.licenseSummary.map((row) => [row.license_state, Number(row.license_count)]));
    expect(licenseCounts).toMatchObject({ renewal_60: 1, expired: 1, perpetual: 1 });
    expect(reports.licenseQueue).toHaveLength(2);
    expect(reports.inspectionDueQueue).toMatchObject([{ due_state: "due_30" }]);
  }, 20_000);
});
