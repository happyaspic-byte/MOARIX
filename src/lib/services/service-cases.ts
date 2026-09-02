import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { assertServiceCaseTransition, type ServiceCaseStatus } from "@/lib/domain/service-case-state";
import { withCompany } from "@/lib/db/client";
import { writeAudit } from "./audit";

export type ServiceCaseSeverity = "low" | "normal" | "high" | "critical";
export type ServiceCaseType = "incident" | "request" | "question" | "maintenance";
export type ServiceCaseActivityKind = "comment" | "internal_note" | "vendor_reply" | "customer_reply" | "status_change" | "system";

export type ServiceCaseRow = {
  id: string;
  counterparty_id: string;
  asset_id: string | null;
  number: string;
  case_type: ServiceCaseType;
  title: string;
  severity: ServiceCaseSeverity;
  max_severity: ServiceCaseSeverity;
  status: ServiceCaseStatus;
  counterparty_name: string;
  asset_tag: string | null;
  assigned_to_name: string | null;
  opened_at: string;
  updated_at: string;
  due_at: string | null;
  next_action_at: string | null;
  external_provider: string | null;
  external_case_number: string | null;
  waiting_reason: string | null;
  resolution_summary: string | null;
  activity_count: number;
  attachment_count: number;
};

export type ServiceCaseDetailRow = ServiceCaseRow & {
  description: string | null;
  counterparty_id: string;
  counterparty_email: string | null;
  counterparty_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  entitlement: string | null;
  asset_id: string | null;
  vendor_asset_id: string | null;
  product_name: string | null;
  product_model: string | null;
  software_version: string | null;
  site_id: string | null;
  site_name: string | null;
  si_contact_name: string | null;
  si_contact_phone: string | null;
  si_contact_email: string | null;
  contract_number: string | null;
  support_provider: string | null;
  support_level: string | null;
  external_state: string | null;
  source_url: string | null;
  resolved_at: string | null;
  closed_at: string | null;
};

export type ServiceCaseActivityRow = {
  id: string;
  kind: ServiceCaseActivityKind;
  visibility: "shared" | "internal";
  body: string;
  author_name: string;
  occurred_at: string;
  created_at: string;
  recorded_by_name: string;
};

export type ServiceCaseAttachmentRow = {
  id: string;
  file_name: string;
  source_url: string;
  content_type: string | null;
  size_bytes: string | null;
  description: string | null;
  occurred_at: string;
  uploaded_by_name: string;
};

export type ServiceCaseWatcherRow = {
  id: string;
  email: string;
  display_name: string | null;
  source: "manual" | "customer" | "vendor" | "distribution_list";
  created_at: string;
  created_by_name: string;
};

export function listServiceCases(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<ServiceCaseRow>(
      `SELECT s.id, s.counterparty_id, s.asset_id, s.number, s.case_type, s.title, s.severity, s.max_severity, s.status,
              c.name AS counterparty_name, a.asset_tag, u.name AS assigned_to_name,
              s.opened_at::text, s.updated_at::text, s.due_at::text, s.next_action_at::text,
              s.external_provider, s.external_case_number, s.waiting_reason, s.resolution_summary,
              (SELECT count(*)::integer FROM service_case_activities ca
               WHERE ca.company_id = s.company_id AND ca.case_id = s.id) AS activity_count,
              (SELECT count(*)::integer FROM service_case_attachments sa
               WHERE sa.company_id = s.company_id AND sa.case_id = s.id) AS attachment_count
       FROM service_cases s
       JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
       LEFT JOIN assets a ON a.company_id = s.company_id AND a.id = s.asset_id
       LEFT JOIN users u ON u.id = s.assigned_to
       ORDER BY
         CASE WHEN s.status IN ('open', 'in_progress', 'waiting') THEN 0 ELSE 1 END,
         CASE WHEN s.status IN ('open', 'in_progress', 'waiting') AND s.due_at < now() THEN 0 ELSE 1 END,
         CASE s.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         s.due_at NULLS LAST,
         s.next_action_at NULLS LAST,
         s.updated_at DESC`,
    );
    return result.rows;
  });
}

