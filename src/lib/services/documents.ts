import { randomUUID } from "node:crypto";
import { withCompany } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import { calculateLine, sumLineAmounts } from "@/lib/domain/money";
import { nextDocumentKind } from "@/lib/domain/document-conversion";
import { assertDocumentTransition, type DocumentStatus } from "@/lib/domain/document-state";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { assertPermission } from "@/lib/security/permissions";
import { writeAudit } from "./audit";

export const documentKinds = ["quote", "sales_order", "shipment", "purchase_order", "receipt", "invoice", "bill"] as const;
export type DocumentKind = (typeof documentKinds)[number];

export const documentKindLabels: Record<DocumentKind, string> = {
  quote: "견적",
  sales_order: "수주",
  shipment: "출고",
  purchase_order: "발주",
  receipt: "입고",
  invoice: "매출 청구",
  bill: "매입 청구",
};

const documentPrefixes: Record<DocumentKind, string> = {
  quote: "Q",
  sales_order: "SO",
  shipment: "SHIP",
  purchase_order: "PO",
  receipt: "REC",
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

export type DocumentDetailRow = DocumentRow & {
  counterparty_id: string;
  notes: string | null;
  version: number;
  approved_by_name: string | null;
  approved_at: string | null;
  posted_at: string | null;
};

export type DocumentLineRow = {
  id: string;
  item_id: string | null;
  position: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  unit_snapshot: string;
  quantity: string;
  unit_price: string;
  discount_rate: string;
  tax_rate: string;
  net_amount: string;
  tax_amount: string;
  gross_amount: string;
};

export function listDocuments(
  companyId: string,
  kind: DocumentKind,
  filters: { query?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
) {
  return withCompany(companyId, async (tx) => {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const result = await tx.query<DocumentRow & { total_count: string }>(
      `SELECT d.id, d.kind, d.number, c.name AS counterparty_name, d.status,
              d.issue_date::text, d.due_date::text, d.currency, d.grand_total::text,
              u.name AS created_by_name, COUNT(*) OVER()::text AS total_count
       FROM documents d
       JOIN counterparties c ON c.company_id = d.company_id AND c.id = d.counterparty_id
       JOIN users u ON u.id = d.created_by
       WHERE d.kind = $1
         AND ($2::text = '' OR d.number ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%')
         AND ($3::text = '' OR d.status = $3)
         AND ($4::text = '' OR d.issue_date >= $4::date)
         AND ($5::text = '' OR d.issue_date <= $5::date)
       ORDER BY d.issue_date DESC, d.created_at DESC
       LIMIT $6 OFFSET $7`,
      [kind, filters.query ?? "", filters.status ?? "", filters.from ?? "", filters.to ?? "", limit, offset],
    );
    return {
      rows: result.rows,
      total: Number(result.rows[0]?.total_count ?? 0),
      limit,
      offset,
    };
  });
}

export function getDocumentDetail(companyId: string, documentId: string, kind?: DocumentKind) {
  return withCompany(companyId, async (tx) => {
    const documentResult = await tx.query<DocumentDetailRow>(
      `SELECT d.id, d.kind, d.number, d.counterparty_id, c.name AS counterparty_name,
              d.status, d.issue_date::text, d.due_date::text, d.currency,
              d.grand_total::text, d.notes, d.version, creator.name AS created_by_name,
              approver.name AS approved_by_name, d.approved_at::text, d.posted_at::text
       FROM documents d
       JOIN counterparties c ON c.company_id = d.company_id AND c.id = d.counterparty_id
       JOIN users creator ON creator.id = d.created_by
       LEFT JOIN users approver ON approver.id = d.approved_by
       WHERE d.id = $1 AND ($2::text IS NULL OR d.kind = $2)`,
      [documentId, kind ?? null],
    );
    const document = documentResult.rows[0];
    if (!document) return null;
    const lines = await tx.query<DocumentLineRow>(
      `SELECT id, item_id, position, sku_snapshot, name_snapshot, unit_snapshot,
              quantity::text, unit_price::text, discount_rate::text, tax_rate::text,
              net_amount::text, tax_amount::text, gross_amount::text
       FROM document_lines WHERE document_id = $1 ORDER BY position`,
      [documentId],
    );
    return { document, lines: lines.rows };
  });
}

async function nextDocumentNumber(
  tx: Parameters<Parameters<typeof withCompany>[1]>[0],
  companyId: string,
  kind: DocumentKind,
  year: string,
) {
  const counterKind = `${kind}:${year}`;
  await tx.query(
    `INSERT INTO document_counters (company_id, kind, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, kind) DO NOTHING`,
    [companyId, counterKind],
  );
  const result = await tx.query<{ value: string }>(
    `UPDATE document_counters
     SET next_value = next_value + 1
     WHERE company_id = $1 AND kind = $2
     RETURNING (next_value - 1)::text AS value`,
    [companyId, counterKind],
  );
  const value = Number(result.rows[0]?.value ?? 1);
  return `${documentPrefixes[kind]}-${year}-${String(value).padStart(5, "0")}`;
}

export type DocumentLineInput = {
  itemId: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

export type CreateDocumentInput = {
  kind: DocumentKind;
  counterpartyId: string;
  itemId?: string;
  issueDate: string;
  dueDate?: string;
  quantity?: string;
  unitPrice?: string;
  discountRate?: string;
  taxRate?: string;
  notes?: string;
  lines?: DocumentLineInput[];
};

export type UpdateDraftDocumentInput = {
  documentId: string;
  kind: DocumentKind;
  expectedVersion: number;
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
    const lineInputs: DocumentLineInput[] =
      input.lines && input.lines.length > 0
        ? input.lines
        : [{
            itemId: input.itemId ?? "",
            quantity: input.quantity ?? "1",
            unitPrice: input.unitPrice ?? "0",
            discountRate: input.discountRate ?? "0",
            taxRate: input.taxRate ?? "10",
          }];
    if (lineInputs.some((line) => !line.itemId)) throw new Error("Item not found");

    const items = await tx.query<{ id: string; sku: string; name: string; unit: string }>(
      `SELECT id, sku, name, unit FROM items WHERE is_active = true AND id = ANY($1::uuid[])`,
      [lineInputs.map((line) => line.itemId)],
    );
    const itemById = new Map(items.rows.map((item) => [item.id, item]));
    const prepared = lineInputs.map((line, index) => {
      const item = itemById.get(line.itemId);
      if (!item) throw new Error("Item not found");
      const amounts = calculateLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountRate: line.discountRate,
        taxRate: line.taxRate,
        currency: "KRW",
      });
      return { item, line, amounts, position: index + 1 };
    });

    const counterparty = await tx.query<{ id: string }>(
      "SELECT id FROM counterparties WHERE id = $1 AND is_active = true",
      [input.counterpartyId],
    );
    if (!counterparty.rows[0]) throw new Error("Counterparty not found");

    const year = dateInTimeZone(session.companyTimezone).slice(0, 4);
    const number = await nextDocumentNumber(tx, session.companyId, input.kind, year);
    const totals = sumLineAmounts(prepared.map((row) => row.amounts));

    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date,
          currency, subtotal, discount_total, tax_total, grand_total, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 'KRW', $8, $9, $10, $11, $12, $13)`,
      [id, session.companyId, input.kind, number, input.counterpartyId, input.issueDate, input.dueDate || null, totals.net.toFixed(4), totals.discount.toFixed(4), totals.tax.toFixed(4), totals.gross.toFixed(4), input.notes || null, session.userId],
    );
    for (const row of prepared) {
      await tx.query(
        `INSERT INTO document_lines
           (id, company_id, document_id, item_id, position, sku_snapshot, name_snapshot,
            unit_snapshot, quantity, unit_price, discount_rate, tax_rate, net_amount, tax_amount, gross_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [randomUUID(), session.companyId, id, row.item.id, row.position, row.item.sku, row.item.name, row.item.unit, row.line.quantity, row.line.unitPrice, row.line.discountRate, row.line.taxRate, row.amounts.net, row.amounts.tax, row.amounts.gross],
      );
    }
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "document.created",
      entityType: "document",
      entityId: id,
      summary: `${documentKindLabels[input.kind]} ${number} 작성`,
      afterData: { number, kind: input.kind, status: "draft", grandTotal: totals.gross.toFixed(4), lineCount: prepared.length },
    });
    return { id, number };
  });
}

