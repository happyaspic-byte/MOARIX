import { withCompany } from "@/lib/db/client";
import type { AssetProductFamily, ContractStatus } from "./assets-service";

export type Customer360Profile = {
  id: string;
  code: string;
  kind: "customer" | "supplier" | "both";
  name: string;
  business_number: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms_days: number;
  credit_limit: string;
  is_active: boolean;
};

export type Customer360Site = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  si_contact_name: string | null;
  si_contact_phone: string | null;
  si_contact_email: string | null;
  timezone: string;
  is_active: boolean;
  asset_count: number;
  open_case_count: number;
};

export type Customer360Asset = {
  id: string;
  asset_tag: string;
  vendor_asset_id: string | null;
  product_name: string;
  product_family: AssetProductFamily;
  product_model: string | null;
  software_version: string | null;
  protection_mode: "ha" | "ft" | "mixed" | "none" | "other";
  status: "active" | "maintenance" | "retired";
  site_name: string | null;
  contract_status: ContractStatus;
  support_until: string | null;
  vendor_contract_status: ContractStatus | null;
  vendor_support_until: string | null;
  node_count: number;
  vm_count: number;
  open_case_count: number;
  next_inspection_date: string | null;
};

export type Customer360Case = {
  id: string;
  asset_id: string | null;
  number: string;
  title: string;
  severity: "low" | "normal" | "high" | "critical";
  status: "open" | "in_progress" | "waiting";
  due_at: string | null;
  next_action_at: string | null;
  updated_at: string;
  asset_tag: string | null;
  site_name: string | null;
};

export type Customer360Inspection = {
  id: string;
  asset_id: string;
  number: string;
  inspection_type: "installation" | "preventive" | "quarterly" | "incident" | "upgrade";
  status: "scheduled" | "in_progress" | "completed" | "issue_found" | "cancelled";
  scheduled_date: string;
  completed_at: string | null;
  system_health: "healthy" | "warning" | "critical" | "unknown";
  asset_tag: string;
  product_name: string;
  site_name: string;
  engineer_name: string;
};