export function getServiceCaseDetail(companyId: string, caseId: string) {
  return withCompany(companyId, async (tx) => {
    const detailResult = await tx.query<ServiceCaseDetailRow>(
      `SELECT s.id, s.number, s.case_type, s.title, s.description, s.severity, s.max_severity, s.status,
              s.counterparty_id, c.name AS counterparty_name, c.email AS counterparty_email,
              c.phone AS counterparty_phone, s.contact_name, s.contact_email, s.contact_phone,
              s.entitlement, s.asset_id, a.asset_tag, a.vendor_asset_id, a.product_name,
              a.product_model, a.software_version, a.site_id, cs.name AS site_name,
              cs.si_contact_name, cs.si_contact_phone, cs.si_contact_email, a.contract_number,
              a.support_provider, a.support_level, u.name AS assigned_to_name,
              s.opened_at::text, s.updated_at::text, s.due_at::text, s.next_action_at::text,
              s.resolved_at::text, s.closed_at::text, s.external_provider,
              s.external_case_number, s.external_state, s.source_url,
              s.waiting_reason, s.resolution_summary,
              (SELECT count(*)::integer FROM service_case_activities ca
               WHERE ca.company_id = s.company_id AND ca.case_id = s.id) AS activity_count,
              (SELECT count(*)::integer FROM service_case_attachments sa
               WHERE sa.company_id = s.company_id AND sa.case_id = s.id) AS attachment_count
       FROM service_cases s
       JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
       LEFT JOIN assets a ON a.company_id = s.company_id AND a.id = s.asset_id
       LEFT JOIN customer_sites cs ON cs.company_id = s.company_id AND cs.id = a.site_id
       LEFT JOIN users u ON u.id = s.assigned_to
       WHERE s.id = $1`,
      [caseId],
    );
    const detail = detailResult.rows[0];
    if (!detail) return null;

    const [activities, attachments, watchers] = await Promise.all([
      tx.query<ServiceCaseActivityRow>(
        `SELECT ca.id, ca.kind, ca.visibility, ca.body, ca.author_name,
                ca.occurred_at::text, ca.created_at::text, u.name AS recorded_by_name
         FROM service_case_activities ca
         JOIN users u ON u.id = ca.created_by
         WHERE ca.case_id = $1
         ORDER BY ca.occurred_at DESC, ca.created_at DESC, ca.id DESC`,
        [caseId],
      ),
      tx.query<ServiceCaseAttachmentRow>(
        `SELECT sa.id, sa.file_name, sa.source_url, sa.content_type,
                sa.size_bytes::text, sa.description, sa.occurred_at::text,
                u.name AS uploaded_by_name
         FROM service_case_attachments sa
         JOIN users u ON u.id = sa.uploaded_by
         WHERE sa.case_id = $1
         ORDER BY sa.occurred_at DESC, sa.created_at DESC, sa.id DESC`,
        [caseId],
      ),
      tx.query<ServiceCaseWatcherRow>(
        `SELECT sw.id, sw.email, sw.display_name, sw.source, sw.created_at::text,
                u.name AS created_by_name
         FROM service_case_watchers sw
         JOIN users u ON u.id = sw.created_by
         WHERE sw.case_id = $1
         ORDER BY lower(COALESCE(sw.display_name, sw.email)), sw.created_at, sw.id`,
        [caseId],
      ),
    ]);
    return { detail, activities: activities.rows, attachments: attachments.rows, watchers: watchers.rows };
  });
}

export type ServiceCaseWatcherInput = {
  caseId: string;
  email: string;
  displayName?: string;
  source: ServiceCaseWatcherRow["source"];
};

