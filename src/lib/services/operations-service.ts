import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { assertInspectionTransition, type InspectionStatus } from "@/lib/domain/inspection-state";
import { withCompany, type TransactionClient } from "@/lib/db/client";
import { writeAudit } from "./audit";

export type CustomerSiteRow = {
  id: string;
  counterparty_id: string;
  counterparty_name: string;
  code: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  timezone: string;
  asset_count: string;
  open_case_count: string;
};

export type CustomerSiteInput = {
  counterpartyId: string;
  code: string;
  name: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  timezone: string;
};

export function listCustomerSites(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<CustomerSiteRow>(
      `SELECT s.id, s.counterparty_id, c.name AS counterparty_name, s.code, s.name,
              s.address, s.contact_name, s.contact_phone, s.contact_email, s.timezone,
              COUNT(DISTINCT a.id)::text AS asset_count,
              COUNT(DISTINCT sc.id) FILTER (WHERE sc.status IN ('open', 'in_progress', 'waiting'))::text AS open_case_count
       FROM customer_sites s
       JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
       LEFT JOIN assets a ON a.company_id = s.company_id AND a.site_id = s.id
       LEFT JOIN service_cases sc ON sc.company_id = a.company_id AND sc.asset_id = a.id
       WHERE s.is_active = true
       GROUP BY s.id, c.name
       ORDER BY c.name, s.name`,
    );
    return result.rows;
  });
}

