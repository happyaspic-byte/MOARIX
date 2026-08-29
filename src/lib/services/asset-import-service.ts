import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionContext } from "../auth/repository";
import { withCompany } from "../db/client";
import { writeAudit } from "./audit";
import { serializeCsv, type CsvColumnDef } from "../csv/csv-engine";

export const ASSET_HEADER_ALIASES: Record<string, string[]> = {
  assetTag: ["asset_tag", "자산태그", "자산번호", "관리번호", "Asset Tag"],
  vendorAssetId: ["vendor_asset_id", "stratus_asset_id", "stratus_id", "벤더자산ID", "Stratus Asset ID"],
  productName: ["product_name", "제품명", "모델명", "Product Name"],
  productFamily: ["product_family", "제품군", "패밀리", "Product Family"],
  productModel: ["product_model", "상세모델", "Model"],
  softwareVersion: ["software_version", "소프트웨어버전", "SW버전", "Version"],
  protectionMode: ["protection_mode", "보호모드", "이중화방식", "Protection Mode"],
  operatingSystem: ["operating_system", "운영체제", "OS"],
  managementIp: ["management_ip", "관리IP", "IP주소", "Management IP"],
  serialNumber: ["serial_number", "시리얼", "일련번호", "S/N", "Serial"],
  status: ["status", "상태", "운영상태", "Status"],
  customerCode: ["customer_code", "고객사코드", "거래처코드", "Customer Code"],
  siteCode: ["site_code", "사업장코드", "설치사업장", "Site Code"],
  businessSystem: ["business_system", "업무시스템", "용도", "System"],
  environment: ["environment", "운영환경", "환경", "Env"],
  hardwareVendor: ["hardware_vendor", "하드웨어제조사", "HW제조사"],
  rackLocation: ["rack_location", "랙위치", "설치위치", "Rack"],
  serviceMethod: ["service_method", "지원방식", "서비스방식"],
  installedAt: ["installed_at", "설치일", "도입일", "Installed Date"],
  warrantyUntil: ["warranty_until", "보증만료일", "워런티종료일", "Warranty Until"],
  supportUntil: ["support_until", "지원만료일", "계약만료일", "Support Until"],
  notes: ["notes", "비고", "메모", "Notes"],
};

export const CONTRACT_HEADER_ALIASES: Record<string, string[]> = {
  assetTag: ["asset_tag", "자산태그", "자산번호", "Asset Tag"],
  vendorAssetId: ["vendor_asset_id", "벤더자산ID", "Stratus ID"],
  scope: ["scope", "계약구분", "계약종류", "Scope"],
  status: ["status", "계약상태", "Status"],
  contractNumber: ["contract_number", "계약번호", "Contract Number"],
  providerName: ["provider_name", "공급자", "지원사", "Provider"],
  recipientName: ["recipient_name", "고객사명", "수급자", "Recipient"],
  intermediaryName: ["intermediary_name", "채널사", "파트너", "Intermediary"],
  supportLevel: ["support_level", "지원등급", "SLA레벨", "Support Level"],
  serviceMethod: ["service_method", "지원방식", "Service Method"],
  startsOn: ["starts_on", "시작일", "계약시작일", "Start Date"],
  endsOn: ["ends_on", "종료일", "계약종료일", "만료일", "End Date"],
  coverageSummary: ["coverage_summary", "지원범위", "보장내용"],
  exclusions: ["exclusions", "제외사항", "특약"],
  notes: ["notes", "비고", "메모"],
};

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const assetImportRowSchema = z.object({
  assetTag: z.string().trim().min(1, "자산 태그는 필수입니다.").max(50),
  vendorAssetId: z.string().trim().max(50).optional().or(z.literal("")),
  productName: z.string().trim().max(160).optional().or(z.literal("")),
  productFamily: z.enum(["everrun", "ztc_endurance", "ztc_edge", "ftserver", "other"], {
    message: "제품군은 everrun, ztc_endurance, ztc_edge, ftserver, other 중 하나여야 합니다.",
  }),
  productModel: z.string().trim().max(100).optional().or(z.literal("")),
  softwareVersion: z.string().trim().max(50).optional().or(z.literal("")),
  protectionMode: z.enum(["ha", "ft", "mixed", "none", "other"], {
    message: "보호 모드는 ha, ft, mixed, none, other 중 하나여야 합니다.",
  }),
  operatingSystem: z.string().trim().max(100).optional().or(z.literal("")),
  managementIp: z.string().trim().max(100).optional().or(z.literal("")),
  serialNumber: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "maintenance", "retired"]).default("active"),
  customerCode: z.string().trim().max(50).optional().or(z.literal("")),
  siteCode: z.string().trim().max(50).optional().or(z.literal("")),
  businessSystem: z.string().trim().max(120).optional().or(z.literal("")),
  environment: z.enum(["production", "staging", "test", "development", "other"]).default("production"),
  hardwareVendor: z.string().trim().max(100).optional().or(z.literal("")),
  rackLocation: z.string().trim().max(100).optional().or(z.literal("")),
  serviceMethod: z.enum(["remote", "visit", "hybrid"]).default("hybrid"),
  installedAt: z.string().trim().regex(dateRegex, "날짜 형식은 YYYY-MM-DD여야 합니다.").optional().or(z.literal("")),
  warrantyUntil: z.string().trim().regex(dateRegex, "날짜 형식은 YYYY-MM-DD여야 합니다.").optional().or(z.literal("")),
  supportUntil: z.string().trim().regex(dateRegex, "날짜 형식은 YYYY-MM-DD여야 합니다.").optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ValidatedAssetImportRow = z.infer<typeof assetImportRowSchema>;

