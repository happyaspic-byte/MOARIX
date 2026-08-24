import { withCompany } from "@/lib/db/client";

export type DocumentSummaryRow = { kind: string; status: string; document_count: string; total_amount: string };
export type CounterpartySummaryRow = { counterparty_name: string; invoice_total: string; bill_total: string; document_count: string };
export type StockValueRow = { warehouse_name: string; sku: string; item_name: string; available: string; estimated_value: string; reorder_point: string };
export type SupportSummaryRow = { support_state: "covered" | "expiring" | "expired" | "not_contracted" | "unknown"; asset_count: string };
export type SupportQueueRow = { asset_tag: string; vendor_asset_id: string | null; product_name: string; customer_name: string; site_name: string | null; contract_status: string; support_until: string | null; next_inspection_date: string | null; support_state: SupportSummaryRow["support_state"] };
export type InspectionSummaryRow = { status: string; inspection_count: string };

export function getStandardReports(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [documentSummary, counterpartySummary, stockValue, supportSummary, supportQueue, inspectionSummary] = await Promise.all([
      tx.query<DocumentSummaryRow>(
        `SELECT kind, status, COUNT(*)::text AS document_count,
                COALESCE(SUM(grand_total), 0)::text AS total_amount
         FROM documents
         WHERE issue_date >= date_trunc('year', CURRENT_DATE)
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
           AND d.issue_date >= date_trunc('year', CURRENT_DATE)
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
        `SELECT support_state, COUNT(*)::text AS asset_count
         FROM (
           SELECT CASE
             WHEN contract_status = 'not_contracted' THEN 'not_contracted'
             WHEN contract_status = 'expired' OR support_until < moarix_company_today() THEN 'expired'
             WHEN contract_status = 'pending_renewal' OR support_until <= moarix_company_today() + 90 THEN 'expiring'
             WHEN support_until IS NULL THEN 'unknown'
             ELSE 'covered'
           END AS support_state
           FROM assets WHERE status <> 'retired'
         ) support_health
         GROUP BY support_state
         ORDER BY CASE support_state WHEN 'expired' THEN 1 WHEN 'not_contracted' THEN 2 WHEN 'expiring' THEN 3 WHEN 'unknown' THEN 4 ELSE 5 END`,
      ),
      tx.query<SupportQueueRow>(
        `SELECT a.asset_tag, a.vendor_asset_id, a.product_name, c.name AS customer_name,
                COALESCE(s.name, a.site) AS site_name, a.contract_status,
                a.support_until::text, a.next_inspection_date::text,
                CASE
                  WHEN a.contract_status = 'not_contracted' THEN 'not_contracted'
                  WHEN a.contract_status = 'expired' OR a.support_until < moarix_company_today() THEN 'expired'
                  WHEN a.contract_status = 'pending_renewal' OR a.support_until <= moarix_company_today() + 90 THEN 'expiring'
                  WHEN a.support_until IS NULL THEN 'unknown'
                  ELSE 'covered'
                END AS support_state
         FROM assets a
         JOIN counterparties c ON c.company_id = a.company_id AND c.id = a.counterparty_id
         LEFT JOIN customer_sites s ON s.company_id = a.company_id AND s.id = a.site_id
         WHERE a.status <> 'retired'
           AND (a.contract_status IN ('not_contracted', 'expired', 'pending_renewal')
                OR a.support_until IS NULL OR a.support_until <= moarix_company_today() + 90)
         ORDER BY CASE
                    WHEN a.contract_status = 'expired' OR a.support_until < moarix_company_today() THEN 1
                    WHEN a.contract_status = 'not_contracted' THEN 2
                    WHEN a.support_until IS NULL THEN 3 ELSE 4
                  END,
                  a.support_until NULLS FIRST, c.name, a.asset_tag
         LIMIT 50`,
      ),
      tx.query<InspectionSummaryRow>(
        `SELECT status, COUNT(*)::text AS inspection_count
         FROM maintenance_inspections
         WHERE scheduled_date >= date_trunc('year', CURRENT_DATE)
         GROUP BY status
         ORDER BY CASE status WHEN 'issue_found' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'scheduled' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END`,
      ),
    ]);
    return { documentSummary: documentSummary.rows, counterpartySummary: counterpartySummary.rows, stockValue: stockValue.rows, supportSummary: supportSummary.rows, supportQueue: supportQueue.rows, inspectionSummary: inspectionSummary.rows };
  });
}