export function addServiceCaseWatcher(session: SessionContext, input: ServiceCaseWatcherInput) {
  return withCompany(session.companyId, async (tx) => {
    const caseResult = await tx.query<{ number: string }>(
      "SELECT number FROM service_cases WHERE id = $1",
      [input.caseId],
    );
    const serviceCase = caseResult.rows[0];
    if (!serviceCase) throw new Error("Service case not found");

    const watcherId = randomUUID();
    await tx.query(
      `INSERT INTO service_case_watchers
         (id, company_id, case_id, email, display_name, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [watcherId, session.companyId, input.caseId, input.email, input.displayName || null, input.source, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.watcher_added",
      entityType: "service_case",
      entityId: input.caseId,
      summary: `${serviceCase.number} Task Watch List 추가`,
      afterData: { watcherId, email: input.email, displayName: input.displayName, source: input.source },
    });
    return watcherId;
  });
}

export type ServiceCaseInput = {
  counterpartyId: string;
  assetId?: string;
  caseType: ServiceCaseType;
  title: string;
  description?: string;
  severity: ServiceCaseSeverity;
  dueAt?: string;
  nextActionAt?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  entitlement?: string;
  externalProvider?: string;
  externalCaseNumber?: string;
  externalState?: string;
  sourceUrl?: string;
};

function assertHttpsUrl(value: string | undefined) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS URL required");
  } catch {
    throw new Error("HTTPS URL required");
  }
}

export function createServiceCase(session: SessionContext, input: ServiceCaseInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    assertHttpsUrl(input.sourceUrl);
    const customer = await tx.query<{ id: string }>(
      `SELECT id FROM counterparties
       WHERE id = $1 AND kind IN ('customer', 'both') AND is_active = true`,
      [input.counterpartyId],
    );
    if (!customer.rows[0]) throw new Error("Service case customer mismatch");
    if (input.assetId) {
      const asset = await tx.query<{ id: string }>(
        `SELECT asset.id FROM assets asset
         WHERE asset.id = $1 AND asset.counterparty_id = $2 AND asset.status <> 'retired'
         FOR UPDATE OF asset`,
        [input.assetId, input.counterpartyId],
      );
      if (!asset.rows[0]) throw new Error("Service case asset mismatch");
    }

    const year = dateInTimeZone(session.companyTimezone).slice(0, 4);
    const counterKind = `service_case:${year}`;
    await tx.query(
      `INSERT INTO document_counters (company_id, kind, next_value)
       VALUES ($1, $2, 1) ON CONFLICT (company_id, kind) DO NOTHING`,
      [session.companyId, counterKind],
    );
    const numberResult = await tx.query<{ value: string }>(
      `UPDATE document_counters SET next_value = next_value + 1
       WHERE company_id = $1 AND kind = $2
       RETURNING (next_value - 1)::text AS value`,
      [session.companyId, counterKind],
    );
    const value = Number(numberResult.rows[0]?.value ?? 1);
    const number = `CS-${year}-${String(value).padStart(5, "0")}`;
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, case_type, title, description,
          severity, max_severity, due_at, next_action_at, assigned_to, created_by,
          contact_name, contact_email, contact_phone, entitlement, external_provider,
          external_case_number, external_state, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
               timezone($21::text, NULLIF($10::text, '')::timestamp),
               timezone($21::text, NULLIF($11::text, '')::timestamp),
               $12, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [id, session.companyId, number, input.counterpartyId, input.assetId || null, input.caseType, input.title, input.description || null, input.severity, input.dueAt || null, input.nextActionAt || null, session.userId, input.contactName || null, input.contactEmail || null, input.contactPhone || null, input.entitlement || null, input.externalProvider || null, input.externalCaseNumber || null, input.externalState || null, input.sourceUrl || null, session.companyTimezone],
    );
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, visibility, body, author_name, created_by)
       VALUES ($1, $2, $3, 'system', 'shared', $4, $5, $6)`,
      [randomUUID(), session.companyId, id, "케이스가 접수되었습니다.", session.userName, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.created",
      entityType: "service_case",
      entityId: id,
      summary: `${number} ${input.title} 등록`,
      afterData: { number, caseType: input.caseType, title: input.title, severity: input.severity, externalProvider: input.externalProvider },
    });
    return { id, number };
  });
}

export type ServiceCaseActivityInput = {
  caseId: string;
  kind: Exclude<ServiceCaseActivityKind, "status_change" | "system">;
  authorName?: string;
  body: string;
  occurredAt?: string;
};

export function appendServiceCaseActivity(session: SessionContext, input: ServiceCaseActivityInput) {
  return withCompany(session.companyId, async (tx) => {
    const caseResult = await tx.query<{ number: string }>("SELECT number FROM service_cases WHERE id = $1", [input.caseId]);
    const serviceCase = caseResult.rows[0];
    if (!serviceCase) throw new Error("Service case not found");
    const external = input.kind === "vendor_reply" || input.kind === "customer_reply";
    if (external && !input.authorName?.trim()) throw new Error("External activity author is required");
    const visibility = input.kind === "internal_note" ? "internal" : "shared";
    const authorName = external ? input.authorName!.trim() : session.userName;
    const activityId = randomUUID();
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, visibility, body, author_name, occurred_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               COALESCE(timezone($9::text, NULLIF($8::text, '')::timestamp), now()), $10)`,
      [activityId, session.companyId, input.caseId, input.kind, visibility, input.body, authorName, input.occurredAt || null, session.companyTimezone, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.activity_added",
      entityType: "service_case",
      entityId: input.caseId,
      summary: `${serviceCase.number} 활동 기록 추가`,
      afterData: { activityId, kind: input.kind, visibility, characterCount: input.body.length },
    });
    return activityId;
  });
}

export type ServiceCaseAttachmentInput = {
  caseId: string;
  fileName: string;
  sourceUrl: string;
  contentType?: string;
  sizeMb?: number;
  description?: string;
  occurredAt?: string;
};

export function registerServiceCaseAttachment(session: SessionContext, input: ServiceCaseAttachmentInput) {
  return withCompany(session.companyId, async (tx) => {
    assertHttpsUrl(input.sourceUrl);
    const caseResult = await tx.query<{ number: string }>("SELECT number FROM service_cases WHERE id = $1", [input.caseId]);
    const serviceCase = caseResult.rows[0];
    if (!serviceCase) throw new Error("Service case not found");
    const attachmentId = randomUUID();
    const sizeBytes = input.sizeMb === undefined ? null : Math.round(input.sizeMb * 1024 * 1024);
    await tx.query(
      `INSERT INTO service_case_attachments
         (id, company_id, case_id, file_name, source_url, content_type, size_bytes,
          description, uploaded_by, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               COALESCE(timezone($11::text, NULLIF($10::text, '')::timestamp), now()))`,
      [attachmentId, session.companyId, input.caseId, input.fileName, input.sourceUrl, input.contentType || null, sizeBytes, input.description || null, session.userId, input.occurredAt || null, session.companyTimezone],
    );
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, visibility, body, author_name, occurred_at, created_by)
       VALUES ($1, $2, $3, 'system', 'internal', $4, $5,
               COALESCE(timezone($7::text, NULLIF($6::text, '')::timestamp), now()), $8)`,
      [randomUUID(), session.companyId, input.caseId, `첨부 자료 링크가 등록되었습니다: ${input.fileName}`, session.userName, input.occurredAt || null, session.companyTimezone, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.attachment_registered",
      entityType: "service_case",
      entityId: input.caseId,
      summary: `${serviceCase.number} 첨부 자료 링크 등록`,
      afterData: { attachmentId, fileName: input.fileName, sizeBytes, contentType: input.contentType },
    });
    return attachmentId;
  });
}