const contractImportRowSchema = z
  .object({
    assetTag: z.string().trim().min(1, "대상 자산 태그는 필수입니다.").max(50),
    vendorAssetId: z.string().trim().max(50).optional().or(z.literal("")),
    scope: z.enum(["customer_support", "partner_support", "vendor_support"], {
      message: "계약 구분은 customer_support, partner_support, vendor_support 중 하나여야 합니다.",
    }),
    status: z.enum(["active", "pending_renewal", "not_contracted", "expired"]).default("active"),
    contractNumber: z.string().trim().max(100).optional().or(z.literal("")),
    providerName: z.string().trim().min(1, "지원 공급자 이름은 필수입니다.").max(120),
    recipientName: z.string().trim().max(120).optional().or(z.literal("")),
    intermediaryName: z.string().trim().max(120).optional().or(z.literal("")),
    supportLevel: z.string().trim().max(80).optional().or(z.literal("")),
    serviceMethod: z.enum(["remote", "visit", "hybrid"]).default("hybrid"),
    startsOn: z.string().trim().regex(dateRegex, "시작일은 YYYY-MM-DD 형식이어야 합니다."),
    endsOn: z.string().trim().regex(dateRegex, "종료일은 YYYY-MM-DD 형식이어야 합니다."),
    coverageSummary: z.string().trim().max(1000).optional().or(z.literal("")),
    exclusions: z.string().trim().max(1000).optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: "계약 종료일은 시작일보다 빠를 수 없습니다.",
    path: ["endsOn"],
  });

export type ValidatedContractImportRow = z.infer<typeof contractImportRowSchema>;

export interface RowValidationError {
  lineNumber: number;
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  lineNumber: number;
  data?: T;
  errors: RowValidationError[];
}

export function validateAssetImportRow(
  raw: Record<string, unknown>,
  lineNumber: number
): ValidationResult<ValidatedAssetImportRow> {
  const payload: Record<string, unknown> = {
    ...raw,
    productName: raw.productName || (raw.productFamily ? `Stratus ${String(raw.productFamily).toUpperCase()}` : ""),
    protectionMode: raw.protectionMode || (raw.productFamily === "ftserver" ? "ft" : "ha"),
    status: raw.status || "active",
    environment: raw.environment || "production",
    serviceMethod: raw.serviceMethod || "hybrid",
  };

  const parsed = assetImportRowSchema.safeParse(payload);
  if (parsed.success) {
    return { isValid: true, lineNumber, data: parsed.data, errors: [] };
  }

  const errors: RowValidationError[] = parsed.error.issues.map((issue) => ({
    lineNumber,
    field: String(issue.path[0] || "general"),
    message: issue.message,
  }));

  return { isValid: false, lineNumber, errors };
}

