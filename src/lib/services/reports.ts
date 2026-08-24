import { withCompany } from "@/lib/db/client";

export type DocumentSummaryRow = { kind: string; status: string; document_count: string; total_amount: string };
export type CounterpartySummaryRow = { counterparty_name: string; invoice_total: string; bill_total: string; document_count: string };
export type StockValueRow = { warehouse_name: string; sku: string; item_name: string; available: string; estimated_value: string; reorder_point: string };

export function getStandardReports(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [documentSummary, counterpartySummary, stockValue] = await Promise.all([
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
    ]);
    return { documentSummary: documentSummary.rows, counterpartySummary: counterpartySummary.rows, stockValue: stockValue.rows };
  });
}
