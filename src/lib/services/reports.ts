import { withCompany } from "@/lib/db/client";
import type { AssetSupportRiskState } from "@/lib/domain/asset-support-risk";
import { assetLicenseHealthCte, assetSupportRiskCtes } from "./asset-risk-sql";

export type DocumentSummaryRow = { kind: string; status: string; document_count: string; total_amount: string };
export type CounterpartySummaryRow = { counterparty_name: string; invoice_total: string; bill_total: string; document_count: string };
export type StockValueRow = { warehouse_name: string; sku: string; item_name: string; available: string; estimated_value: string; reorder_point: string };
export type OperationalSupportState = Exclude<AssetSupportRiskState, "retired">;
export type SupportSummaryRow = { support_state: OperationalSupportState; asset_count: string };
export type SupportQueueRow = {
  asset_id: string;
  asset_tag: string;
  vendor_asset_id: string | null;
  product_name: string;
  customer_name: string;
  site_name: string | null;
  customer_band: string;
  vendor_band: string;
  customer_support_until: string | null;
  vendor_support_until: string | null;
  next_inspection_date: string | null;
  support_state: OperationalSupportState;
};
export type LicenseSummaryRow = { license_state: "covered" | "renewal_90" | "renewal_60" | "renewal_30" | "expires_today" | "expired" | "unknown" | "perpetual" | "suspended" | "retired"; license_count: string };
export type LicenseQueueRow = {
  license_id: string;
  asset_id: string;
  asset_tag: string;
  vendor_asset_id: string | null;
  asset_product_name: string;
  license_product_name: string;
  license_type: string;
  expires_on: string | null;
  license_state: LicenseSummaryRow["license_state"];
};
export type InspectionSummaryRow = { status: string; inspection_count: string };
export type InspectionDueQueueRow = { id: string; number: string; asset_id: string; asset_tag: string; customer_name: string; site_name: string; status: string; scheduled_date: string; due_state: "overdue" | "due_today" | "due_30" };

