import { withCompany } from "@/lib/db/client";
import { assetLicenseHealthCte, assetSupportRiskCtes } from "./asset-risk-sql";

export type DashboardMetrics = {
  monthSales: string;
  monthPurchases: string;
  lowStockCount: number;
  openCases: number;
  renewal90Assets: number;
  renewal60Assets: number;
  renewal30Assets: number;
  expiresTodayAssets: number;
  customerExpiredAssets: number;
  customerUncontractedAssets: number;
  vendorGapAssets: number;
  vendorUnverifiedAssets: number;
  expiringLicenses: number;
  expiredLicenses: number;
  dueInspections: number;
  pendingApprovals: number;
};

export type RecentActivity = {
  id: string;
  action: string;
  summary: string;
  created_at: string;
  actor_name: string | null;
};

export function getDashboard(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [metrics, activities, documents] = await Promise.all([
      tx.query<{
        month_sales: string;
        month_purchases: string;
        low_stock_count: string;
        open_cases: string;
        renewal_90_assets: string;
        renewal_60_assets: string;
        renewal_30_assets: string;
        expires_today_assets: string;
        customer_expired_assets: string;
        customer_uncontracted_assets: string;
        vendor_gap_assets: string;
        vendor_unverified_assets: string;
        expiring_licenses: string;
        expired_licenses: string;
        due_inspections: string;
        pending_approvals: string;
      }>(
        `WITH ${assetSupportRiskCtes}, ${assetLicenseHealthCte}
         SELECT
           COALESCE((SELECT SUM(grand_total) FROM documents
                     WHERE kind = 'invoice' AND status = 'posted'
                       AND issue_date >= date_trunc('month', moarix_company_today())
                       AND issue_date < date_trunc('month', moarix_company_today()) + interval '1 month'), 0)::text AS month_sales,
           COALESCE((SELECT SUM(grand_total) FROM documents
                     WHERE kind = 'bill' AND status = 'posted'
                       AND issue_date >= date_trunc('month', moarix_company_today())
                       AND issue_date < date_trunc('month', moarix_company_today()) + interval '1 month'), 0)::text AS month_purchases,
           (SELECT COUNT(*) FROM inventory_balances b JOIN items i ON i.company_id = b.company_id AND i.id = b.item_id WHERE b.on_hand - b.reserved <= i.reorder_point)::text AS low_stock_count,
           (SELECT COUNT(*) FROM service_cases WHERE status IN ('open', 'in_progress', 'waiting'))::text AS open_cases,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'renewal_90')::text AS renewal_90_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'renewal_60')::text AS renewal_60_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'renewal_30')::text AS renewal_30_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'expires_today')::text AS expires_today_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'expired')::text AS customer_expired_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'not_contracted')::text AS customer_uncontracted_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'vendor_gap')::text AS vendor_gap_assets,
           (SELECT COUNT(*) FROM asset_support_risks WHERE support_state = 'vendor_unverified')::text AS vendor_unverified_assets,
           (SELECT COUNT(*) FROM operational_license_health WHERE license_state IN ('renewal_90', 'renewal_60', 'renewal_30', 'expires_today'))::text AS expiring_licenses,
           (SELECT COUNT(*) FROM operational_license_health WHERE license_state = 'expired')::text AS expired_licenses,
           (SELECT COUNT(*) FROM maintenance_inspections WHERE status IN ('scheduled', 'in_progress', 'issue_found') AND scheduled_date <= moarix_company_today() + 30)::text AS due_inspections,
           (SELECT COUNT(*) FROM documents WHERE status = 'submitted')::text AS pending_approvals`,
      ),
      tx.query<RecentActivity>(
        `SELECT a.id, a.action, a.summary, a.created_at::text, u.name AS actor_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC
         LIMIT 8`,
      ),
      tx.query<{
        id: string;
        kind: string;
        number: string;
        status: string;
        counterparty_name: string;
        grand_total: string;
        issue_date: string;
      }>(
        `SELECT d.id, d.kind, d.number, d.status, c.name AS counterparty_name,
                d.grand_total::text, d.issue_date::text
         FROM documents d
         JOIN counterparties c ON c.company_id = d.company_id AND c.id = d.counterparty_id
         ORDER BY d.created_at DESC
         LIMIT 8`,
      ),
    ]);

    const row = metrics.rows[0];
    return {
      metrics: {
        monthSales: row?.month_sales ?? "0",
        monthPurchases: row?.month_purchases ?? "0",
        lowStockCount: Number(row?.low_stock_count ?? 0),
        openCases: Number(row?.open_cases ?? 0),
        renewal90Assets: Number(row?.renewal_90_assets ?? 0),
        renewal60Assets: Number(row?.renewal_60_assets ?? 0),
        renewal30Assets: Number(row?.renewal_30_assets ?? 0),
        expiresTodayAssets: Number(row?.expires_today_assets ?? 0),
        customerExpiredAssets: Number(row?.customer_expired_assets ?? 0),
        customerUncontractedAssets: Number(row?.customer_uncontracted_assets ?? 0),
        vendorGapAssets: Number(row?.vendor_gap_assets ?? 0),
        vendorUnverifiedAssets: Number(row?.vendor_unverified_assets ?? 0),
        expiringLicenses: Number(row?.expiring_licenses ?? 0),
        expiredLicenses: Number(row?.expired_licenses ?? 0),
        dueInspections: Number(row?.due_inspections ?? 0),
        pendingApprovals: Number(row?.pending_approvals ?? 0),
      } satisfies DashboardMetrics,
      activities: activities.rows,
      documents: documents.rows,
    };
  });
}