export function validateContractImportRow(
  raw: Record<string, unknown>,
  lineNumber: number
): ValidationResult<ValidatedContractImportRow> {
  const payload = {
    ...raw,
    status: raw.status || "active",
    serviceMethod: raw.serviceMethod || "hybrid",
  };

  const parsed = contractImportRowSchema.safeParse(payload);
  if (parsed.success) {
    return { isValid: true, lineNumber, data: parsed.data, errors: [] };
  }

  const errors: RowValidationError[] = parsed.error.issues.map((issue) => ({
    lineNumber,
    field: String(issue.path[0] || "general"),
    message: issue.message,
  }));

  return { isValid: false, lineNumber, errors };
}

export const ASSET_CSV_TEMPLATE_COLUMNS: CsvColumnDef[] = [
  { key: "assetTag", label: "자산태그" },
  { key: "vendorAssetId", label: "Stratus Asset ID" },
  { key: "productName", label: "제품명" },
  { key: "productFamily", label: "제품군 (everrun/ztc_endurance/ztc_edge/ftserver)" },
  { key: "productModel", label: "모델명" },
  { key: "softwareVersion", label: "SW버전" },
  { key: "protectionMode", label: "보호모드 (ha/ft/mixed/none)" },
  { key: "customerCode", label: "고객사코드" },
  { key: "siteCode", label: "사업장코드" },
  { key: "managementIp", label: "관리IP" },
  { key: "serialNumber", label: "시리얼번호" },
  { key: "status", label: "상태 (active/maintenance/retired)" },
  { key: "businessSystem", label: "업무시스템" },
  { key: "environment", label: "환경 (production/staging/test/development)" },
  { key: "installedAt", label: "설치일 (YYYY-MM-DD)" },
  { key: "warrantyUntil", label: "보증만료일 (YYYY-MM-DD)" },
  { key: "supportUntil", label: "지원만료일 (YYYY-MM-DD)" },
  { key: "notes", label: "비고" },
];

export function getAssetCsvTemplate(): string {
  const sampleRows = [
    {
      assetTag: "AST-STRATUS-001",
      vendorAssetId: "ASN-98213",
      productName: "Stratus ftServer 2910",
      productFamily: "ftserver",
      productModel: "ftServer 2910 System",
      softwareVersion: "v9.2.1",
      protectionMode: "ft",
      customerCode: "CUST-001",
      siteCode: "SITE-PANGYO",
      managementIp: "192.0.2.50",
      serialNumber: "SN-FT-2024-001",
      status: "active",
      businessSystem: "생산제어 MES",
      environment: "production",
      installedAt: "2024-01-15",
      warrantyUntil: "2027-01-14",
      supportUntil: "2027-01-14",
      notes: "판교 제1공장 메인 컨트롤러",
    },
    {
      assetTag: "AST-ZTC-002",
      vendorAssetId: "ASN-98214",
      productName: "Stratus ztC Edge 250i",
      productFamily: "ztc_edge",
      productModel: "ztC 250i",
      softwareVersion: "v2.3.0",
      protectionMode: "ha",
      customerCode: "CUST-001",
      siteCode: "SITE-PANGYO",
      managementIp: "192.0.2.60",
      serialNumber: "SN-ZTC-2024-002",
      status: "active",
      businessSystem: "환경센서 모니터링",
      environment: "production",
      installedAt: "2024-03-01",
      warrantyUntil: "2026-02-28",
      supportUntil: "2026-02-28",
      notes: "모니터링 수집 게이트웨이",
    },
  ];
  return serializeCsv(ASSET_CSV_TEMPLATE_COLUMNS, sampleRows);
}