export function convertDocument(session: SessionContext, documentId: string) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const source = await tx.query<{
      id: string;
      kind: DocumentKind;
      number: string;
      status: DocumentStatus;
      counterparty_id: string;
      issue_date: string;
      due_date: string | null;
      notes: string | null;
      subtotal: string;
      discount_total: string;
      tax_total: string;
      grand_total: string;
    }>(
      `SELECT id, kind, number, status, counterparty_id, issue_date::text, due_date::text, notes,
              subtotal::text, discount_total::text, tax_total::text, grand_total::text
       FROM documents WHERE id = $1 FOR UPDATE`,
      [documentId],
    );
    const document = source.rows[0];
    if (!document) throw new Error("Document not found");
    if (document.status !== "posted") throw new Error("확정된 문서만 전환할 수 있습니다.");
    const targetKind = nextDocumentKind(document.kind);
    if (!targetKind) throw new Error("더 이상 전환할 문서 종류가 없습니다.");

    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM documents WHERE source_document_id = $1 AND kind = $2",
      [documentId, targetKind],
    );
    if (existing.rows[0]) throw new Error("이미 전환된 문서입니다.");

    const lines = await tx.query<{
      item_id: string | null;
      sku_snapshot: string | null;
      name_snapshot: string;
      unit_snapshot: string;
      quantity: string;
      unit_price: string;
      discount_rate: string;
      tax_rate: string;
      net_amount: string;
      tax_amount: string;
      gross_amount: string;
      position: number;
    }>(
      `SELECT item_id, sku_snapshot, name_snapshot, unit_snapshot, quantity::text, unit_price::text,
              discount_rate::text, tax_rate::text, net_amount::text, tax_amount::text, gross_amount::text, position
       FROM document_lines WHERE document_id = $1 ORDER BY position`,
      [documentId],
    );

    const year = dateInTimeZone(session.companyTimezone).slice(0, 4);
    const number = await nextDocumentNumber(tx, session.companyId, targetKind, year);
    const today = dateInTimeZone(session.companyTimezone);
    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date,
          currency, subtotal, discount_total, tax_total, grand_total, notes, created_by, source_document_id)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 'KRW', $8, $9, $10, $11, $12, $13, $14)`,
      [id, session.companyId, targetKind, number, document.counterparty_id, today, document.due_date, document.subtotal, document.discount_total, document.tax_total, document.grand_total, document.notes, session.userId, document.id],
    );
    for (const line of lines.rows) {
      await tx.query(
        `INSERT INTO document_lines
           (id, company_id, document_id, item_id, position, sku_snapshot, name_snapshot,
            unit_snapshot, quantity, unit_price, discount_rate, tax_rate, net_amount, tax_amount, gross_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [randomUUID(), session.companyId, id, line.item_id, line.position, line.sku_snapshot, line.name_snapshot, line.unit_snapshot, line.quantity, line.unit_price, line.discount_rate, line.tax_rate, line.net_amount, line.tax_amount, line.gross_amount],
      );
    }
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "document.converted",
      entityType: "document",
      entityId: id,
      summary: `${document.number} → ${documentKindLabels[targetKind]} ${number} 전환`,
      afterData: { sourceId: document.id, sourceKind: document.kind, targetKind, number },
    });
    return { id, number, kind: targetKind };
  });
}