export function createCustomerSite(session: SessionContext, input: CustomerSiteInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const customer = await tx.query<{ id: string }>(
      "SELECT id FROM counterparties WHERE id = $1 AND kind IN ('customer', 'both') AND is_active = true",
      [input.counterpartyId],
    );
    if (!customer.rows[0]) throw new Error("Customer not found");
    await tx.query(
      `INSERT INTO customer_sites
         (id, company_id, counterparty_id, code, name, address, contact_name,
          contact_phone, contact_email, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, session.companyId, input.counterpartyId, input.code, input.name, input.address || null, input.contactName || null, input.contactPhone || null, input.contactEmail || null, input.timezone],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "customer_site.created",
      entityType: "customer_site",
      entityId: id,
      summary: `${input.code} ${input.name} 사업장 등록`,
      afterData: { code: input.code, name: input.name, counterpartyId: input.counterpartyId },
    });
    return id;
  });
}

export type InspectionRow = {
  id: string;
  number: string;
  asset_id: string;
  asset_tag: string;
  product_name: string;
  customer_name: string;
  site_name: string;
  inspection_type: "installation" | "preventive" | "quarterly" | "incident" | "upgrade";
  status: InspectionStatus;
  scheduled_date: string;
  engineer_name: string;
  system_health: "healthy" | "warning" | "critical" | "unknown";
  protection_status: "pass" | "warning" | "fail" | "na";
  sync_status: "pass" | "warning" | "fail" | "na";
  service_status: "pass" | "warning" | "fail" | "na";
  cpu_percent: string | null;
  memory_percent: string | null;
  disk_percent: string | null;
  findings: string | null;
  action_items: string | null;
  next_inspection_date: string | null;
};

export type InspectionInput = {
  assetId: string;
  inspectionType: InspectionRow["inspection_type"];
  scheduledDate: string;
  reportReference?: string;
};

export type InspectionResultInput = {
  inspectionId: string;
  nextStatus: InspectionStatus;
  systemHealth?: InspectionRow["system_health"];
  protectionStatus?: InspectionRow["protection_status"];
  syncStatus?: InspectionRow["sync_status"];
  serviceStatus?: InspectionRow["service_status"];
  cpuPercent?: number | "";
  memoryPercent?: number | "";
  diskPercent?: number | "";
  findings?: string;
  actionItems?: string;
  nextInspectionDate?: string;
};

export function listInspections(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<InspectionRow>(
      `SELECT i.id, i.number, i.asset_id, a.asset_tag, a.product_name,
              c.name AS customer_name, s.name AS site_name, i.inspection_type,
              i.status, i.scheduled_date::text, u.name AS engineer_name,
              i.system_health, i.protection_status, i.sync_status, i.service_status,
              i.cpu_percent::text, i.memory_percent::text, i.disk_percent::text,
              i.findings, i.action_items, i.next_inspection_date::text
       FROM maintenance_inspections i
       JOIN assets a ON a.company_id = i.company_id AND a.id = i.asset_id
       JOIN customer_sites s ON s.company_id = i.company_id AND s.id = i.site_id
       JOIN counterparties c ON c.company_id = a.company_id AND c.id = a.counterparty_id
       JOIN users u ON u.id = i.engineer_id
       ORDER BY CASE i.status WHEN 'issue_found' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'scheduled' THEN 3 ELSE 4 END,
                i.scheduled_date, i.created_at DESC`,
    );
    return result.rows;
  });
}

async function nextOperationNumber(tx: TransactionClient, companyId: string, kind: string, prefix: string, year: string) {
  const counterKind = `${kind}:${year}`;
  await tx.query(
    `INSERT INTO document_counters (company_id, kind, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, kind) DO NOTHING`,
    [companyId, counterKind],
  );
  const result = await tx.query<{ value: string }>(
    `UPDATE document_counters SET next_value = next_value + 1
     WHERE company_id = $1 AND kind = $2
     RETURNING (next_value - 1)::text AS value`,
    [companyId, counterKind],
  );
  return `${prefix}-${year}-${String(Number(result.rows[0]?.value ?? 1)).padStart(5, "0")}`;
}

async function refreshAssetNextInspectionDate(
  tx: TransactionClient,
  assetId: string,
) {
  await tx.query(
    `UPDATE assets
     SET next_inspection_date = (
       SELECT MIN(candidate_date)
       FROM (
         SELECT scheduled_date AS candidate_date
         FROM maintenance_inspections
         WHERE asset_id = $1 AND status IN ('scheduled', 'in_progress', 'issue_found')
         UNION ALL
         SELECT next_inspection_date AS candidate_date
         FROM maintenance_inspections
         WHERE asset_id = $1
           AND status IN ('completed', 'issue_found')
           AND next_inspection_date >= moarix_company_today()
       ) candidates
     )
     WHERE id = $1`,
    [assetId],
  );
}

export function createInspection(session: SessionContext, input: InspectionInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const assetResult = await tx.query<{ site_id: string | null; asset_tag: string }>(
      `SELECT asset.site_id, asset.asset_tag
       FROM assets asset
       JOIN customer_sites site
         ON site.company_id = asset.company_id AND site.id = asset.site_id AND site.is_active = true
       JOIN counterparties customer
         ON customer.company_id = asset.company_id AND customer.id = asset.counterparty_id AND customer.is_active = true
       WHERE asset.id = $1 AND asset.status <> 'retired'
       FOR UPDATE OF asset`,
      [input.assetId],
    );
    const asset = assetResult.rows[0];
    if (!asset) throw new Error("Asset not found");
    if (!asset.site_id) throw new Error("Asset site is required");
    const year = dateInTimeZone(session.companyTimezone).slice(0, 4);
    const number = await nextOperationNumber(tx, session.companyId, "inspection", "INSP", year);
    await tx.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, scheduled_date,
          engineer_id, report_reference, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)`,
      [id, session.companyId, number, input.assetId, asset.site_id, input.inspectionType, input.scheduledDate, session.userId, input.reportReference || null],
    );
    const defaultChecks = [
      ["protection", "Protection 상태", 1],
      ["sync", "동기화 상태", 2],
      ["service", "서비스 상태", 3],
      ["cpu", "CPU 사용률", 4],
      ["memory", "메모리 사용률", 5],
      ["disk", "디스크 사용률", 6],
    ] as const;
    for (const [itemKey, label, position] of defaultChecks) {
      await tx.query(
        `INSERT INTO inspection_check_items
           (id, company_id, inspection_id, item_key, category, label, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), session.companyId, id, itemKey, itemKey === "cpu" || itemKey === "memory" || itemKey === "disk" ? "resources" : "availability", label, position],
      );
    }
    await refreshAssetNextInspectionDate(tx, input.assetId);
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "inspection.created",
      entityType: "maintenance_inspection",
      entityId: id,
      summary: `${number} ${asset.asset_tag} 점검 예약`,
      afterData: { number, assetId: input.assetId, scheduledDate: input.scheduledDate, inspectionType: input.inspectionType },
    });
    return { id, number };
  });
}

function nullableMetric(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

function metricCheck(value: number | "" | undefined) {
  if (value === "" || value === undefined) return { result: "na", value: null };
  return { result: value >= 95 ? "fail" : value >= 80 ? "warning" : "pass", value: `${value}%` };
}

export function transitionInspection(session: SessionContext, input: InspectionResultInput) {
  return withCompany(session.companyId, async (tx) => {
    const currentResult = await tx.query<{ status: InspectionStatus; number: string; asset_id: string }>(
      "SELECT status, number, asset_id FROM maintenance_inspections WHERE id = $1 FOR UPDATE",
      [input.inspectionId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Inspection not found");
    assertInspectionTransition(current.status, input.nextStatus);

    const finishing = input.nextStatus === "completed" || input.nextStatus === "issue_found";
    if (finishing && (!input.systemHealth || !input.protectionStatus || !input.syncStatus || !input.serviceStatus)) {
      throw new Error("Inspection result is incomplete");
    }
    if (input.nextStatus === "issue_found" && !input.findings?.trim()) {
      throw new Error("Inspection findings are required");
    }

    if (finishing) {
      const cpuCheck = metricCheck(input.cpuPercent);
      const memoryCheck = metricCheck(input.memoryPercent);
      const diskCheck = metricCheck(input.diskPercent);
      const checks = [
        { key: "protection", result: input.protectionStatus ?? "na", value: null },
        { key: "sync", result: input.syncStatus ?? "na", value: null },
        { key: "service", result: input.serviceStatus ?? "na", value: null },
        { key: "cpu", ...cpuCheck },
        { key: "memory", ...memoryCheck },
        { key: "disk", ...diskCheck },
      ];
      for (const check of checks) {
        await tx.query(
          `UPDATE inspection_check_items
           SET result = $3, observed_value = $4
           WHERE inspection_id = $1 AND item_key = $2`,
          [input.inspectionId, check.key, check.result, check.value],
        );
      }
    }

    await tx.query(
      `UPDATE maintenance_inspections
       SET status = $2,
           started_at = CASE WHEN $2 = 'in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
           completed_at = CASE WHEN $2 IN ('completed', 'issue_found') THEN now()
                               WHEN $2 = 'in_progress' THEN NULL ELSE completed_at END,
           system_health = COALESCE($3, system_health),
           protection_status = COALESCE($4, protection_status),
           sync_status = COALESCE($5, sync_status),
           service_status = COALESCE($6, service_status),
           cpu_percent = CASE WHEN $2 IN ('completed', 'issue_found') THEN $7 ELSE cpu_percent END,
           memory_percent = CASE WHEN $2 IN ('completed', 'issue_found') THEN $8 ELSE memory_percent END,
           disk_percent = CASE WHEN $2 IN ('completed', 'issue_found') THEN $9 ELSE disk_percent END,
           findings = COALESCE($10, findings),
           action_items = COALESCE($11, action_items),
           next_inspection_date = CASE WHEN $2 IN ('completed', 'issue_found') THEN $12 ELSE next_inspection_date END
       WHERE id = $1`,
      [input.inspectionId, input.nextStatus, input.systemHealth || null, input.protectionStatus || null, input.syncStatus || null, input.serviceStatus || null, nullableMetric(input.cpuPercent), nullableMetric(input.memoryPercent), nullableMetric(input.diskPercent), input.findings || null, input.actionItems || null, input.nextInspectionDate || null],
    );
    await refreshAssetNextInspectionDate(tx, current.asset_id);
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "inspection.status_changed",
      entityType: "maintenance_inspection",
      entityId: input.inspectionId,
      summary: `${current.number} 점검 상태 ${current.status} → ${input.nextStatus}`,
      beforeData: { status: current.status },
      afterData: {
        status: input.nextStatus,
        systemHealth: input.systemHealth,
        protectionStatus: input.protectionStatus,
        syncStatus: input.syncStatus,
        serviceStatus: input.serviceStatus,
        cpuPercent: input.cpuPercent,
        memoryPercent: input.memoryPercent,
        diskPercent: input.diskPercent,
        findings: input.findings,
        actionItems: input.actionItems,
        nextInspectionDate: input.nextInspectionDate,
      },
    });
    return { assetId: current.asset_id };
  });
}
