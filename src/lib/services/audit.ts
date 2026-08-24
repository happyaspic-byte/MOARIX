import { randomUUID } from "node:crypto";
import type { TransactionClient } from "@/lib/db/client";

export type AuditInput = {
  companyId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(tx: TransactionClient, input: AuditInput) {
  await tx.query(
    `INSERT INTO audit_logs
       (id, company_id, actor_user_id, action, entity_type, entity_id, summary, before_data, after_data, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)`,
    [
      randomUUID(),
      input.companyId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary,
      input.beforeData === undefined ? null : JSON.stringify(input.beforeData),
      input.afterData === undefined ? null : JSON.stringify(input.afterData),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