export async function getCustomer360(companyId: string, counterpartyId: string) {
  return withCompany(companyId, async (tx) => {
    const customerResult = await tx.query<Customer360Profile>(
      `SELECT id, code, kind, name, business_number, representative_name, email, phone,
              address, payment_terms_days, credit_limit::text, is_active
       FROM counterparties
       WHERE id = $1 AND company_id = $2`,
      [counterpartyId, companyId],
    );
    const customer = customerResult.rows[0];
    if (!customer) return null;

    const [sites, assets, cases, inspections] = await Promise.all([
      tx.query<Customer360Site>(
        `SELECT site.id, site.code, site.name, site.address, site.contact_name,
                site.contact_phone, site.contact_email, site.si_contact_name,
                site.si_contact_phone, site.si_contact_email, site.timezone, site.is_active,
                (SELECT count(*)::integer FROM assets asset
                 WHERE asset.company_id = site.company_id AND asset.site_id = site.id
                   AND asset.status <> 'retired') AS asset_count,
                (SELECT count(*)::integer FROM service_cases service_case
                 JOIN assets asset ON asset.company_id = service_case.company_id
                                  AND asset.id = service_case.asset_id
                 WHERE service_case.company_id = site.company_id AND asset.site_id = site.id
                   AND service_case.status IN ('open', 'in_progress', 'waiting')) AS open_case_count
         FROM customer_sites site
         WHERE site.counterparty_id = $1 AND site.company_id = $2
         ORDER BY site.is_active DESC, site.name`,
        [counterpartyId, companyId],
      ),
      tx.query<Customer360Asset>(
        `SELECT asset.id, asset.asset_tag, asset.vendor_asset_id, asset.product_name,
                asset.product_family, asset.product_model, asset.software_version,
                asset.protection_mode, asset.status, site.name AS site_name,
                asset.contract_status, asset.support_until::text,
                (SELECT contract.status FROM asset_support_contracts contract
                 WHERE contract.company_id = asset.company_id AND contract.asset_id = asset.id
                   AND contract.scope = 'vendor_support' AND contract.is_current = true
                 LIMIT 1) AS vendor_contract_status,
                (SELECT contract.ends_on::text FROM asset_support_contracts contract
                 WHERE contract.company_id = asset.company_id AND contract.asset_id = asset.id
                   AND contract.scope = 'vendor_support' AND contract.is_current = true
                 LIMIT 1) AS vendor_support_until,
                (SELECT count(*)::integer FROM asset_nodes node
                 WHERE node.company_id = asset.company_id AND node.asset_id = asset.id) AS node_count,
                (SELECT count(*)::integer FROM asset_virtual_machines vm
                 WHERE vm.company_id = asset.company_id AND vm.asset_id = asset.id) AS vm_count,
                (SELECT count(*)::integer FROM service_cases service_case
                 WHERE service_case.company_id = asset.company_id AND service_case.asset_id = asset.id
                   AND service_case.status IN ('open', 'in_progress', 'waiting')) AS open_case_count,
                asset.next_inspection_date::text
         FROM assets asset
         LEFT JOIN customer_sites site ON site.company_id = asset.company_id AND site.id = asset.site_id
         WHERE asset.counterparty_id = $1 AND asset.company_id = $2
         ORDER BY CASE asset.status WHEN 'active' THEN 1 WHEN 'maintenance' THEN 2 ELSE 3 END,
                  asset.asset_tag`,
        [counterpartyId, companyId],
      ),
      tx.query<Customer360Case>(
        `SELECT service_case.id, service_case.asset_id, service_case.number,
                service_case.title, service_case.severity, service_case.status,
                service_case.due_at::text, service_case.next_action_at::text,
                service_case.updated_at::text, asset.asset_tag, site.name AS site_name
         FROM service_cases service_case
         LEFT JOIN assets asset ON asset.company_id = service_case.company_id
                               AND asset.id = service_case.asset_id
         LEFT JOIN customer_sites site ON site.company_id = asset.company_id AND site.id = asset.site_id
         WHERE service_case.counterparty_id = $1 AND service_case.company_id = $2
           AND service_case.status IN ('open', 'in_progress', 'waiting')
         ORDER BY CASE service_case.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                                            WHEN 'normal' THEN 3 ELSE 4 END,
                  service_case.due_at NULLS LAST, service_case.updated_at DESC`,
        [counterpartyId, companyId],
      ),
      tx.query<Customer360Inspection>(
        `SELECT inspection.id, inspection.asset_id, inspection.number,
                inspection.inspection_type, inspection.status,
                inspection.scheduled_date::text, inspection.completed_at::text,
                inspection.system_health, asset.asset_tag, asset.product_name,
                site.name AS site_name, engineer.name AS engineer_name
         FROM maintenance_inspections inspection
         JOIN assets asset ON asset.company_id = inspection.company_id
                          AND asset.id = inspection.asset_id
         JOIN customer_sites site ON site.company_id = inspection.company_id
                                 AND site.id = inspection.site_id
         JOIN company_members engineer_member
           ON engineer_member.company_id = inspection.company_id
          AND engineer_member.user_id = inspection.engineer_id
         JOIN users engineer ON engineer.id = engineer_member.user_id
         WHERE asset.counterparty_id = $1 AND inspection.company_id = $2
         ORDER BY CASE inspection.status WHEN 'issue_found' THEN 1 WHEN 'in_progress' THEN 2
                                         WHEN 'scheduled' THEN 3 ELSE 4 END,
                  inspection.scheduled_date DESC, inspection.created_at DESC
         LIMIT 30`,
        [counterpartyId, companyId],
      ),
    ]);

    return {
      customer,
      sites: sites.rows,
      assets: assets.rows,
      cases: cases.rows,
      inspections: inspections.rows,
    };
  });
}
