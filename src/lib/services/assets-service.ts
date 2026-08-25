import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { withCompany, type TransactionClient } from "@/lib/db/client";
import type { Role } from "@/lib/security/permissions";
import { writeAudit } from "./audit";

export type AssetProductFamily = "everrun" | "ztc_endurance" | "ztc_edge" | "ftserver" | "other";
export type ContractStatus = "active" | "pending_renewal" | "not_contracted" | "expired";

export type AssetAssignableMember = {
  user_id: string;
  name: string;
  role: Role;
  is_active: boolean;
};

export async function listAssetAssignableMembers(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<AssetAssignableMember>(
      `SELECT member.user_id, app_user.name, member.role,
              (app_user.is_active AND member.is_active) AS is_active
       FROM company_members member
       JOIN users app_user ON app_user.id = member.user_id
       WHERE member.company_id = $1
       ORDER BY CASE member.role
         WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3
         WHEN 'member' THEN 4 ELSE 5 END, app_user.name`,
      [companyId],
    );
    return result.rows;
  });
}

export type AssetRow = {
  id: string;
  counterparty_id: string;
  asset_tag: string;
  vendor_asset_id: string | null;
  product_name: string;
  product_family: AssetProductFamily;
  product_model: string | null;
  software_version: string | null;
  protection_mode: "ha" | "ft" | "mixed" | "none" | "other";
  operating_system: string | null;
  management_ip: string | null;
  serial_number: string | null;
  status: "active" | "maintenance" | "retired";
  counterparty_name: string;
  counterparty_active: boolean;
  site_id: string | null;
  site: string | null;
  site_active: boolean | null;
  installed_at: string | null;
  warranty_until: string | null;
  support_started_at: string | null;
  support_until: string | null;
  contract_status: ContractStatus;
  contract_number: string | null;
  channel_partner: string | null;
  support_provider: string | null;
  support_level: string | null;
  service_method: "remote" | "visit" | "hybrid";
  next_inspection_date: string | null;
  notes: string | null;
  business_system: string | null;
  environment: "production" | "staging" | "test" | "development" | "other";
  hardware_vendor: string | null;
  rack_location: string | null;
  hypervisor: string | null;
  assigned_engineer_id: string | null;
  assigned_engineer_name: string | null;
  configuration_source: "manual" | "inspection" | "import" | "monitoring";
  configuration_checked_at: string | null;
  vendor_contract_status: ContractStatus | null;
  vendor_support_until: string | null;
  node_count: number;
  vm_count: number;
  open_case_count: number;
  due_inspection_count: number;
};

const assetSelect = `SELECT a.id, a.counterparty_id, a.asset_tag, a.vendor_asset_id, a.product_name,
        a.product_family, a.product_model, a.software_version, a.protection_mode,
        a.operating_system, a.management_ip, a.serial_number, a.status,
        c.name AS counterparty_name, c.is_active AS counterparty_active,
        a.site_id, COALESCE(s.name, a.site) AS site, s.is_active AS site_active,
        a.installed_at::text, a.warranty_until::text, a.support_started_at::text,
        a.support_until::text, a.contract_status, a.contract_number, a.channel_partner,
        a.support_provider, a.support_level, a.service_method, a.next_inspection_date::text,
        a.notes, a.business_system, a.environment, a.hardware_vendor, a.rack_location,
        a.hypervisor, a.assigned_engineer_id, engineer.name AS assigned_engineer_name,
        a.configuration_source, a.configuration_checked_at::text,
        (SELECT contract.status FROM asset_support_contracts contract
         WHERE contract.company_id = a.company_id AND contract.asset_id = a.id
           AND contract.scope = 'vendor_support' AND contract.is_current = true
         LIMIT 1) AS vendor_contract_status,
        (SELECT contract.ends_on::text FROM asset_support_contracts contract
         WHERE contract.company_id = a.company_id AND contract.asset_id = a.id
           AND contract.scope = 'vendor_support' AND contract.is_current = true
         LIMIT 1) AS vendor_support_until,
        (SELECT COUNT(*)::integer FROM asset_nodes node
         WHERE node.company_id = a.company_id AND node.asset_id = a.id) AS node_count,
        (SELECT COUNT(*)::integer FROM asset_virtual_machines vm
         WHERE vm.company_id = a.company_id AND vm.asset_id = a.id) AS vm_count,
        (SELECT COUNT(*)::integer FROM service_cases service_case
         WHERE service_case.company_id = a.company_id AND service_case.asset_id = a.id
           AND service_case.status IN ('open', 'in_progress', 'waiting')) AS open_case_count,
        (SELECT COUNT(*)::integer FROM maintenance_inspections inspection
         WHERE inspection.company_id = a.company_id AND inspection.asset_id = a.id
           AND inspection.status IN ('scheduled', 'in_progress', 'issue_found')
           AND inspection.scheduled_date <= moarix_company_today() + 30) AS due_inspection_count
 FROM assets a
 JOIN counterparties c ON c.company_id = a.company_id AND c.id = a.counterparty_id
 LEFT JOIN customer_sites s ON s.company_id = a.company_id AND s.id = a.site_id
 LEFT JOIN users engineer ON engineer.id = a.assigned_engineer_id`;

