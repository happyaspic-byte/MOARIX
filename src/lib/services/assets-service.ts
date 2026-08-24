import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
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

export function listAssets(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const assets = await tx.query<AssetRow>(
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
    );
    return assets.rows;
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