export type ServiceCaseTransitionInput = {
  caseId: string;
  nextStatus: ServiceCaseStatus;
  waitingReason?: string;
  resolutionSummary?: string;
  nextActionAt?: string;
};

const statusLabels: Record<ServiceCaseStatus, string> = {
  open: "접수",
  in_progress: "처리 중",
  waiting: "대기",
  resolved: "해결",
  closed: "종료",
};

export function transitionServiceCase(session: SessionContext, input: ServiceCaseTransitionInput) {
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<{ status: ServiceCaseStatus; number: string; asset_id: string | null }>(
      "SELECT status, number, asset_id FROM service_cases WHERE id = $1 FOR UPDATE",
      [input.caseId],
    );
    const current = result.rows[0];
    if (!current) throw new Error("Service case not found");
    assertServiceCaseTransition(current.status, input.nextStatus);
    if (input.nextStatus === "waiting" && !input.waitingReason?.trim()) throw new Error("Waiting reason is required");
    if (input.nextStatus === "resolved" && !input.resolutionSummary?.trim()) throw new Error("Resolution summary is required");
    if (current.asset_id && ["open", "in_progress", "waiting"].includes(input.nextStatus)) {
      const asset = await tx.query<{ status: string }>(
        "SELECT status FROM assets WHERE id = $1 AND company_id = $2 FOR UPDATE",
        [current.asset_id, session.companyId],
      );
      if (!asset.rows[0]) throw new Error("Linked asset not found");
      if (asset.rows[0].status === "retired") {
        throw new Error("퇴역 자산에 연결된 케이스는 다시 활성화할 수 없습니다");
      }
    }

    await tx.query(
      `UPDATE service_cases
       SET status = $2,
           waiting_reason = CASE WHEN $2 = 'waiting' THEN $3 WHEN $2 IN ('in_progress', 'resolved', 'closed') THEN NULL ELSE waiting_reason END,
           resolution_summary = CASE WHEN $2 = 'resolved' THEN $4 WHEN $2 = 'in_progress' THEN NULL ELSE resolution_summary END,
           next_action_at = CASE
             WHEN $2 IN ('resolved', 'closed') THEN NULL
             WHEN $2 IN ('waiting', 'in_progress') THEN timezone($6::text, NULLIF($5::text, '')::timestamp)
             ELSE next_action_at
           END,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() WHEN $2 = 'in_progress' THEN NULL ELSE resolved_at END,
           closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END
       WHERE id = $1`,
      [input.caseId, input.nextStatus, input.waitingReason || null, input.resolutionSummary || null, input.nextActionAt || null, session.companyTimezone],
    );
    const context = input.waitingReason || input.resolutionSummary;
    const body = `상태가 ${statusLabels[current.status]}에서 ${statusLabels[input.nextStatus]}(으)로 변경되었습니다.${context ? `\n${context}` : ""}`;
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, visibility, body, author_name, created_by)
       VALUES ($1, $2, $3, 'status_change', 'shared', $4, $5, $6)`,
      [randomUUID(), session.companyId, input.caseId, body, session.userName, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.status_changed",
      entityType: "service_case",
      entityId: input.caseId,
      summary: `${current.number} 상태 ${current.status} → ${input.nextStatus}`,
      beforeData: { status: current.status },
      afterData: { status: input.nextStatus, waitingReason: input.waitingReason, resolutionSummary: input.resolutionSummary, nextActionAt: input.nextActionAt },
    });
  });
}