export function listAssets(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const assets = await tx.query<AssetRow>(`${assetSelect} ORDER BY a.asset_tag`);
    return assets.rows;
  });
}

export type AssetInput = {
  counterpartyId: string;
  siteId: string;
  assetTag: string;
  vendorAssetId?: string;
  productName: string;
  productFamily: AssetProductFamily;
  productModel?: string;
  softwareVersion?: string;
  protectionMode: AssetRow["protection_mode"];
  operatingSystem?: string;
  managementIp?: string;
  serialNumber?: string;
  serviceMethod: AssetRow["service_method"];
  contractStatus: ContractStatus;
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
      `SELECT site.id FROM customer_sites site
       JOIN counterparties customer ON customer.company_id = site.company_id AND customer.id = site.counterparty_id
       WHERE site.id = $1 AND site.counterparty_id = $2 AND site.is_active = true AND customer.is_active = true`,
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

export type AssetNodeRow = {
  id: string; role: "node0" | "node1" | "cma" | "cmb" | "host" | "other"; name: string;
  hardware_model: string | null; serial_number: string | null; operating_system: string | null;
  status: "active" | "standby" | "maintenance" | "fault" | "offline" | "unknown";
  management_address: string | null; bmc_address: string | null; cpu_cores: number | null;
  memory_gb: string | null; source: string; last_verified_at: string | null; notes: string | null;
};
export type AssetNetworkRow = {
  id: string; node_id: string | null; node_name: string | null; label: string;
  purpose: "management" | "business" | "a_link" | "private" | "bmc" | "storage" | "other";
  address: string | null; peer_address: string | null; mac_address: string | null;
  vlan_id: number | null; speed_mbps: number | null; switch_port: string | null;
  redundancy_group: string | null; status: "up" | "down" | "degraded" | "unknown";
  source: string; last_verified_at: string | null; notes: string | null;
};
export type AssetVmRow = {
  id: string; name: string; business_role: string | null; operating_system: string | null;
  protection_mode: "ha" | "ft" | "unprotected" | "other";
  status: "running" | "stopped" | "degraded" | "faulted" | "unknown";
  vcpu: number | null; memory_gb: string | null; storage_gb: string | null;
  ip_addresses: string | null; preferred_node: string | null; preferred_node_name: string | null; source: string;
  last_verified_at: string | null; notes: string | null;
};
export type AssetContractRow = {
  id: string; scope: "customer_support" | "vendor_support"; status: ContractStatus;
  contract_number: string | null; provider_name: string; recipient_name: string | null;
  intermediary_name: string | null; support_level: string | null; service_method: "remote" | "visit" | "hybrid";
  starts_on: string | null; ends_on: string | null; coverage_summary: string | null;
  exclusions: string | null; renewal_owner_name: string | null; is_current: boolean;
  notes: string | null; created_at: string;
};
export type AssetLicenseRow = {
  id: string; product_name: string; license_type: "perpetual" | "subscription" | "oem" | "trial" | "other";
  entitlement_reference: string | null; license_key_hint: string | null; version: string | null;
  quantity: number; status: "active" | "suspended" | "retired"; issued_on: string | null;
  expires_on: string | null; support_contract_id: string | null;
  support_contract_number: string | null; support_contract_scope: AssetContractRow["scope"] | null;
  notes: string | null;
};
export type AssetInspectionRow = {
  id: string; number: string; inspection_type: string; status: string; scheduled_date: string;
  completed_at: string | null; system_health: string; protection_status: string;
  sync_status: string; service_status: string; findings: string | null; action_items: string | null;
  engineer_name: string;
};
export type AssetCaseRow = {
  id: string; number: string; title: string; severity: string; status: string;
  due_at: string | null; next_action_at: string | null; external_case_number: string | null;
};
export type InspectionCheckRow = {
  id: string; inspection_id: string; category: string; label: string; result: string;
  observed_value: string | null; notes: string | null; position: number;
};

export async function getAssetWorkspace(companyId: string, assetId: string) {
  return withCompany(companyId, async (tx) => {
    const assetResult = await tx.query<AssetRow>(`${assetSelect} WHERE a.id = $1`, [assetId]);
    const asset = assetResult.rows[0];
    if (!asset) return null;
    const [nodes, networks, virtualMachines, contracts, licenses, inspections, cases, checks] = await Promise.all([
      tx.query<AssetNodeRow>(`SELECT id, role, name, hardware_model, serial_number, operating_system, status,
        management_address, bmc_address, cpu_cores, memory_gb::text, source,
        last_verified_at::text, notes FROM asset_nodes WHERE asset_id = $1 ORDER BY role, name`, [assetId]),
      tx.query<AssetNetworkRow>(`SELECT network.id, network.node_id, node.name AS node_name, network.label,
        network.purpose, network.address, network.peer_address, network.mac_address,
        network.vlan_id, network.speed_mbps, network.switch_port, network.redundancy_group,
        network.status, network.source, network.last_verified_at::text, network.notes
        FROM asset_network_interfaces network LEFT JOIN asset_nodes node
          ON node.company_id = network.company_id AND node.id = network.node_id
        WHERE network.asset_id = $1 ORDER BY network.purpose, network.label`, [assetId]),
      tx.query<AssetVmRow>(`SELECT vm.id, vm.name, vm.business_role, vm.operating_system,
        vm.protection_mode, vm.status, vm.vcpu, vm.memory_gb::text, vm.storage_gb::text,
        vm.ip_addresses, vm.preferred_node::text, preferred.name AS preferred_node_name,
        vm.source, vm.last_verified_at::text, vm.notes
        FROM asset_virtual_machines vm
        LEFT JOIN asset_nodes preferred
          ON preferred.company_id = vm.company_id AND preferred.asset_id = vm.asset_id
         AND preferred.id = vm.preferred_node
        WHERE vm.asset_id = $1 ORDER BY vm.name`, [assetId]),
      tx.query<AssetContractRow>(`SELECT contract.id, contract.scope, contract.status, contract.contract_number,
        contract.provider_name, contract.recipient_name, contract.intermediary_name,
        contract.support_level, contract.service_method, contract.starts_on::text, contract.ends_on::text,
        contract.coverage_summary, contract.exclusions, owner.name AS renewal_owner_name,
        contract.is_current, contract.notes, contract.created_at::text
        FROM asset_support_contracts contract LEFT JOIN users owner ON owner.id = contract.renewal_owner_id
        WHERE contract.asset_id = $1 ORDER BY contract.is_current DESC, contract.scope, contract.created_at DESC`, [assetId]),
      tx.query<AssetLicenseRow>(`SELECT license.id, license.product_name, license.license_type,
        license.entitlement_reference, license.license_key_hint, license.version,
        license.quantity, license.status, license.issued_on::text, license.expires_on::text,
        license.support_contract_id::text, contract.contract_number AS support_contract_number,
        contract.scope AS support_contract_scope, license.notes
        FROM asset_licenses license
        LEFT JOIN asset_support_contracts contract
          ON contract.company_id = license.company_id AND contract.asset_id = license.asset_id
         AND contract.id = license.support_contract_id
        WHERE license.asset_id = $1
        ORDER BY license.status, license.expires_on NULLS LAST, license.product_name`, [assetId]),
      tx.query<AssetInspectionRow>(`SELECT inspection.id, inspection.number, inspection.inspection_type,
        inspection.status, inspection.scheduled_date::text, inspection.completed_at::text,
        inspection.system_health, inspection.protection_status, inspection.sync_status,
        inspection.service_status, inspection.findings, inspection.action_items,
        engineer.name AS engineer_name FROM maintenance_inspections inspection
        JOIN users engineer ON engineer.id = inspection.engineer_id
        WHERE inspection.asset_id = $1 ORDER BY inspection.scheduled_date DESC, inspection.created_at DESC`, [assetId]),
      tx.query<AssetCaseRow>(`SELECT id, number, title, severity, status, due_at::text,
        next_action_at::text, external_case_number FROM service_cases WHERE asset_id = $1
        ORDER BY CASE WHEN status IN ('open', 'in_progress', 'waiting') THEN 0 ELSE 1 END,
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        updated_at DESC`, [assetId]),
      tx.query<InspectionCheckRow>(`SELECT check_item.id, check_item.inspection_id, check_item.category,
        check_item.label, check_item.result, check_item.observed_value, check_item.notes, check_item.position
        FROM inspection_check_items check_item JOIN maintenance_inspections inspection
          ON inspection.company_id = check_item.company_id AND inspection.id = check_item.inspection_id
        WHERE inspection.asset_id = $1 ORDER BY inspection.scheduled_date DESC, check_item.position`, [assetId]),
    ]);
    return { asset, nodes: nodes.rows, networks: networks.rows, virtualMachines: virtualMachines.rows, contracts: contracts.rows, licenses: licenses.rows, inspections: inspections.rows, cases: cases.rows, checks: checks.rows };
  });
}

async function operationalAsset(tx: TransactionClient, companyId: string, assetId: string) {
  const result = await tx.query<{ id: string; asset_tag: string; product_family: AssetProductFamily }>(
    "SELECT id, asset_tag, product_family FROM assets WHERE id = $1 AND company_id = $2 AND status <> 'retired' FOR UPDATE",
    [assetId, companyId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("Operational asset not found");
  return asset;
}

async function auditAssetChild(tx: TransactionClient, session: SessionContext, input: { action: string; entityType: string; entityId: string; summary: string; beforeData?: unknown; afterData: unknown }) {
  await writeAudit(tx, { companyId: session.companyId, actorUserId: session.userId, action: input.action, entityType: input.entityType, entityId: input.entityId, summary: input.summary, beforeData: input.beforeData, afterData: input.afterData });
}

export type AssetNodeInput = {
  assetId: string; role: AssetNodeRow["role"]; name: string; hardwareModel?: string; serialNumber?: string;
  operatingSystem?: string; status: AssetNodeRow["status"]; managementAddress?: string; bmcAddress?: string;
  cpuCores?: number; memoryGb?: number; lastVerifiedAt?: string; notes?: string;
};
export function createAssetNode(session: SessionContext, input: AssetNodeInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    await tx.query(`INSERT INTO asset_nodes
      (id, company_id, asset_id, role, name, hardware_model, serial_number, operating_system,
       status, management_address, bmc_address, cpu_cores, memory_gb, last_verified_at, created_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
              timezone($17::text, NULLIF($14::text, '')::timestamp),$15,$16)`,
    [id, session.companyId, input.assetId, input.role, input.name, input.hardwareModel || null, input.serialNumber || null, input.operatingSystem || null, input.status, input.managementAddress || null, input.bmcAddress || null, input.cpuCores ?? null, input.memoryGb ?? null, input.lastVerifiedAt || null, session.userId, input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, { action: "asset_node.created", entityType: "asset_node", entityId: id, summary: `${asset.asset_tag} ${input.name} 노드 등록`, afterData: { assetId: input.assetId, role: input.role, name: input.name, status: input.status } });
    return id;
  });
}

export type AssetNodeUpdateInput = AssetNodeInput & { assetNodeId: string };
export function updateAssetNode(session: SessionContext, input: AssetNodeUpdateInput) {
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    const currentResult = await tx.query<AssetNodeRow>(`SELECT id, role, name, hardware_model,
      serial_number, operating_system, status, management_address, bmc_address, cpu_cores,
      memory_gb::text, source, last_verified_at::text, notes FROM asset_nodes
      WHERE id = $1 AND asset_id = $2 AND company_id = $3 FOR UPDATE`,
    [input.assetNodeId, input.assetId, session.companyId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Asset node mismatch");
    await tx.query(`UPDATE asset_nodes SET role = $4, name = $5, hardware_model = $6,
      serial_number = $7, operating_system = $8, status = $9, management_address = $10,
      bmc_address = $11, cpu_cores = $12, memory_gb = $13, source = 'manual',
      last_verified_at = timezone($16::text, NULLIF($14::text, '')::timestamp), notes = $15
      WHERE id = $1 AND asset_id = $2 AND company_id = $3`,
    [input.assetNodeId, input.assetId, session.companyId, input.role, input.name,
      input.hardwareModel || null, input.serialNumber || null, input.operatingSystem || null,
      input.status, input.managementAddress || null, input.bmcAddress || null,
      input.cpuCores ?? null, input.memoryGb ?? null, input.lastVerifiedAt || null,
      input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, {
      action: "asset_node.updated", entityType: "asset_node", entityId: input.assetNodeId,
      summary: `${asset.asset_tag} ${input.name} 노드 수정`, beforeData: current,
      afterData: { assetId: input.assetId, role: input.role, name: input.name,
        hardwareModel: input.hardwareModel, serialNumber: input.serialNumber,
        operatingSystem: input.operatingSystem, status: input.status,
        managementAddress: input.managementAddress, bmcAddress: input.bmcAddress,
        cpuCores: input.cpuCores, memoryGb: input.memoryGb,
        lastVerifiedAt: input.lastVerifiedAt, notes: input.notes },
    });
  });
}

export type AssetNetworkInput = {
  assetId: string; nodeId?: string; label: string; purpose: AssetNetworkRow["purpose"];
  address?: string; peerAddress?: string; macAddress?: string; vlanId?: number; speedMbps?: number;
  switchPort?: string; redundancyGroup?: string; status: AssetNetworkRow["status"];
  lastVerifiedAt?: string; notes?: string;
};
export function createAssetNetwork(session: SessionContext, input: AssetNetworkInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    if (input.nodeId) {
      const node = await tx.query("SELECT id FROM asset_nodes WHERE id = $1 AND asset_id = $2 AND company_id = $3", [input.nodeId, input.assetId, session.companyId]);
      if (!node.rows[0]) throw new Error("Asset network node mismatch");
    }
    await tx.query(`INSERT INTO asset_network_interfaces
      (id, company_id, asset_id, node_id, label, purpose, address, peer_address, mac_address,
       vlan_id, speed_mbps, switch_port, redundancy_group, status, last_verified_at, created_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
              timezone($18::text, NULLIF($15::text, '')::timestamp),$16,$17)`,
    [id, session.companyId, input.assetId, input.nodeId || null, input.label, input.purpose, input.address || null, input.peerAddress || null, input.macAddress || null, input.vlanId ?? null, input.speedMbps ?? null, input.switchPort || null, input.redundancyGroup || null, input.status, input.lastVerifiedAt || null, session.userId, input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, { action: "asset_network.created", entityType: "asset_network_interface", entityId: id, summary: `${asset.asset_tag} ${input.label} 네트워크 등록`, afterData: { assetId: input.assetId, label: input.label, purpose: input.purpose, status: input.status } });
    return id;
  });
}

export type AssetNetworkUpdateInput = AssetNetworkInput & { networkInterfaceId: string };
export function updateAssetNetwork(session: SessionContext, input: AssetNetworkUpdateInput) {
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    const currentResult = await tx.query<AssetNetworkRow>(`SELECT network.id, network.node_id,
      node.name AS node_name, network.label, network.purpose, network.address,
      network.peer_address, network.mac_address, network.vlan_id, network.speed_mbps,
      network.switch_port, network.redundancy_group, network.status, network.source,
      network.last_verified_at::text, network.notes FROM asset_network_interfaces network
      LEFT JOIN asset_nodes node ON node.company_id = network.company_id AND node.id = network.node_id
      WHERE network.id = $1 AND network.asset_id = $2 AND network.company_id = $3 FOR UPDATE OF network`,
    [input.networkInterfaceId, input.assetId, session.companyId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Asset network mismatch");
    if (input.nodeId) {
      const node = await tx.query("SELECT id FROM asset_nodes WHERE id = $1 AND asset_id = $2 AND company_id = $3", [input.nodeId, input.assetId, session.companyId]);
      if (!node.rows[0]) throw new Error("Asset network node mismatch");
    }
    await tx.query(`UPDATE asset_network_interfaces SET node_id = $4, label = $5,
      purpose = $6, address = $7, peer_address = $8, mac_address = $9, vlan_id = $10,
      speed_mbps = $11, switch_port = $12, redundancy_group = $13, status = $14,
      source = 'manual',
      last_verified_at = timezone($17::text, NULLIF($15::text, '')::timestamp), notes = $16
      WHERE id = $1 AND asset_id = $2 AND company_id = $3`,
    [input.networkInterfaceId, input.assetId, session.companyId, input.nodeId || null,
      input.label, input.purpose, input.address || null, input.peerAddress || null,
      input.macAddress || null, input.vlanId ?? null, input.speedMbps ?? null,
      input.switchPort || null, input.redundancyGroup || null, input.status,
      input.lastVerifiedAt || null, input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, {
      action: "asset_network.updated", entityType: "asset_network_interface",
      entityId: input.networkInterfaceId, summary: `${asset.asset_tag} ${input.label} 네트워크 수정`,
      beforeData: current, afterData: { assetId: input.assetId, nodeId: input.nodeId,
        label: input.label, purpose: input.purpose, address: input.address,
        peerAddress: input.peerAddress, macAddress: input.macAddress, vlanId: input.vlanId,
        speedMbps: input.speedMbps, switchPort: input.switchPort,
        redundancyGroup: input.redundancyGroup, status: input.status,
        lastVerifiedAt: input.lastVerifiedAt, notes: input.notes },
    });
  });
}

export type AssetVmInput = {
  assetId: string; name: string; businessRole?: string; operatingSystem?: string;
  protectionMode: AssetVmRow["protection_mode"]; status: AssetVmRow["status"];
  vcpu?: number; memoryGb?: number; storageGb?: number; ipAddresses?: string;
  preferredNode?: string; lastVerifiedAt?: string; notes?: string;
};
export function createAssetVirtualMachine(session: SessionContext, input: AssetVmInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    if (asset.product_family === "everrun" && input.protectionMode === "ft" && (input.vcpu ?? 0) > 8) {
      throw new Error("everRun FT VM은 현재 운영 정책상 vCPU 8개를 초과할 수 없습니다");
    }
    if (input.preferredNode) {
      const node = await tx.query(
        "SELECT id FROM asset_nodes WHERE id = $1 AND asset_id = $2 AND company_id = $3",
        [input.preferredNode, input.assetId, session.companyId],
      );
      if (!node.rows[0]) throw new Error("Preferred VM node mismatch");
    }
    await tx.query(`INSERT INTO asset_virtual_machines
      (id, company_id, asset_id, name, business_role, operating_system, protection_mode,
       status, vcpu, memory_gb, storage_gb, ip_addresses, preferred_node,
       last_verified_at, created_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
              timezone($17::text, NULLIF($14::text, '')::timestamp),$15,$16)`,
    [id, session.companyId, input.assetId, input.name, input.businessRole || null, input.operatingSystem || null, input.protectionMode, input.status, input.vcpu ?? null, input.memoryGb ?? null, input.storageGb ?? null, input.ipAddresses || null, input.preferredNode || null, input.lastVerifiedAt || null, session.userId, input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, { action: "asset_vm.created", entityType: "asset_virtual_machine", entityId: id, summary: `${asset.asset_tag} ${input.name} VM 등록`, afterData: { assetId: input.assetId, name: input.name, protectionMode: input.protectionMode, vcpu: input.vcpu } });
    return id;
  });
}

export type AssetVmUpdateInput = AssetVmInput & { virtualMachineId: string };
export function updateAssetVirtualMachine(session: SessionContext, input: AssetVmUpdateInput) {
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    const currentResult = await tx.query<AssetVmRow>(`SELECT id, name, business_role,
      operating_system, protection_mode, status, vcpu, memory_gb::text, storage_gb::text,
      ip_addresses, preferred_node, source, last_verified_at::text, notes
      FROM asset_virtual_machines
      WHERE id = $1 AND asset_id = $2 AND company_id = $3 FOR UPDATE`,
    [input.virtualMachineId, input.assetId, session.companyId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Asset virtual machine mismatch");
    if (asset.product_family === "everrun" && input.protectionMode === "ft" && (input.vcpu ?? 0) > 8) {
      throw new Error("everRun FT VM은 현재 운영 정책상 vCPU 8개를 초과할 수 없습니다");
    }
    if (input.preferredNode) {
      const node = await tx.query(
        "SELECT id FROM asset_nodes WHERE id = $1 AND asset_id = $2 AND company_id = $3",
        [input.preferredNode, input.assetId, session.companyId],
      );
      if (!node.rows[0]) throw new Error("Preferred VM node mismatch");
    }
    await tx.query(`UPDATE asset_virtual_machines SET name = $4, business_role = $5,
      operating_system = $6, protection_mode = $7, status = $8, vcpu = $9,
      memory_gb = $10, storage_gb = $11, ip_addresses = $12, preferred_node = $13,
      source = 'manual',
      last_verified_at = timezone($16::text, NULLIF($14::text, '')::timestamp), notes = $15
      WHERE id = $1 AND asset_id = $2 AND company_id = $3`,
    [input.virtualMachineId, input.assetId, session.companyId, input.name,
      input.businessRole || null, input.operatingSystem || null, input.protectionMode,
      input.status, input.vcpu ?? null, input.memoryGb ?? null, input.storageGb ?? null,
      input.ipAddresses || null, input.preferredNode || null, input.lastVerifiedAt || null,
      input.notes || null, session.companyTimezone]);
    await auditAssetChild(tx, session, {
      action: "asset_vm.updated", entityType: "asset_virtual_machine",
      entityId: input.virtualMachineId, summary: `${asset.asset_tag} ${input.name} VM 수정`,
      beforeData: current, afterData: { assetId: input.assetId, name: input.name,
        businessRole: input.businessRole, operatingSystem: input.operatingSystem,
        protectionMode: input.protectionMode, status: input.status, vcpu: input.vcpu,
        memoryGb: input.memoryGb, storageGb: input.storageGb,
        ipAddresses: input.ipAddresses, preferredNode: input.preferredNode,
        lastVerifiedAt: input.lastVerifiedAt, notes: input.notes },
    });
  });
}

export type AssetContractInput = {
  assetId: string; scope: AssetContractRow["scope"]; status: ContractStatus; contractNumber?: string;
  providerName: string; recipientName?: string; intermediaryName?: string; supportLevel?: string;
  serviceMethod: "remote" | "visit" | "hybrid"; startsOn?: string; endsOn?: string;
  coverageSummary?: string; exclusions?: string; renewalOwnerId?: string; notes?: string;
};
export function createAssetSupportContract(session: SessionContext, input: AssetContractInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    if (input.renewalOwnerId) {
      const owner = await tx.query("SELECT user_id FROM company_members WHERE user_id = $1 AND is_active = true", [input.renewalOwnerId]);
      if (!owner.rows[0]) throw new Error("Renewal owner is not an active company member");
    }
    await tx.query("UPDATE asset_support_contracts SET is_current = false WHERE asset_id = $1 AND scope = $2 AND is_current = true", [input.assetId, input.scope]);
    await tx.query(`INSERT INTO asset_support_contracts
      (id, company_id, asset_id, scope, status, contract_number, provider_name, recipient_name,
       intermediary_name, support_level, service_method, starts_on, ends_on, coverage_summary,
       exclusions, renewal_owner_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, session.companyId, input.assetId, input.scope, input.status, input.contractNumber || null, input.providerName, input.recipientName || null, input.intermediaryName || null, input.supportLevel || null, input.serviceMethod, input.startsOn || null, input.endsOn || null, input.coverageSummary || null, input.exclusions || null, input.renewalOwnerId || null, input.notes || null, session.userId]);
    if (input.scope === "customer_support") {
      await tx.query(`UPDATE assets SET contract_status = $2, contract_number = $3,
        channel_partner = $4, support_provider = $5, support_level = $6,
        service_method = $7, support_started_at = $8, support_until = $9
        WHERE id = $1`, [input.assetId, input.status, input.contractNumber || null, input.intermediaryName || null, input.providerName, input.supportLevel || null, input.serviceMethod, input.startsOn || null, input.endsOn || null]);
    }
    await auditAssetChild(tx, session, { action: "asset_contract.revised", entityType: "asset_support_contract", entityId: id, summary: `${asset.asset_tag} ${input.scope === "customer_support" ? "고객" : "벤더"} 지원 계약 개정`, afterData: { assetId: input.assetId, scope: input.scope, status: input.status, contractNumber: input.contractNumber, endsOn: input.endsOn } });
    return id;
  });
}

export type AssetLicenseInput = {
  assetId: string; productName: string; licenseType: AssetLicenseRow["license_type"];
  entitlementReference?: string; licenseKeyHint?: string; version?: string; quantity: number;
  status: AssetLicenseRow["status"]; issuedOn?: string; expiresOn?: string;
  supportContractId?: string; notes?: string;
};
function assertAssetLicensePeriod(input: AssetLicenseInput) {
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
    throw new Error("라이선스 만료일은 발급일보다 빠를 수 없습니다");
  }
  if (input.licenseType !== "perpetual" && input.status === "active" && !input.expiresOn) {
    throw new Error("기간형 활성 라이선스의 만료일이 필요합니다");
  }
}
export function createAssetLicense(session: SessionContext, input: AssetLicenseInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    assertAssetLicensePeriod(input);
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    await tx.query(`INSERT INTO asset_licenses
      (id, company_id, asset_id, product_name, license_type, entitlement_reference,
       license_key_hint, version, quantity, status, issued_on, expires_on,
       support_contract_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, session.companyId, input.assetId, input.productName, input.licenseType, input.entitlementReference || null, input.licenseKeyHint || null, input.version || null, input.quantity, input.status, input.issuedOn || null, input.expiresOn || null, input.supportContractId || null, input.notes || null, session.userId]);
    await auditAssetChild(tx, session, { action: "asset_license.created", entityType: "asset_license", entityId: id, summary: `${asset.asset_tag} ${input.productName} 라이선스 등록`, afterData: { assetId: input.assetId, productName: input.productName, licenseType: input.licenseType, quantity: input.quantity, expiresOn: input.expiresOn, supportContractId: input.supportContractId } });
    return id;
  });
}

