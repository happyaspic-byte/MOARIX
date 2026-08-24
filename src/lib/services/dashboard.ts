import { withCompany } from "@/lib/db/client";

export type DashboardMetrics = {
  monthSales: string;
  monthPurchases: string;
  lowStockCount: number;
  openCases: number;
  expiringAssets: number;
  expiredAssets: number;
  uncontractedAssets: number;
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
        expiring_assets: string;
        expired_assets: string;
        uncontracted_assets: string;
        due_inspections: string;
        pending_approvals: string;
      }>(
        `SELECT
           COALESCE((SELECT SUM(grand_total) FROM documents WHERE kind = 'invoice' AND status = 'posted' AND issue_date >= date_trunc('month', CURRENT_DATE)), 0)::text AS month_sales,
           COALESCE((SELECT SUM(grand_total) FROM documents WHERE kind = 'bill' AND status = 'posted' AND issue_date >= date_trunc('month', CURRENT_DATE)), 0)::text AS month_purchases,
           (SELECT COUNT(*) FROM inventory_balances b JOIN items i ON i.company_id = b.company_id AND i.id = b.item_id WHERE b.on_hand - b.reserved <= i.reorder_point)::text AS low_stock_count,
           (SELECT COUNT(*) FROM service_cases WHERE status IN ('open', 'in_progress', 'waiting'))::text AS open_cases,
           (SELECT COUNT(*) FROM assets WHERE status <> 'retired' AND contract_status NOT IN ('not_contracted', 'expired') AND (contract_status = 'pending_renewal' OR support_until BETWEEN moarix_company_today() AND moarix_company_today() + 90))::text AS expiring_assets,
           (SELECT COUNT(*) FROM assets WHERE status <> 'retired' AND (contract_status = 'expired' OR support_until < moarix_company_today()))::text AS expired_assets,
           (SELECT COUNT(*) FROM assets WHERE status <> 'retired' AND contract_status = 'not_contracted')::text AS uncontracted_assets,
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
        expiringAssets: Number(row?.expiring_assets ?? 0),
        expiredAssets: Number(row?.expired_assets ?? 0),
        uncontractedAssets: Number(row?.uncontracted_assets ?? 0),
        dueInspections: Number(row?.due_inspections ?? 0),
        pendingApprovals: Number(row?.pending_approvals ?? 0),
      } satisfies DashboardMetrics,
      activities: activities.rows,
      documents: documents.rows,
    };
  });
}