export function getStandardReports(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [documentSummary, counterpartySummary, stockValue, supportSummary, supportQueue, licenseSummary, licenseQueue, inspectionSummary, inspectionDueQueue] = await Promise.all([
      tx.query<DocumentSummaryRow>(
        `SELECT kind, status, COUNT(*)::text AS document_count,
                COALESCE(SUM(grand_total), 0)::text AS total_amount
         FROM documents
         WHERE issue_date >= date_trunc('year', moarix_company_today())
           AND issue_date < date_trunc('year', moarix_company_today()) + interval '1 year'
         GROUP BY kind, status
         ORDER BY kind, status`,
      ),
      tx.query<CounterpartySummaryRow>(
        `SELECT c.name AS counterparty_name,
                COALESCE(SUM(d.grand_total) FILTER (WHERE d.kind = 'invoice' AND d.status = 'posted'), 0)::text AS invoice_total,
                COALESCE(SUM(d.grand_total) FILTER (WHERE d.kind = 'bill' AND d.status = 'posted'), 0)::text AS bill_total,
                COUNT(d.id)::text AS document_count
         FROM counterparties c
         LEFT JOIN documents d ON d.company_id = c.company_id AND d.counterparty_id = c.id
           AND d.issue_date >= date_trunc('year', moarix_company_today())
           AND d.issue_date < date_trunc('year', moarix_company_today()) + interval '1 year'
         GROUP BY c.id, c.name
         HAVING COUNT(d.id) > 0
         ORDER BY SUM(d.grand_total) DESC NULLS LAST
         LIMIT 20`,
      ),
      tx.query<StockValueRow>(
        `SELECT w.name AS warehouse_name, i.sku, i.name AS item_name,
                (b.on_hand - b.reserved)::text AS available,
                ((b.on_hand - b.reserved) * i.purchase_price)::text AS estimated_value,
                i.reorder_point::text
         FROM inventory_balances b
         JOIN warehouses w ON w.company_id = b.company_id AND w.id = b.warehouse_id
         JOIN items i ON i.company_id = b.company_id AND i.id = b.item_id
         ORDER BY ((b.on_hand - b.reserved) * i.purchase_price) DESC`,
      ),
      tx.query<SupportSummaryRow>(
        `WITH ${assetSupportRiskCtes}
         SELECT support_state, COUNT(*)::text AS asset_count
         FROM asset_support_risks
         GROUP BY support_state
         ORDER BY CASE support_state
           WHEN 'vendor_gap' THEN 1 WHEN 'not_contracted' THEN 2 WHEN 'expired' THEN 3
           WHEN 'expires_today' THEN 4 WHEN 'renewal_30' THEN 5 WHEN 'renewal_60' THEN 6
           WHEN 'renewal_90' THEN 7 WHEN 'vendor_unverified' THEN 8 WHEN 'unknown' THEN 9 ELSE 10 END`,
      ),
      tx.query<SupportQueueRow>(
        `WITH ${assetSupportRiskCtes}
         SELECT risk.asset_id, risk.asset_tag, risk.vendor_asset_id, risk.product_name,
                customer.name AS customer_name, COALESCE(site.name, risk.site) AS site_name,
                risk.customer_band, risk.vendor_band,
                risk.customer_support_until::text, risk.vendor_support_until::text,
                risk.next_inspection_date::text, risk.support_state
         FROM asset_support_risks risk
         JOIN counterparties customer
           ON customer.company_id = risk.company_id AND customer.id = risk.counterparty_id
         LEFT JOIN customer_sites site
           ON site.company_id = risk.company_id AND site.id = risk.site_id
         WHERE risk.support_state <> 'covered'
         ORDER BY CASE risk.support_state
           WHEN 'vendor_gap' THEN 1 WHEN 'not_contracted' THEN 2 WHEN 'expired' THEN 3
           WHEN 'expires_today' THEN 4 WHEN 'renewal_30' THEN 5 WHEN 'renewal_60' THEN 6
           WHEN 'renewal_90' THEN 7 WHEN 'vendor_unverified' THEN 8 ELSE 9 END,
           LEAST(risk.customer_support_until, risk.vendor_support_until) NULLS FIRST,
           customer.name, risk.asset_tag
         LIMIT 100`,
      ),
      tx.query<LicenseSummaryRow>(
        `WITH ${assetLicenseHealthCte}
         SELECT license_state, COUNT(*)::text AS license_count
         FROM operational_license_health
         GROUP BY license_state
         ORDER BY CASE license_state
           WHEN 'expired' THEN 1 WHEN 'expires_today' THEN 2 WHEN 'renewal_30' THEN 3
           WHEN 'renewal_60' THEN 4 WHEN 'renewal_90' THEN 5 WHEN 'unknown' THEN 6
           WHEN 'suspended' THEN 7 WHEN 'covered' THEN 8 WHEN 'perpetual' THEN 9 ELSE 10 END`,
      ),
      tx.query<LicenseQueueRow>(
        `WITH ${assetLicenseHealthCte}
         SELECT license_id, asset_id, asset_tag, vendor_asset_id, asset_product_name,
                license_product_name, license_type, expires_on::text, license_state
         FROM operational_license_health
         WHERE license_state IN ('expired', 'expires_today', 'renewal_30', 'renewal_60', 'renewal_90', 'unknown')
         ORDER BY CASE license_state
           WHEN 'expired' THEN 1 WHEN 'expires_today' THEN 2 WHEN 'renewal_30' THEN 3
           WHEN 'renewal_60' THEN 4 WHEN 'renewal_90' THEN 5 ELSE 6 END,
           expires_on NULLS FIRST, asset_tag, license_product_name
         LIMIT 100`,
      ),
      tx.query<InspectionSummaryRow>(
        `SELECT status, COUNT(*)::text AS inspection_count
         FROM maintenance_inspections
         WHERE scheduled_date >= date_trunc('year', moarix_company_today())
           AND scheduled_date < date_trunc('year', moarix_company_today()) + interval '1 year'
         GROUP BY status
         ORDER BY CASE status WHEN 'issue_found' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'scheduled' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END`,
      ),
      tx.query<InspectionDueQueueRow>(
        `SELECT inspection.id, inspection.number, inspection.asset_id, asset.asset_tag,
                customer.name AS customer_name, site.name AS site_name,
                inspection.status, inspection.scheduled_date::text,
                CASE
                  WHEN inspection.scheduled_date < moarix_company_today() THEN 'overdue'
                  WHEN inspection.scheduled_date = moarix_company_today() THEN 'due_today'
                  ELSE 'due_30'
                END AS due_state
         FROM maintenance_inspections inspection
         JOIN assets asset ON asset.company_id = inspection.company_id AND asset.id = inspection.asset_id
         JOIN counterparties customer ON customer.company_id = asset.company_id AND customer.id = asset.counterparty_id
         JOIN customer_sites site ON site.company_id = inspection.company_id AND site.id = inspection.site_id
         WHERE inspection.status IN ('scheduled', 'in_progress', 'issue_found')
           AND inspection.scheduled_date <= moarix_company_today() + 30
         ORDER BY CASE
           WHEN inspection.scheduled_date < moarix_company_today() THEN 1
           WHEN inspection.scheduled_date = moarix_company_today() THEN 2 ELSE 3 END,
           inspection.scheduled_date, inspection.created_at
         LIMIT 100`,
      ),
    ]);
    return {
      documentSummary: documentSummary.rows,
      counterpartySummary: counterpartySummary.rows,
      stockValue: stockValue.rows,
      supportSummary: supportSummary.rows,
      supportQueue: supportQueue.rows,
      licenseSummary: licenseSummary.rows,
      licenseQueue: licenseQueue.rows,
      inspectionSummary: inspectionSummary.rows,
      inspectionDueQueue: inspectionDueQueue.rows,
    };
  });
}