export type AssetLicenseUpdateInput = AssetLicenseInput & { licenseId: string };
export function updateAssetLicense(session: SessionContext, input: AssetLicenseUpdateInput) {
  return withCompany(session.companyId, async (tx) => {
    assertAssetLicensePeriod(input);
    const asset = await operationalAsset(tx, session.companyId, input.assetId);
    const currentResult = await tx.query<AssetLicenseRow>(`SELECT id, product_name,
      license_type, entitlement_reference, license_key_hint, version, quantity, status,
      issued_on::text, expires_on::text, support_contract_id::text, notes FROM asset_licenses
      WHERE id = $1 AND asset_id = $2 AND company_id = $3 FOR UPDATE`,
    [input.licenseId, input.assetId, session.companyId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Asset license mismatch");
    await tx.query(`UPDATE asset_licenses SET product_name = $4, license_type = $5,
      entitlement_reference = $6, license_key_hint = $7, version = $8, quantity = $9,
      status = $10, issued_on = $11, expires_on = $12, support_contract_id = $13,
      notes = $14
      WHERE id = $1 AND asset_id = $2 AND company_id = $3`,
    [input.licenseId, input.assetId, session.companyId, input.productName,
      input.licenseType, input.entitlementReference || null, input.licenseKeyHint || null,
      input.version || null, input.quantity, input.status, input.issuedOn || null,
      input.expiresOn || null, input.supportContractId || null, input.notes || null]);
    await auditAssetChild(tx, session, {
      action: "asset_license.updated", entityType: "asset_license", entityId: input.licenseId,
      summary: `${asset.asset_tag} ${input.productName} 라이선스 수정`, beforeData: current,
      afterData: { assetId: input.assetId, productName: input.productName,
        licenseType: input.licenseType, entitlementReference: input.entitlementReference,
        licenseKeyHint: input.licenseKeyHint, version: input.version, quantity: input.quantity,
        status: input.status, issuedOn: input.issuedOn, expiresOn: input.expiresOn,
        supportContractId: input.supportContractId, notes: input.notes },
    });
  });
}

export type AssetProfileInput = {
  assetId: string; status: AssetRow["status"]; businessSystem?: string;
  environment: AssetRow["environment"]; hardwareVendor?: string; rackLocation?: string;
  hypervisor?: string; assignedEngineerId?: string; configurationSource: AssetRow["configuration_source"];
  configurationCheckedAt?: string;
};
export function updateAssetOperationsProfile(session: SessionContext, input: AssetProfileInput) {
  return withCompany(session.companyId, async (tx) => {
    const currentResult = await tx.query<{ asset_tag: string; status: AssetRow["status"] }>("SELECT asset_tag, status FROM assets WHERE id = $1 FOR UPDATE", [input.assetId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Asset not found");
    if (input.assignedEngineerId) {
      const member = await tx.query("SELECT user_id FROM company_members WHERE user_id = $1 AND is_active = true", [input.assignedEngineerId]);
      if (!member.rows[0]) throw new Error("Assigned engineer is not an active company member");
    }
    if (input.status === "retired" && current.status !== "retired") {
      const blockers = await tx.query<{ active_cases: string; active_inspections: string }>(`SELECT
        (SELECT COUNT(*)::text FROM service_cases WHERE asset_id = $1 AND status IN ('open','in_progress','waiting')) AS active_cases,
        (SELECT COUNT(*)::text FROM maintenance_inspections WHERE asset_id = $1 AND status IN ('scheduled','in_progress','issue_found')) AS active_inspections`, [input.assetId]);
      if (Number(blockers.rows[0]?.active_cases ?? 0) > 0 || Number(blockers.rows[0]?.active_inspections ?? 0) > 0) {
        throw new Error("진행 중인 케이스나 점검이 있는 자산은 퇴역할 수 없습니다");
      }
    }
    await tx.query(`UPDATE assets SET status = $2, business_system = $3, environment = $4,
      hardware_vendor = $5, rack_location = $6, hypervisor = $7, assigned_engineer_id = $8,
      configuration_source = $9,
      configuration_checked_at = timezone($11::text, NULLIF($10::text, '')::timestamp)
      WHERE id = $1`, [input.assetId, input.status, input.businessSystem || null, input.environment, input.hardwareVendor || null, input.rackLocation || null, input.hypervisor || null, input.assignedEngineerId || null, input.configurationSource, input.configurationCheckedAt || null, session.companyTimezone]);
    await writeAudit(tx, { companyId: session.companyId, actorUserId: session.userId, action: "asset.operations_profile_updated", entityType: "asset", entityId: input.assetId, summary: `${current.asset_tag} 운영 프로필 변경`, beforeData: { status: current.status }, afterData: { status: input.status, environment: input.environment, businessSystem: input.businessSystem, assignedEngineerId: input.assignedEngineerId } });
  });
}
