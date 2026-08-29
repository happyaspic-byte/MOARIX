import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { withCompany } from "@/lib/db/client";
import { writeAudit } from "./audit";

export type OutboundMessageRow = {
  id: string;
  to_address: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  created_at: string;
  related_type: string | null;
};

export function listOutboundMessages(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<OutboundMessageRow>(
      `SELECT id, to_address, subject, status, created_at::text, related_type
       FROM outbound_messages ORDER BY created_at DESC LIMIT 100`,
    );
    return result.rows;
  });
}

export function enqueueOutboundMessage(
  session: SessionContext,
  input: { toAddress: string; subject: string; body: string; relatedType?: string; relatedId?: string },
) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    await tx.query(
      `INSERT INTO outbound_messages
         (id, company_id, to_address, subject, body, related_type, related_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, session.companyId, input.toAddress, input.subject, input.body, input.relatedType ?? null, input.relatedId ?? null, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "mail.queued",
      entityType: "outbound_message",
      entityId: id,
      summary: `메일 큐 등록: ${input.subject}`,
      afterData: { toAddress: input.toAddress, relatedType: input.relatedType },
    });
    return id;
  });
}
