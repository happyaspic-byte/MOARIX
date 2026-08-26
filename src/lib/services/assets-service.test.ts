import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import {
  createAssetLicense,
  createAssetNetwork,
  createAssetNode,
  createAssetSupportContract,
  createAssetVirtualMachine,
  getAssetWorkspace,
  updateAssetLicense,
  updateAssetNetwork,
  updateAssetNode,
  updateAssetOperationsProfile,
  updateAssetVirtualMachine,
} from "./assets-service";
import { createInspection, transitionInspection } from "./operations-service";
import { appendServiceCaseActivity, createServiceCase, transitionServiceCase } from "./service-cases";

const companyId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const siteId = randomUUID();
const assetId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 엔지니어",
  email: "asset-test@example.invalid",
  companyName: "Synthetic Asset Test",
  companyTimezone: "Asia/Seoul",
  role: "owner",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-assets-service-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-asset-test', 'Synthetic Asset Test')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, 'not-a-login-password-hash')",
      [userId, session.email, session.userName],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', 'SYN-CUSTOMER', 'Synthetic Customer')`,
      [customerId, companyId],
    );
    await tx.query(
      `INSERT INTO customer_sites (id, company_id, counterparty_id, code, name)
       VALUES ($1, $2, $3, 'SYN-SITE', 'Synthetic Site')`,
      [siteId, companyId, customerId],
    );
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, protection_mode, management_ip)
       VALUES ($1, $2, $3, $4, 'SYN-ASSET-001', 'synthetic-vendor-id',
               'everRun Synthetic Platform', 'everrun', 'ft', '192.0.2.40')`,
      [assetId, companyId, customerId, siteId],
    );
  });
});

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("Stratus asset service on PGlite", () => {
  it("persists topology, contract revisions, licenses, and enforces the everRun FT vCPU limit", async () => {
    const nodeId = await createAssetNode(session, {
      assetId,
      role: "node0",
      name: "SYN-NODE0",
      status: "active",
      managementAddress: "192.0.2.41",
      bmcAddress: "198.51.100.41",
      cpuCores: 16,
      memoryGb: 128,
      lastVerifiedAt: "2026-08-25T09:30",
    });
    const networkId = await createAssetNetwork(session, {
      assetId,
      nodeId,
      label: "SYN-A-LINK-0",
      purpose: "a_link",
      address: "198.51.100.51",
      peerAddress: "198.51.100.52",
      speedMbps: 10000,
      status: "up",
      lastVerifiedAt: "2026-08-25T09:45",
    });

    await expect(createAssetVirtualMachine(session, {
      assetId,
      name: "SYN-FT-OVER-LIMIT",
      protectionMode: "ft",
      status: "running",
      vcpu: 9,
    })).rejects.toThrow("vCPU 8개를 초과");

    const virtualMachineId = await createAssetVirtualMachine(session, {
      assetId,
      name: "SYN-FT-APP",
      businessRole: "합성 업무 시스템",
      protectionMode: "ft",
      status: "running",
      vcpu: 8,
      memoryGb: 32,
      storageGb: 256,
      ipAddresses: "203.0.113.40",
      lastVerifiedAt: "2026-08-25T10:00",
    });

    const firstCustomerContractId = await createAssetSupportContract(session, {
      assetId,
      scope: "customer_support",
      status: "active",
      contractNumber: "SYN-CUSTOMER-SUPPORT-R1",
      providerName: "Synthetic Service Provider",
      recipientName: "Synthetic Customer",
      serviceMethod: "hybrid",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      coverageSummary: "합성 24x7 지원",
      renewalOwnerId: userId,
    });
    const currentCustomerContractId = await createAssetSupportContract(session, {
      assetId,
      scope: "customer_support",
      status: "pending_renewal",
      contractNumber: "SYN-CUSTOMER-SUPPORT-R2",
      providerName: "Synthetic Service Provider",
      recipientName: "Synthetic Customer",
      serviceMethod: "hybrid",
      startsOn: "2026-01-01",
      endsOn: "2026-11-30",
      coverageSummary: "합성 24x7 지원 갱신 검토",
      renewalOwnerId: userId,
    });
    const vendorContractId = await createAssetSupportContract(session, {
      assetId,
      scope: "vendor_support",
      status: "active",
      contractNumber: "SYN-VENDOR-SUPPORT-R1",
      providerName: "Synthetic Vendor",
      recipientName: "Synthetic Service Provider",
      serviceMethod: "remote",
      startsOn: "2026-01-01",
      endsOn: "2027-01-31",
      coverageSummary: "합성 벤더 백라인 지원",
      renewalOwnerId: userId,
    });
    const licenseId = await createAssetLicense(session, {
      assetId,
      productName: "everRun Synthetic License",
      licenseType: "perpetual",
      entitlementReference: "SYN-ENT-TEST",
      licenseKeyHint: "DEMO-END",
      version: "8.0-demo",
      quantity: 1,
      status: "active",
      issuedOn: "2026-01-01",
      supportContractId: vendorContractId,
    });

    await updateAssetNode(session, {
      assetId,
      assetNodeId: nodeId,
      role: "node0",
      name: "SYN-NODE0-CORRECTED",
      hardwareModel: "Synthetic Node Model",
      status: "standby",
      managementAddress: "192.0.2.42",
      bmcAddress: "198.51.100.42",
      cpuCores: 24,
      memoryGb: 192,
      lastVerifiedAt: "2026-08-25T09:30",
      notes: "합성 교정 이력",
    });
    await updateAssetNetwork(session, {
      assetId,
      networkInterfaceId: networkId,
      nodeId,
      label: "SYN-A-LINK-0",
      purpose: "a_link",
      address: "198.51.100.53",
      peerAddress: "198.51.100.54",
      speedMbps: 25000,
      status: "degraded",
      lastVerifiedAt: "2026-08-25T09:45",
      notes: "합성 링크 교정",
    });
    await expect(updateAssetVirtualMachine(session, {
      assetId,
      virtualMachineId,
      name: "SYN-FT-APP",
      businessRole: "합성 업무 시스템",
      protectionMode: "ft",
      status: "degraded",
      vcpu: 9,
      memoryGb: 32,
      storageGb: 256,
      ipAddresses: "203.0.113.40",
    })).rejects.toThrow("vCPU 8개를 초과");
    await updateAssetVirtualMachine(session, {
      assetId,
      virtualMachineId,
      name: "SYN-FT-APP-CORRECTED",
      businessRole: "합성 핵심 업무",
      protectionMode: "ft",
      status: "degraded",
      vcpu: 8,
      memoryGb: 48,
      storageGb: 384,
      ipAddresses: "203.0.113.41",
      preferredNode: nodeId,
      lastVerifiedAt: "2026-08-25T10:00",
    });
    await expect(updateAssetVirtualMachine(session, {
      assetId,
      virtualMachineId,
      name: "SYN-FT-APP-CORRECTED",
      protectionMode: "ft",
      status: "degraded",
      vcpu: 8,
      preferredNode: randomUUID(),
    })).rejects.toThrow("Preferred VM node mismatch");
    await expect(updateAssetLicense(session, {
      assetId,
      licenseId,
      productName: "everRun Synthetic Subscription",
      licenseType: "subscription",
      quantity: 2,
      status: "active",
      issuedOn: "2026-06-01",
      expiresOn: "2026-05-31",
    })).rejects.toThrow("만료일은 발급일보다 빠를 수 없습니다");
    await updateAssetLicense(session, {
      assetId,
      licenseId,
      productName: "everRun Synthetic Subscription",
      licenseType: "subscription",
      entitlementReference: "SYN-ENT-CORRECTED",
      licenseKeyHint: "DEMO-NEW",
      version: "8.1-demo",
      quantity: 2,
      status: "suspended",
      issuedOn: "2026-06-01",
      expiresOn: "2027-05-31",
      supportContractId: vendorContractId,
      notes: "합성 라이선스 교정",
    });

    const workspace = await getAssetWorkspace(companyId, assetId);
    expect(workspace).not.toBeNull();
    expect(workspace?.nodes).toHaveLength(1);
    expect(workspace?.nodes).toMatchObject([{ id: nodeId, name: "SYN-NODE0-CORRECTED", status: "standby", source: "manual", cpu_cores: 24 }]);
    expect(workspace?.networks).toMatchObject([{ id: networkId, node_id: nodeId, purpose: "a_link", status: "degraded", source: "manual", speed_mbps: 25000 }]);
    expect(workspace?.virtualMachines).toMatchObject([{ id: virtualMachineId, name: "SYN-FT-APP-CORRECTED", protection_mode: "ft", status: "degraded", preferred_node: nodeId, preferred_node_name: "SYN-NODE0-CORRECTED", source: "manual", vcpu: 8 }]);
    expect(new Date(workspace!.nodes[0]!.last_verified_at!).toISOString()).toBe("2026-08-25T00:30:00.000Z");
    expect(new Date(workspace!.networks[0]!.last_verified_at!).toISOString()).toBe("2026-08-25T00:45:00.000Z");
    expect(new Date(workspace!.virtualMachines[0]!.last_verified_at!).toISOString()).toBe("2026-08-25T01:00:00.000Z");
    expect(workspace?.licenses).toMatchObject([{ id: licenseId, license_type: "subscription", status: "suspended", quantity: 2, license_key_hint: "DEMO-NEW", support_contract_id: vendorContractId, support_contract_number: "SYN-VENDOR-SUPPORT-R1", support_contract_scope: "vendor_support" }]);
    expect(workspace?.asset).toMatchObject({
      contract_status: "pending_renewal",
      contract_number: "SYN-CUSTOMER-SUPPORT-R2",
      vendor_contract_status: "active",
      vendor_support_until: "2027-01-31",
    });

    const contractById = new Map(workspace?.contracts.map((contract) => [contract.id, contract]));
    expect(contractById.get(firstCustomerContractId)?.is_current).toBe(false);
    expect(contractById.get(currentCustomerContractId)?.is_current).toBe(true);
    expect(contractById.get(vendorContractId)?.is_current).toBe(true);

    await createAssetNode(session, { assetId, role: "host", name: "SYN-HOST-A", status: "active" });
    await createAssetNode(session, { assetId, role: "host", name: "SYN-HOST-B", status: "standby" });
    const node1Id = await createAssetNode(session, { assetId, role: "node1", name: "SYN-NODE1", status: "standby" });
    const node1NetworkId = await createAssetNetwork(session, {
      assetId,
      nodeId: node1Id,
      label: "SYN-A-LINK-0",
      purpose: "a_link",
      status: "up",
    });
    expect(node1NetworkId).toBeTruthy();
    await expect(createAssetNetwork(session, {
      assetId,
      nodeId,
      label: "syn-a-link-0",
      purpose: "a_link",
      status: "up",
    })).rejects.toThrow(/duplicate|unique/i);

    const otherAssetId = randomUUID();
    await withCompany(companyId, async (tx) => tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, product_name,
          product_family, protection_mode)
       VALUES ($1, $2, $3, $4, 'SYN-ASSET-OTHER', 'Synthetic Other Asset',
               'everrun', 'ft')`,
      [otherAssetId, companyId, customerId, siteId],
    ));
    await expect(withCompany(companyId, async (tx) => tx.query(
      `INSERT INTO asset_licenses
         (id, company_id, asset_id, product_name, license_type, support_contract_id, created_by)
       VALUES ($1, $2, $3, 'Synthetic Cross Asset License', 'perpetual', $4, $5)`,
      [randomUUID(), companyId, otherAssetId, currentCustomerContractId, userId],
    ))).rejects.toThrow(/foreign key|violates/i);

    const legacyAssetId = randomUUID();
    await withCompany(companyId, async (tx) => tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, asset_tag, product_name,
          product_family, protection_mode)
       VALUES ($1, $2, $3, 'SYN-LEGACY-NO-SITE', 'Synthetic Legacy Asset',
               'other', 'none')`,
      [legacyAssetId, companyId, customerId],
    ));
    const legacyAssetCase = await createServiceCase(session, {
      counterpartyId: customerId,
      assetId: legacyAssetId,
      caseType: "question",
      title: "합성 기존 무사업장 자산 케이스",
      severity: "low",
    });
    expect(legacyAssetCase.id).toBeTruthy();
    await withCompany(companyId, async (tx) => tx.query(
      "UPDATE service_cases SET updated_at = '2020-01-01T00:00:00Z' WHERE id = $1",
      [legacyAssetCase.id],
    ));
    await appendServiceCaseActivity(session, {
      caseId: legacyAssetCase.id,
      kind: "internal_note",
      body: "합성 최신 활동 정렬 회귀",
    });
    const touchedCase = await withCompany(companyId, async (tx) => tx.query<{ updated_at: string }>(
      "SELECT updated_at::text FROM service_cases WHERE id = $1",
      [legacyAssetCase.id],
    ));
    expect(new Date(touchedCase.rows[0]!.updated_at).getUTCFullYear()).toBeGreaterThan(2020);

    const updateAudits = await withCompany(companyId, async (tx) => tx.query<{
      action: string; before_data: unknown; after_data: unknown;
    }>(`SELECT action, before_data, after_data FROM audit_logs
        WHERE action IN ('asset_node.updated', 'asset_network.updated', 'asset_vm.updated', 'asset_license.updated')
        ORDER BY action`));
    expect(updateAudits.rows).toHaveLength(4);
    for (const audit of updateAudits.rows) {
      expect(audit.before_data).not.toBeNull();
      expect(audit.after_data).not.toBeNull();
    }

    await expect(withCompany(companyId, async (tx) => tx.query(
      "UPDATE asset_support_contracts SET status = 'expired' WHERE id = $1",
      [firstCustomerContractId],
    ))).rejects.toThrow(/Historical support contract revisions are immutable|Support contracts must be changed/);
    await expect(withCompany(companyId, async (tx) => tx.query(
      "DELETE FROM asset_virtual_machines WHERE id = $1",
      [virtualMachineId],
    ))).rejects.toThrow("history cannot be deleted");

    const inspection = await createInspection(session, {
      assetId,
      inspectionType: "quarterly",
      scheduledDate: "2026-10-01",
      reportReference: "SYNTHETIC-CHECK-GUARD",
    });
    await transitionInspection(session, { inspectionId: inspection.id, nextStatus: "in_progress" });
    await transitionInspection(session, {
      inspectionId: inspection.id,
      nextStatus: "completed",
      systemHealth: "healthy",
      protectionStatus: "pass",
      syncStatus: "pass",
      serviceStatus: "pass",
      cpuPercent: 20,
      memoryPercent: 40,
      diskPercent: 60,
      findings: "합성 점검 정상",
    });
    const checkItemId = await withCompany(companyId, async (tx) => {
      const result = await tx.query<{ id: string }>(
        "SELECT id FROM inspection_check_items WHERE inspection_id = $1 ORDER BY position LIMIT 1",
        [inspection.id],
      );
      return result.rows[0]?.id;
    });
    expect(checkItemId).toBeTruthy();
    await expect(withCompany(companyId, async (tx) => tx.query(
      "UPDATE inspection_check_items SET notes = 'forbidden' WHERE id = $1",
      [checkItemId],
    ))).rejects.toThrow("Final inspection checklist cannot be changed");
    await expect(withCompany(companyId, async (tx) => tx.query(
      "DELETE FROM inspection_check_items WHERE id = $1",
      [checkItemId],
    ))).rejects.toThrow("Final inspection checklist cannot be changed");
    await expect(withCompany(companyId, async (tx) => tx.query(
      "UPDATE inspection_check_items SET inspection_id = $2 WHERE id = $1",
      [checkItemId, randomUUID()],
    ))).rejects.toThrow("Inspection checklist identity cannot be changed");

    const issueInspection = await createInspection(session, {
      assetId,
      inspectionType: "incident",
      scheduledDate: "2026-11-01",
    });
    await transitionInspection(session, { inspectionId: issueInspection.id, nextStatus: "in_progress" });
    await transitionInspection(session, {
      inspectionId: issueInspection.id,
      nextStatus: "issue_found",
      systemHealth: "warning",
      protectionStatus: "warning",
      syncStatus: "fail",
      serviceStatus: "pass",
      cpuPercent: 97,
      memoryPercent: 96,
      diskPercent: 80,
      findings: "합성 점검 이슈",
    });
    await transitionInspection(session, {
      inspectionId: issueInspection.id,
      nextStatus: "completed",
      systemHealth: "healthy",
      protectionStatus: "pass",
      syncStatus: "pass",
      serviceStatus: "pass",
      findings: "합성 조치 완료",
      nextInspectionDate: "2027-01-15",
    });
    const clearedMetrics = await withCompany(companyId, async (tx) => tx.query<{
      cpu_percent: string | null;
      cpu_result: string;
    }>(`SELECT inspection.cpu_percent::text,
              check_item.result AS cpu_result
         FROM maintenance_inspections inspection
         JOIN inspection_check_items check_item
           ON check_item.inspection_id = inspection.id AND check_item.item_key = 'cpu'
        WHERE inspection.id = $1`, [issueInspection.id]));
    expect(clearedMetrics.rows[0]).toEqual({ cpu_percent: null, cpu_result: "na" });

    const laterInspection = await createInspection(session, {
      assetId,
      inspectionType: "quarterly",
      scheduledDate: "2026-12-20",
    });
    const earlierInspection = await createInspection(session, {
      assetId,
      inspectionType: "preventive",
      scheduledDate: "2026-12-01",
    });
    const nextInspectionDate = async () => withCompany(companyId, async (tx) => {
      const result = await tx.query<{ next_inspection_date: string | null }>(
        "SELECT next_inspection_date::text FROM assets WHERE id = $1",
        [assetId],
      );
      return result.rows[0]?.next_inspection_date ?? null;
    });
    expect(await nextInspectionDate()).toBe("2026-12-01");
    await transitionInspection(session, { inspectionId: earlierInspection.id, nextStatus: "cancelled" });
    expect(await nextInspectionDate()).toBe("2026-12-20");
    await transitionInspection(session, { inspectionId: laterInspection.id, nextStatus: "cancelled" });
    expect(await nextInspectionDate()).toBe("2027-01-15");

    await updateAssetOperationsProfile(session, {
      assetId,
      status: "active",
      businessSystem: "합성 생산 시스템",
      environment: "production",
      hardwareVendor: "Synthetic Hardware",
      rackLocation: "SYN-RACK-01",
      hypervisor: "Synthetic Hypervisor",
      assignedEngineerId: userId,
      configurationSource: "inspection",
      configurationCheckedAt: "2026-08-25T11:00",
    });
    await updateAssetOperationsProfile(session, { assetId, status: "maintenance" });
    const partiallyUpdated = await getAssetWorkspace(companyId, assetId);
    expect(partiallyUpdated?.asset).toMatchObject({
      status: "maintenance",
      business_system: "합성 생산 시스템",
      environment: "production",
      hardware_vendor: "Synthetic Hardware",
      rack_location: "SYN-RACK-01",
      hypervisor: "Synthetic Hypervisor",
      assigned_engineer_id: userId,
      configuration_source: "inspection",
    });

    const serviceCase = await createServiceCase(session, {
      counterpartyId: customerId,
      assetId,
      caseType: "incident",
      title: "합성 퇴역 경합 회귀 케이스",
      severity: "normal",
    });
    await transitionServiceCase(session, { caseId: serviceCase.id, nextStatus: "in_progress" });
    await transitionServiceCase(session, {
      caseId: serviceCase.id,
      nextStatus: "resolved",
      resolutionSummary: "합성 해결",
    });
    await updateAssetOperationsProfile(session, {
      assetId,
      status: "retired",
      environment: "production",
      configurationSource: "manual",
    });
    await expect(transitionServiceCase(session, {
      caseId: serviceCase.id,
      nextStatus: "in_progress",
    })).rejects.toThrow("퇴역 자산에 연결된 케이스는 다시 활성화할 수 없습니다");
    await expect(updateAssetNode(session, {
      assetId,
      assetNodeId: nodeId,
      role: "node0",
      name: "SYN-NODE0-RETIRED-WRITE",
      status: "offline",
    })).rejects.toThrow("Operational asset not found");
  }, 60_000);
});