export const CONTRACT_CSV_TEMPLATE_COLUMNS: CsvColumnDef[] = [
  { key: "assetTag", label: "자산태그" },
  { key: "scope", label: "계약구분 (customer_support / partner_support / vendor_support)" },
  { key: "contractNumber", label: "계약번호" },
  { key: "providerName", label: "지원공급자명" },
  { key: "recipientName", label: "수급고객사명" },
  { key: "intermediaryName", label: "채널/파트너사명" },
  { key: "supportLevel", label: "지원등급 (예: 24x7 4Hr / 8x5 NBD)" },
  { key: "serviceMethod", label: "지원방식 (remote / visit / hybrid)" },
  { key: "startsOn", label: "시작일 (YYYY-MM-DD)" },
  { key: "endsOn", label: "종료일 (YYYY-MM-DD)" },
  { key: "coverageSummary", label: "지원범위" },
  { key: "exclusions", label: "제외사항" },
  { key: "notes", label: "비고" },
];

export function getContractCsvTemplate(): string {
  const sampleRows = [
    {
      assetTag: "AST-STRATUS-001",
      scope: "customer_support",
      contractNumber: "CTR-2026-001",
      providerName: "모아릭스(주)",
      recipientName: "한국제조(주)",
      intermediaryName: "",
      supportLevel: "24x7 4Hr 방문 및 원격 지원",
      serviceMethod: "hybrid",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      coverageSummary: "하드웨어 부품 교체, OS 장애 복구, 분기 정기점검 4회",
      exclusions: "고객 귀책 소프트웨어 버그",
      notes: "2026년도 유지보수 갱신 계약",
    },
    {
      assetTag: "AST-STRATUS-001",
      scope: "vendor_support",
      contractNumber: "V-STRATUS-2026-99",
      providerName: "Stratus Technologies",
      recipientName: "모아릭스(주)",
      intermediaryName: "",
      supportLevel: "Total Assurance 24x7",
      serviceMethod: "remote",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      coverageSummary: "Stratus 하드웨어 RMA 및 벤더 엔지니어링 티어3 지원",
      exclusions: "",
      notes: "Stratus 벤더 백계약",
    },
  ];
  return serializeCsv(CONTRACT_CSV_TEMPLATE_COLUMNS, sampleRows);
}

export interface BulkImportAssetItem extends ValidatedAssetImportRow {
  lineNumber: number;
}

export interface BulkImportContractItem extends ValidatedContractImportRow {
  lineNumber: number;
}

export interface BulkImportSummary {
  totalCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: RowValidationError[];
}

/**
 * Executes multi-row Asset Import inside a company transaction:
 * - Resolves customer & site by code or defaults to primary active customer
 * - Checks existing asset by asset_tag or vendor_asset_id
 * - Updates existing asset if found; Inserts new asset if not
 * - Writes audit log
 */
