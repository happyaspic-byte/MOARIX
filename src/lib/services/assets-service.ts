import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { assertServiceCaseTransition, type ServiceCaseStatus } from "@/lib/domain/service-case-state";
import { withCompany } from "@/lib/db/client";
import { writeAudit } from "./audit";

export type AssetRow = {
  id: string;
  counterparty_id: string;
  asset_tag: string;
  vendor_asset_id: string | null;
  product_name: string;
  product_family: "everrun" | "ztc_endurance" | "ztc_edge" | "ftserver" | "other";
  product_model: string | null;
  software_version: string | null;
  protection_mode: "ha" | "ft" | "mixed" | "none" | "other";
  operating_system: string | null;
  management_ip: string | null;
  serial_number: string | null;
  status: "active" | "maintenance" | "retired";
  counterparty_name: string;
  site_id: string | null;
  site: string | null;
  installed_at: string | null;
  warranty_until: string | null;
  support_until: string | null;
  contract_status: "active" | "pending_renewal" | "not_contracted" | "expired";
  contract_number: string | null;
  channel_partner: string | null;
  support_provider: string | null;
  support_level: string | null;
  service_method: "remote" | "visit" | "hybrid";
  next_inspection_date: string | null;
};

export type ServiceCaseRow = {
  id: string;
  number: string;
  title: string;
  severity: "low" | "normal" | "high" | "critical";
  status: ServiceCaseStatus;
  counterparty_name: string;
  asset_tag: string | null;
  assigned_to_name: string | null;
  opened_at: string;
  due_at: string | null;
  external_provider: string | null;
  external_case_number: string | null;
  waiting_reason: string | null;
  resolution_summary: string | null;
};

export function listAssetsAndCases(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [assets, cases] = await Promise.all([
      tx.query<AssetRow>(
        `SELECT a.id, a.counterparty_id, a.asset_tag, a.vendor_asset_id, a.product_name,
                a.product_family, a.product_model, a.software_version, a.protection_mode,
                a.operating_system, a.management_ip, a.serial_number, a.status,
                c.name AS counterparty_name, a.site_id, COALESCE(s.name, a.site) AS site,
                a.installed_at::text, a.warranty_until::text, a.support_until::text,
                a.contract_status, a.contract_number, a.channel_partner, a.support_provider,
                a.support_level, a.service_method, a.next_inspection_date::text
         FROM assets a
         JOIN counterparties c ON c.company_id = a.company_id AND c.id = a.counterparty_id
         LEFT JOIN customer_sites s ON s.company_id = a.company_id AND s.id = a.site_id
         ORDER BY a.support_until NULLS LAST, a.asset_tag`,
      ),
      tx.query<ServiceCaseRow>(
        `SELECT s.id, s.number, s.title, s.severity, s.status,
                c.name AS counterparty_name, a.asset_tag,
                u.name AS assigned_to_name, s.opened_at::text, s.due_at::text,
                s.external_provider, s.external_case_number, s.waiting_reason, s.resolution_summary
         FROM service_cases s
         JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
         LEFT JOIN assets a ON a.company_id = s.company_id AND a.id = s.asset_id
         LEFT JOIN users u ON u.id = s.assigned_to
         ORDER BY CASE s.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting' THEN 3 ELSE 4 END,
                  CASE s.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                  s.opened_at DESC`,
      ),
    ]);
    return { assets: assets.rows, cases: cases.rows };
  });
}

export type AssetInput = {
  counterpartyId: string;
  siteId: string;
  assetTag: string;
  vendorAssetId?: string;
  productName: string;
  productFamily: AssetRow["product_family"];
  productModel?: string;
  softwareVersion?: string;
  protectionMode: AssetRow["protection_mode"];
  operatingSystem?: string;
  managementIp?: string;
  serialNumber?: string;
  serviceMethod: AssetRow["service_method"];
  contractStatus: AssetRow["contract_status"];
  contractNumber?: string;
  channelPartner?: string;
  supportProvider?: string;
  supportLevel?: string;
  supportStartedAt?: string;
  installedAt?: string;
  warrantyUntil?: string;
  supportUntil?: string;
  nextInspectionDate?: string;
  notes?: string;
};