export function updateDraftDocument(session: SessionContext, input: UpdateDraftDocumentInput) {
  return withCompany(session.companyId, async (tx) => {
    const currentResult = await tx.query<{
      status: DocumentStatus;
      number: string;
      version: number;
      grand_total: string;
    }>(
      `SELECT status, number, version, grand_total::text
       FROM documents WHERE id = $1 AND kind = $2 FOR UPDATE`,
      [input.documentId, input.kind],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Document not found");
    if (current.status !== "draft") throw new Error("Only draft documents can be edited");
    if (current.version !== input.expectedVersion) throw new Error("Document version conflict");

    const itemResult = await tx.query<{ id: string; sku: string; name: string; unit: string }>(
      "SELECT id, sku, name, unit FROM items WHERE id = $1 AND is_active = true",
      [input.itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error("Item not found");
    const counterparty = await tx.query<{ id: string }>(
      "SELECT id FROM counterparties WHERE id = $1 AND is_active = true",
      [input.counterpartyId],
    );
    if (!counterparty.rows[0]) throw new Error("Counterparty not found");
    const lineResult = await tx.query<{ id: string }>(
      "SELECT id FROM document_lines WHERE document_id = $1 ORDER BY position",
      [input.documentId],
    );
    if (lineResult.rows.length !== 1) throw new Error("Only single-line draft documents can be edited through this operation");

    const amounts = calculateLine({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discountRate: input.discountRate,
      taxRate: input.taxRate,
      currency: "KRW",
    });
    await tx.query(
      `UPDATE documents
       SET counterparty_id = $2, issue_date = $3, due_date = $4,
           subtotal = $5, discount_total = $6, tax_total = $7, grand_total = $8,
           notes = $9, version = version + 1
       WHERE id = $1`,
      [input.documentId, input.counterpartyId, input.issueDate, input.dueDate || null,
        amounts.net, amounts.discount, amounts.tax, amounts.gross, input.notes || null],
    );
    await tx.query(
      `UPDATE document_lines
       SET item_id = $2, sku_snapshot = $3, name_snapshot = $4, unit_snapshot = $5,
           quantity = $6, unit_price = $7, discount_rate = $8, tax_rate = $9,
           net_amount = $10, tax_amount = $11, gross_amount = $12
       WHERE id = $1`,
      [lineResult.rows[0]!.id, item.id, item.sku, item.name, item.unit, input.quantity,
        input.unitPrice, input.discountRate, input.taxRate, amounts.net, amounts.tax, amounts.gross],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "document.draft_updated",
      entityType: "document",
      entityId: input.documentId,
      summary: `${current.number} 초안 수정`,
      beforeData: { version: current.version, grandTotal: current.grand_total },
      afterData: { version: current.version + 1, grandTotal: amounts.gross },
    });
    return { id: input.documentId, number: current.number, version: current.version + 1 };
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