export async function bulkImportAssets(
  session: SessionContext,
  items: BulkImportAssetItem[]
): Promise<BulkImportSummary> {
  return withCompany(session.companyId, async (tx) => {
    // 1. Fetch available customers & sites for mapping
    const customers = await tx.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM counterparties WHERE company_id = $1 AND kind IN ('customer', 'both') AND is_active = true`,
      [session.companyId]
    );
    const sites = await tx.query<{ id: string; counterparty_id: string; code: string; name: string }>(
      `SELECT id, counterparty_id, code, name FROM customer_sites WHERE company_id = $1 AND is_active = true`,
      [session.companyId]
    );

    const defaultCustomer = customers.rows[0];
    if (!defaultCustomer) {
      throw new Error("등록된 활성 고객사가 없습니다. 거래처를 먼저 등록하세요.");
    }

    const defaultSiteForCustomer = (customerId: string) => {
      return sites.rows.find((s) => s.counterparty_id === customerId);
    };

    let inserted = 0;
    let updated = 0;
    const errors: RowValidationError[] = [];

    for (const item of items) {
      // Find customer
      let targetCustomerId = defaultCustomer.id;
      if (item.customerCode) {
        const found = customers.rows.find(
          (c) =>
            c.code.toUpperCase() === item.customerCode?.toUpperCase() ||
            c.name.includes(item.customerCode!)
        );
        if (found) {
          targetCustomerId = found.id;
        } else {
          errors.push({
            lineNumber: item.lineNumber,
            field: "customerCode",
            message: `고객사 '${item.customerCode}'를 찾을 수 없습니다. 기본 고객사로 할당합니다.`,
          });
        }
      }

      // Find site
      let targetSiteId: string | null = null;
      if (item.siteCode) {
        const found = sites.rows.find(
          (s) =>
            s.counterparty_id === targetCustomerId &&
            (s.code.toUpperCase() === item.siteCode?.toUpperCase() ||
              s.name.includes(item.siteCode!))
        );
        if (found) {
          targetSiteId = found.id;
        }
      }
      if (!targetSiteId) {
        const defaultSite = defaultSiteForCustomer(targetCustomerId);
        targetSiteId = defaultSite ? defaultSite.id : null;
      }

      // Check existing asset
      const existing = await tx.query<{ id: string; asset_tag: string }>(
        `SELECT id, asset_tag FROM assets
         WHERE company_id = $1 AND (asset_tag = $2 OR (vendor_asset_id IS NOT NULL AND vendor_asset_id = $3))
         LIMIT 1`,
        [session.companyId, item.assetTag, item.vendorAssetId || ""]
      );

      if (existing.rows[0]) {
        // UPDATE
        const assetId = existing.rows[0].id;
        await tx.query(
          `UPDATE assets SET
            counterparty_id = $3,
            site_id = COALESCE($4, site_id),
            vendor_asset_id = COALESCE($5, vendor_asset_id),
            product_name = COALESCE($6, product_name),
            product_family = $7,
            product_model = COALESCE($8, product_model),
            software_version = COALESCE($9, software_version),
            protection_mode = $10,
            operating_system = COALESCE($11, operating_system),
            management_ip = COALESCE($12, management_ip),
            serial_number = COALESCE($13, serial_number),
            status = $14,
            business_system = COALESCE($15, business_system),
            environment = $16,
            hardware_vendor = COALESCE($17, hardware_vendor),
            rack_location = COALESCE($18, rack_location),
            service_method = $19,
            installed_at = COALESCE(NULLIF($20, '')::date, installed_at),
            warranty_until = COALESCE(NULLIF($21, '')::date, warranty_until),
            support_until = COALESCE(NULLIF($22, '')::date, support_until),
            notes = COALESCE($23, notes),
            configuration_source = 'import',
            configuration_checked_at = timezone($24::text, now())
           WHERE id = $1 AND company_id = $2`,
          [
            assetId,
            session.companyId,
            targetCustomerId,
            targetSiteId,
            item.vendorAssetId || null,
            item.productName || null,
            item.productFamily,
            item.productModel || null,
            item.softwareVersion || null,
            item.protectionMode,
            item.operatingSystem || null,
            item.managementIp || null,
            item.serialNumber || null,
            item.status,
            item.businessSystem || null,
            item.environment,
            item.hardwareVendor || null,
            item.rackLocation || null,
            item.serviceMethod,
            item.installedAt || "",
            item.warrantyUntil || "",
            item.supportUntil || "",
            item.notes || null,
            session.companyTimezone,
          ]
        );
        updated++;
      } else {
        // INSERT
        const assetId = randomUUID();
        await tx.query(
          `INSERT INTO assets
            (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
             product_name, product_family, product_model, software_version, protection_mode,
             operating_system, management_ip, serial_number, status, business_system,
             environment, hardware_vendor, rack_location, service_method,
             installed_at, warranty_until, support_until, notes,
             configuration_source, configuration_checked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, $20,
                   NULLIF($21, '')::date, NULLIF($22, '')::date, NULLIF($23, '')::date, $24,
                   'import', timezone($25::text, now()))`,
          [
            assetId,
            session.companyId,
            targetCustomerId,
            targetSiteId,
            item.assetTag,
            item.vendorAssetId || null,
            item.productName || `Stratus ${item.productFamily.toUpperCase()}`,
            item.productFamily,
            item.productModel || null,
            item.softwareVersion || null,
            item.protectionMode,
            item.operatingSystem || null,
            item.managementIp || null,
            item.serialNumber || null,
            item.status,
            item.businessSystem || null,
            item.environment,
            item.hardwareVendor || null,
            item.rackLocation || null,
            item.serviceMethod,
            item.installedAt || "",
            item.warrantyUntil || "",
            item.supportUntil || "",
            item.notes || null,
            session.companyTimezone,
          ]
        );
        inserted++;
      }
    }

    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "assets.bulk_imported",
      entityType: "asset",
      summary: `자산 ${items.length}건 일괄 가져오기 (신규 ${inserted}건, 갱신 ${updated}건)`,
      afterData: { total: items.length, inserted, updated, errorsCount: errors.length },
    });

    return {
      totalCount: items.length,
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: 0,
      errors,
    };
  });
}

/**
 * Executes multi-row Support Contract Import:
 * - Finds target asset by assetTag or vendorAssetId
 * - Creates revision under asset_support_contracts
 * - Updates asset support dates if customer_support
 */
export async function bulkImportContracts(
  session: SessionContext,
  items: BulkImportContractItem[]
): Promise<BulkImportSummary> {
  return withCompany(session.companyId, async (tx) => {
    let inserted = 0;
    const updated = 0;
    const errors: RowValidationError[] = [];

    for (const item of items) {
      const asset = await tx.query<{ id: string; asset_tag: string }>(
        `SELECT id, asset_tag FROM assets WHERE company_id = $1 AND (asset_tag = $2 OR (vendor_asset_id IS NOT NULL AND vendor_asset_id = $3)) LIMIT 1`,
        [session.companyId, item.assetTag, item.vendorAssetId || ""]
      );

      if (!asset.rows[0]) {
        errors.push({
          lineNumber: item.lineNumber,
          field: "assetTag",
          message: `자산 태그 '${item.assetTag}'에 해당하는 자산을 찾을 수 없어 건너뜁니다.`,
        });
        continue;
      }

      const assetId = asset.rows[0].id;
      const contractId = randomUUID();

      const revisionResult = await tx.query<{ revision_number: number }>(
        `SELECT revision_number FROM asset_support_contracts
         WHERE company_id = $1 AND asset_id = $2 AND scope = $3
         ORDER BY revision_number DESC LIMIT 1`,
        [session.companyId, assetId, item.scope],
      );
      const revisionNumber = (revisionResult.rows[0]?.revision_number ?? 0) + 1;
      await tx.query(
        `UPDATE asset_support_contracts SET is_current = false WHERE company_id = $1 AND asset_id = $2 AND scope = $3 AND is_current = true`,
        [session.companyId, assetId, item.scope]
      );

      await tx.query(
        `INSERT INTO asset_support_contracts
          (id, company_id, asset_id, scope, status, contract_number, provider_name, recipient_name,
           intermediary_name, support_level, service_method, starts_on, ends_on,
           coverage_summary, exclusions, notes, created_by, is_current, revision_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 NULLIF($12, '')::date, NULLIF($13, '')::date, $14, $15, $16, $17, true, $18)`,
        [
          contractId,
          session.companyId,
          assetId,
          item.scope,
          item.status,
          item.contractNumber || null,
          item.providerName,
          item.recipientName || null,
          item.intermediaryName || null,
          item.supportLevel || null,
          item.serviceMethod,
          item.startsOn,
          item.endsOn,
          item.coverageSummary || null,
          item.exclusions || null,
          item.notes || null,
          session.userId,
          revisionNumber,
        ]
      );

      if (item.scope === "customer_support") {
        await tx.query(
          `UPDATE assets SET
            contract_status = $2,
            contract_number = $3,
            channel_partner = $4,
            support_provider = $5,
            support_level = $6,
            service_method = $7,
            support_started_at = NULLIF($8, '')::date,
            support_until = NULLIF($9, '')::date
           WHERE id = $1`,
          [
            assetId,
            item.status,
            item.contractNumber || null,
            item.intermediaryName || null,
            item.providerName,
            item.supportLevel || null,
            item.serviceMethod,
            item.startsOn,
            item.endsOn,
          ]
        );
      }

      inserted++;
    }

    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "contracts.bulk_imported",
      entityType: "asset_support_contract",
      summary: `지원 계약 ${items.length}건 일괄 가져오기 (${inserted}건 반영)`,
      afterData: { total: items.length, inserted, errorsCount: errors.length },
    });

    return {
      totalCount: items.length,
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: items.length - inserted,
      errors,
    };
  });
}
