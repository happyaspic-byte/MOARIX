import { randomUUID } from "node:crypto";
import { withCompany } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import { calculateLine } from "@/lib/domain/money";
import { assertDocumentTransition, type DocumentStatus } from "@/lib/domain/document-state";
import { assertPermission } from "@/lib/security/permissions";
import { writeAudit } from "./audit";

export const documentKinds = ["quote", "sales_order", "purchase_order", "invoice", "bill"] as const;
export type DocumentKind = (typeof documentKinds)[number];

export const documentKindLabels: Record<DocumentKind, string> = {
  quote: "견적",
  sales_order: "수주",
  purchase_order: "발주",
  invoice: "매출 청구",
  bill: "매입 청구",
};

const documentPrefixes: Record<DocumentKind, string> = {
  quote: "Q",
  sales_order: "SO",
  purchase_order: "PO",
  invoice: "INV",
  bill: "BILL",
};

export type DocumentRow = {
  id: string;
  kind: DocumentKind;
  number: string;
  counterparty_name: string;
  status: DocumentStatus;
  issue_date: string;
  due_date: string | null;
  currency: string;
  grand_total: string;
  created_by_name: string;
};

export function listDocuments(companyId: string, kind: DocumentKind) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<DocumentRow>(
      `SELECT d.id, d.kind, d.number, c.name AS counterparty_name, d.status,
              d.issue_date::text, d.due_date::text, d.currency, d.grand_total::text,
              u.name AS created_by_name
       FROM documents d
       JOIN counterparties c ON c.company_id = d.company_id AND c.id = d.counterparty_id
       JOIN users u ON u.id = d.created_by
       WHERE d.kind = $1
       ORDER BY d.issue_date DESC, d.created_at DESC`,
      [kind],
    );
    return result.rows;
  });
}

async function nextDocumentNumber(
  tx: Parameters<Parameters<typeof withCompany>[1]>[0],
  companyId: string,
  kind: DocumentKind,
) {
  await tx.query(
    `INSERT INTO document_counters (company_id, kind, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, kind) DO NOTHING`,
    [companyId, kind],
  );
  const result = await tx.query<{ value: string }>(
    `UPDATE document_counters
     SET next_value = next_value + 1
     WHERE company_id = $1 AND kind = $2
     RETURNING (next_value - 1)::text AS value`,
    [companyId, kind],
  );
  const value = Number(result.rows[0]?.value ?? 1);
  return `${documentPrefixes[kind]}-${new Date().getFullYear()}-${String(value).padStart(5, "0")}`;
}

export type CreateDocumentInput = {
  kind: DocumentKind;
  counterpartyId: string;
  itemId: string;
  issueDate: string;
  dueDate?: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
  notes?: string;
};

export function createDocument(session: SessionContext, input: CreateDocumentInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const itemResult = await tx.query<{
      id: string;
      sku: string;
      name: string;
      unit: string;
    }>("SELECT id, sku, name, unit FROM items WHERE id = $1 AND is_active = true", [input.itemId]);
    const item = itemResult.rows[0];
    if (!item) throw new Error("Item not found");

    const counterparty = await tx.query<{ id: string }>(
      "SELECT id FROM counterparties WHERE id = $1 AND is_active = true",
      [input.counterpartyId],
    );
    if (!counterparty.rows[0]) throw new Error("Counterparty not found");

    const number = await nextDocumentNumber(tx, session.companyId, input.kind);
    const amounts = calculateLine({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discountRate: input.discountRate,
      taxRate: input.taxRate,
      currency: "KRW",
    });

    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date,
          currency, subtotal, discount_total, tax_total, grand_total, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 'KRW', $8, $9, $10, $11, $12, $13)`,
      [id, session.companyId, input.kind, number, input.counterpartyId, input.issueDate, input.dueDate || null, amounts.net, amounts.discount, amounts.tax, amounts.gross, input.notes || null, session.userId],
    );
    await tx.query(
      `INSERT INTO document_lines
         (id, company_id, document_id, item_id, position, sku_snapshot, name_snapshot,
          unit_snapshot, quantity, unit_price, discount_rate, tax_rate, net_amount, tax_amount, gross_amount)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [randomUUID(), session.companyId, id, item.id, item.sku, item.name, item.unit, input.quantity, input.unitPrice, input.discountRate, input.taxRate, amounts.net, amounts.tax, amounts.gross],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "document.created",
      entityType: "document",
      entityId: id,
      summary: `${documentKindLabels[input.kind]} ${number} 작성`,
      afterData: { number, kind: input.kind, status: "draft", grandTotal: amounts.gross },
    });
    return { id, number };
  });
}

export function transitionDocument(
  session: SessionContext,
  documentId: string,
  nextStatus: DocumentStatus,
) {
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<{ status: DocumentStatus; number: string }>(
      "SELECT status, number FROM documents WHERE id = $1 FOR UPDATE",
      [documentId],
    );
    const document = result.rows[0];
    if (!document) throw new Error("Document not found");
    const needsApproval = nextStatus === "approved" || nextStatus === "posted" || (document.status === "approved" && nextStatus === "cancelled");
    assertPermission(session.role, needsApproval ? "documents:approve" : "documents:write");
    assertDocumentTransition(document.status, nextStatus);

    await tx.query(
      `UPDATE documents
       SET status = $2,
           approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
           posted_at = CASE WHEN $2 = 'posted' THEN now() ELSE posted_at END,
           version = version + 1
       WHERE id = $1`,
      [documentId, nextStatus, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "document.status_changed",
      entityType: "document",
      entityId: documentId,
      summary: `${document.number} 상태 ${document.status} → ${nextStatus}`,
      beforeData: { status: document.status },
      afterData: { status: nextStatus },
    });
  });
}
