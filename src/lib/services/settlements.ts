import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { SessionContext } from "@/lib/auth/repository";
import { withCompany } from "@/lib/db/client";
import { agingBucket, allocatePayment, remainingOpen } from "@/lib/domain/settlement";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { writeAudit } from "./audit";

export type OpenDocumentRow = {
  id: string;
  kind: "invoice" | "bill";
  number: string;
  counterparty_name: string;
  due_date: string | null;
  grand_total: string;
  allocated: string;
  open_amount: string;
  aging: ReturnType<typeof agingBucket>;
};

export type SettlementRow = {
  id: string;
  direction: "receipt" | "payment";
  reference: string | null;
  amount: string;
  settled_on: string;
  method: string;
  counterparty_name: string;
  created_by_name: string;
};

export async function listOpenDocuments(
  companyId: string,
  kind: "invoice" | "bill",
  timezone = "Asia/Seoul",
) {
  const today = dateInTimeZone(timezone);
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<Omit<OpenDocumentRow, "aging" | "open_amount">>(
      `SELECT d.id, d.kind, d.number, c.name AS counterparty_name, d.due_date::text,
              d.grand_total::text,
              COALESCE(SUM(a.amount), 0)::text AS allocated
       FROM documents d
       JOIN counterparties c ON c.company_id = d.company_id AND c.id = d.counterparty_id
       LEFT JOIN settlement_allocations a ON a.company_id = d.company_id AND a.document_id = d.id
       WHERE d.kind = $1 AND d.status = 'posted'
       GROUP BY d.id, d.kind, d.number, c.name, d.due_date, d.grand_total
       ORDER BY d.due_date NULLS LAST, d.number`,
      [kind],
    );
    return result.rows
      .map((row) => {
        const openAmount = remainingOpen(row.grand_total, row.allocated);
        return {
          ...row,
          open_amount: openAmount,
          aging: agingBucket(row.due_date, today),
        };
      })
      .filter((row) => new Decimal(row.open_amount).gt(0));
  });
}

export function listSettlements(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<SettlementRow>(
      `SELECT s.id, s.direction, s.reference, s.amount::text, s.settled_on::text, s.method,
              c.name AS counterparty_name, u.name AS created_by_name
       FROM settlements s
       JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
       JOIN users u ON u.id = s.created_by
       ORDER BY s.settled_on DESC, s.created_at DESC
       LIMIT 100`,
    );
    return result.rows;
  });
}

export type CreateSettlementInput = {
  counterpartyId: string;
  direction: "receipt" | "payment";
  amount: string;
  settledOn: string;
  method: "bank" | "card" | "cash" | "offset" | "other";
  reference?: string;
  notes?: string;
  documentIds: string[];
};

export function createSettlement(session: SessionContext, input: CreateSettlementInput) {
  const id = randomUUID();
  const expectedKind = input.direction === "receipt" ? "invoice" : "bill";
  return withCompany(session.companyId, async (tx) => {
    const documents = await tx.query<{ id: string; grand_total: string; allocated: string }>(
      `SELECT d.id, d.grand_total::text, COALESCE((
          SELECT SUM(a.amount) FROM settlement_allocations a
          WHERE a.company_id = d.company_id AND a.document_id = d.id
        ), 0)::text AS allocated
       FROM documents d
       WHERE d.counterparty_id = $1 AND d.kind = $2 AND d.status = 'posted'
         AND d.id = ANY($3::uuid[])
       ORDER BY d.due_date NULLS LAST, d.number
       FOR UPDATE`,
      [input.counterpartyId, expectedKind, input.documentIds],
    );
    if (documents.rows.length === 0) throw new Error("배부할 확정 문서가 없습니다.");
    const allocations = allocatePayment(
      input.amount,
      documents.rows.map((row) => ({
        id: row.id,
        openAmount: remainingOpen(row.grand_total, row.allocated),
      })),
    );
    await tx.query(
      `INSERT INTO settlements
         (id, company_id, counterparty_id, direction, reference, amount, settled_on, method, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, session.companyId, input.counterpartyId, input.direction, input.reference || null, input.amount, input.settledOn, input.method, input.notes || null, session.userId],
    );
    for (const allocation of allocations) {
      await tx.query(
        `INSERT INTO settlement_allocations (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), session.companyId, id, allocation.id, allocation.applied],
      );
    }
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "settlement.created",
      entityType: "settlement",
      entityId: id,
      summary: `${input.direction === "receipt" ? "입금" : "지급"} ${input.amount} 배부`,
      afterData: { amount: input.amount, allocations },
    });
    return id;
  });
}