export function createAsset(session: SessionContext, input: AssetInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const site = await tx.query<{ id: string }>(
      "SELECT id FROM customer_sites WHERE id = $1 AND counterparty_id = $2 AND is_active = true",
      [input.siteId, input.counterpartyId],
    );
    if (!site.rows[0]) throw new Error("Customer site mismatch");
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, product_model, software_version, protection_mode,
          operating_system, management_ip, serial_number, service_method, contract_status,
          contract_number, channel_partner, support_provider, support_level, support_started_at,
          installed_at, warranty_until, support_until, next_inspection_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
      [id, session.companyId, input.counterpartyId, input.siteId, input.assetTag, input.vendorAssetId || null, input.productName, input.productFamily, input.productModel || null, input.softwareVersion || null, input.protectionMode, input.operatingSystem || null, input.managementIp || null, input.serialNumber || null, input.serviceMethod, input.contractStatus, input.contractNumber || null, input.channelPartner || null, input.supportProvider || null, input.supportLevel || null, input.supportStartedAt || null, input.installedAt || null, input.warrantyUntil || null, input.supportUntil || null, input.nextInspectionDate || null, input.notes || null],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "asset.created",
      entityType: "asset",
      entityId: id,
      summary: `${input.assetTag} ${input.productName} 자산 등록`,
      afterData: { assetTag: input.assetTag, vendorAssetId: input.vendorAssetId, productName: input.productName, productFamily: input.productFamily, contractStatus: input.contractStatus, supportUntil: input.supportUntil },
    });
    return id;
  });
}

export type ServiceCaseInput = {
  counterpartyId: string;
  assetId?: string;
  title: string;
  description?: string;
  severity: ServiceCaseRow["severity"];
  dueAt?: string;
  externalProvider?: string;
  externalCaseNumber?: string;
};

export function createServiceCase(session: SessionContext, input: ServiceCaseInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    if (input.assetId) {
      const asset = await tx.query<{ id: string }>(
        "SELECT id FROM assets WHERE id = $1 AND counterparty_id = $2",
        [input.assetId, input.counterpartyId],
      );
      if (!asset.rows[0]) throw new Error("Service case asset mismatch");
    }
    const counterKind = `service_case:${new Date().getFullYear()}`;
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
    const number = `CS-${new Date().getFullYear()}-${String(value).padStart(5, "0")}`;
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, title, description,
          severity, due_at, assigned_to, created_by, external_provider, external_case_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12)`,
      [id, session.companyId, number, input.counterpartyId, input.assetId || null, input.title, input.description || null, input.severity, input.dueAt || null, session.userId, input.externalProvider || null, input.externalCaseNumber || null],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.created",
      entityType: "service_case",
      entityId: id,
      summary: `${number} ${input.title} 등록`,
      afterData: { number, title: input.title, severity: input.severity },
    });
    return { id, number };
  });
}

export type ServiceCaseTransitionInput = {
  caseId: string;
  nextStatus: ServiceCaseStatus;
  waitingReason?: string;
  resolutionSummary?: string;
};

export function transitionServiceCase(session: SessionContext, input: ServiceCaseTransitionInput) {
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<{ status: ServiceCaseStatus; number: string }>(
      "SELECT status, number FROM service_cases WHERE id = $1 FOR UPDATE",
      [input.caseId],
    );
    const current = result.rows[0];
    if (!current) throw new Error("Service case not found");
    assertServiceCaseTransition(current.status, input.nextStatus);
    if (input.nextStatus === "waiting" && !input.waitingReason?.trim()) throw new Error("Waiting reason is required");
    if (input.nextStatus === "resolved" && !input.resolutionSummary?.trim()) throw new Error("Resolution summary is required");

    await tx.query(
      `UPDATE service_cases
       SET status = $2,
           waiting_reason = CASE WHEN $2 = 'waiting' THEN $3 WHEN $2 = 'in_progress' THEN NULL ELSE waiting_reason END,
           resolution_summary = CASE WHEN $2 = 'resolved' THEN $4 WHEN $2 = 'in_progress' THEN NULL ELSE resolution_summary END,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() WHEN $2 = 'in_progress' THEN NULL ELSE resolved_at END,
           closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END
       WHERE id = $1`,
      [input.caseId, input.nextStatus, input.waitingReason || null, input.resolutionSummary || null],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "service_case.status_changed",
      entityType: "service_case",
      entityId: input.caseId,
      summary: `${current.number} 상태 ${current.status} → ${input.nextStatus}`,
      beforeData: { status: current.status },
      afterData: { status: input.nextStatus, waitingReason: input.waitingReason, resolutionSummary: input.resolutionSummary },
    });
  });
}
