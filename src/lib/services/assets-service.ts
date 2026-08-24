import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { withCompany } from "@/lib/db/client";
import { writeAudit } from "./audit";

export type AssetRow = {
  id: string;
  asset_tag: string;
  product_name: string;
  serial_number: string | null;
  status: "active" | "maintenance" | "retired";
  counterparty_name: string;
  site: string | null;
  installed_at: string | null;
  warranty_until: string | null;
  support_until: string | null;
};

export type ServiceCaseRow = {
  id: string;
  number: string;
  title: string;
  severity: "low" | "normal" | "high" | "critical";
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  counterparty_name: string;
  asset_tag: string | null;
  assigned_to_name: string | null;
  opened_at: string;
  due_at: string | null;
};

export function listAssetsAndCases(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [assets, cases] = await Promise.all([
      tx.query<AssetRow>(
        `SELECT a.id, a.asset_tag, a.product_name, a.serial_number, a.status,
                c.name AS counterparty_name, a.site, a.installed_at::text,
                a.warranty_until::text, a.support_until::text
         FROM assets a
         JOIN counterparties c ON c.company_id = a.company_id AND c.id = a.counterparty_id
         ORDER BY a.support_until NULLS LAST, a.asset_tag`,
      ),
      tx.query<ServiceCaseRow>(
        `SELECT s.id, s.number, s.title, s.severity, s.status,
                c.name AS counterparty_name, a.asset_tag,
                u.name AS assigned_to_name, s.opened_at::text, s.due_at::text
         FROM service_cases s
         JOIN counterparties c ON c.company_id = s.company_id AND c.id = s.counterparty_id
         LEFT JOIN assets a ON a.company_id = s.company_id AND a.id = s.asset_id
         LEFT JOIN users u ON u.id = s.assigned_to
         ORDER BY CASE s.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                  s.opened_at DESC`,
      ),
    ]);
    return { assets: assets.rows, cases: cases.rows };
  });
}

export type AssetInput = {
  counterpartyId: string;
  assetTag: string;
  productName: string;
  serialNumber?: string;
  site?: string;
  installedAt?: string;
  warrantyUntil?: string;
  supportUntil?: string;
  notes?: string;
};

export function createAsset(session: SessionContext, input: AssetInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, asset_tag, product_name, serial_number,
          site, installed_at, warranty_until, support_until, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, session.companyId, input.counterpartyId, input.assetTag, input.productName, input.serialNumber || null, input.site || null, input.installedAt || null, input.warrantyUntil || null, input.supportUntil || null, input.notes || null],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "asset.created",
      entityType: "asset",
      entityId: id,
      summary: `${input.assetTag} ${input.productName} 자산 등록`,
      afterData: { assetTag: input.assetTag, productName: input.productName, supportUntil: input.supportUntil },
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
};

export function createServiceCase(session: SessionContext, input: ServiceCaseInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const numberResult = await tx.query<{ value: string }>(
      "SELECT (COUNT(*) + 1)::text AS value FROM service_cases WHERE opened_at >= date_trunc('year', now())",
    );
    const value = Number(numberResult.rows[0]?.value ?? 1);
    const number = `CS-${new Date().getFullYear()}-${String(value).padStart(5, "0")}`;
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, title, description,
          severity, due_at, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [id, session.companyId, number, input.counterpartyId, input.assetId || null, input.title, input.description || null, input.severity, input.dueAt || null, session.userId],
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
