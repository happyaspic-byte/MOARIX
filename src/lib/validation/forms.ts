import { z } from "zod";
import { documentKinds } from "@/lib/services/documents";
import { documentStatuses } from "@/lib/domain/document-state";
import { inspectionStatuses } from "@/lib/domain/inspection-state";
import { serviceCaseStatuses } from "@/lib/domain/service-case-state";
import { drivingLogStatuses } from "@/lib/domain/driving-log-state";
import { roles } from "@/lib/security/permissions";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalUuid = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.uuid().optional(),
);
const optionalHttpsUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "HTTPS 주소를 입력하세요.").optional().or(z.literal(""));
const decimalText = z.string().trim().regex(/^-?\d+(\.\d{1,4})?$/, "숫자는 소수점 넷째 자리까지만 입력하세요.");
const nonNegativeDecimal = decimalText.refine((value) => !value.startsWith("-"), "0 이상의 값을 입력하세요.");
const optionalPercentage = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().min(0).max(100).optional(),
);
const optionalPositiveInteger = (max: number) => z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().int().positive().max(max).optional(),
);
const optionalPositiveNumber = (max: number) => z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().positive().max(max).optional(),
);

export const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const counterpartySchema = z.object({
  code: trimmed(30).transform((value) => value.toUpperCase()),
  kind: z.enum(["customer", "supplier", "both"]),
  name: trimmed(120),
  businessNumber: optionalText(20),
  representativeName: optionalText(80),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  phone: optionalText(30),
  address: optionalText(300),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  creditLimit: nonNegativeDecimal,
});
export const counterpartyUpdateSchema = counterpartySchema.extend({ id: z.uuid() });
export const counterpartyDeleteSchema = z.object({ id: z.uuid() });

export const itemSchema = z.object({
  sku: trimmed(50).transform((value) => value.toUpperCase()),
  name: trimmed(160),
  kind: z.enum(["product", "material", "service"]),
  unit: trimmed(12).transform((value) => value.toUpperCase()),
  taxRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "세율은 100 이하이어야 합니다."),
  salePrice: nonNegativeDecimal,
  purchasePrice: nonNegativeDecimal,
  trackInventory: z.boolean(),
  reorderPoint: nonNegativeDecimal,
});

export const warehouseSchema = z.object({
  code: trimmed(30).transform((value) => value.toUpperCase()),
  name: trimmed(100),
  location: optionalText(200),
});

const documentLineSchema = z.object({
  itemId: z.uuid(),
  quantity: nonNegativeDecimal.refine((value) => Number(value) > 0, "수량은 0보다 커야 합니다."),
  unitPrice: nonNegativeDecimal,
  discountRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "할인율은 100 이하이어야 합니다."),
  taxRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "세율은 100 이하이어야 합니다."),
});

export const rawDocumentSchema = z.object({
  kind: z.enum(documentKinds),
  counterpartyId: z.uuid(),
  warehouseId: optionalUuid,
  itemId: z.uuid().optional(),
  issueDate: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  quantity: nonNegativeDecimal.refine((value) => Number(value) > 0, "수량은 0보다 커야 합니다.").optional(),
  unitPrice: nonNegativeDecimal.optional(),
  discountRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "할인율은 100 이하이어야 합니다.").optional(),
  taxRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "세율은 100 이하이어야 합니다.").optional(),
  notes: optionalText(2000),
  lines: z.array(documentLineSchema).max(50).optional(),
});

function validateDocumentLines(
  value: z.output<typeof rawDocumentSchema>,
  context: z.RefinementCtx,
) {
  if (value.lines && value.lines.length > 0) return;
  if (!value.itemId) context.addIssue({ code: "custom", path: ["itemId"], message: "품목을 선택하세요." });
  if (!value.quantity) context.addIssue({ code: "custom", path: ["quantity"], message: "수량을 입력하세요." });
  if (value.unitPrice === undefined) context.addIssue({ code: "custom", path: ["unitPrice"], message: "단가를 입력하세요." });
}

export const documentSchema = rawDocumentSchema.superRefine(validateDocumentLines);

export const documentUpdateSchema = rawDocumentSchema.extend({
  documentId: z.uuid(),
  expectedVersion: z.coerce.number().int().positive(),
}).superRefine(validateDocumentLines);

export const documentConvertSchema = z.object({
  documentId: z.uuid(),
  kind: z.enum(documentKinds),
});

export const settlementSchema = z.object({
  counterpartyId: z.uuid(),
  direction: z.enum(["receipt", "payment"]),
  amount: nonNegativeDecimal.refine((value) => Number(value) > 0, "금액은 0보다 커야 합니다."),
  settledOn: z.iso.date(),
  method: z.enum(["bank", "card", "cash", "offset", "other"]),
  reference: optionalText(80),
  notes: optionalText(2000),
  documentIds: z.array(z.uuid()).min(1, "배부할 문서를 선택하세요."),
});

export const documentTransitionSchema = z.object({
  documentId: z.uuid(),
  kind: z.enum(documentKinds),
  nextStatus: z.enum(documentStatuses),
  expectedVersion: z.coerce.number().int().positive(),
  warehouseId: optionalUuid,
});

export const inventoryMovementSchema = z.object({
  warehouseId: z.uuid(),
  itemId: z.uuid(),
  movementType: z.enum(["receipt", "issue", "adjustment"]),
  quantity: decimalText.refine((value) => value !== "0", "수량은 0일 수 없습니다."),
  unitCost: nonNegativeDecimal,
  reason: trimmed(300),
  idempotencyKey: z.uuid(),
});

export const assetSchema = z.object({
  counterpartyId: z.uuid(),
  siteId: z.uuid(),
  assetTag: trimmed(50).transform((value) => value.toUpperCase()),
  vendorAssetId: optionalText(120),
  productName: trimmed(160),
  productFamily: z.enum(["everrun", "ztc_endurance", "ztc_edge", "ftserver", "other"]),
  productModel: optionalText(120),
  softwareVersion: optionalText(120),
  protectionMode: z.enum(["ha", "ft", "mixed", "none", "other"]),
  operatingSystem: optionalText(160),
  managementIp: optionalText(200),
  serialNumber: optionalText(120),
  serviceMethod: z.enum(["remote", "visit", "hybrid"]),
  contractStatus: z.enum(["active", "pending_renewal", "not_contracted", "expired"]),
  contractNumber: optionalText(120),
  channelPartner: optionalText(160),
  supportProvider: optionalText(160),
  supportLevel: optionalText(80),
  supportStartedAt: z.union([z.iso.date(), z.literal("")]).optional(),
  installedAt: z.union([z.iso.date(), z.literal("")]).optional(),
  warrantyUntil: z.union([z.iso.date(), z.literal("")]).optional(),
  supportUntil: z.union([z.iso.date(), z.literal("")]).optional(),
  nextInspectionDate: z.union([z.iso.date(), z.literal("")]).optional(),
  notes: optionalText(2000),
});

export const assetProfileSchema = z.object({
  assetId: z.uuid(),
  status: z.enum(["active", "maintenance", "retired"]),
  businessSystem: optionalText(160),
  environment: z.enum(["production", "staging", "test", "development", "other"]),
  hardwareVendor: optionalText(120),
  rackLocation: optionalText(120),
  hypervisor: optionalText(120),
  assignedEngineerId: z.union([z.uuid(), z.literal("")]).optional(),
  configurationSource: z.enum(["manual", "inspection", "import", "monitoring"]),
  configurationCheckedAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
});

export const assetNodeSchema = z.object({
  assetId: z.uuid(),
  role: z.enum(["node0", "node1", "cma", "cmb", "host", "other"]),
  name: trimmed(120),
  hardwareModel: optionalText(160),
  serialNumber: optionalText(120),
  operatingSystem: optionalText(160),
  status: z.enum(["active", "standby", "maintenance", "fault", "offline", "unknown"]),
  managementAddress: optionalText(200),
  bmcAddress: optionalText(200),
  cpuCores: optionalPositiveInteger(4096),
  memoryGb: optionalPositiveNumber(1048576),
  lastVerifiedAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
  notes: optionalText(2000),
});
export const assetNodeUpdateSchema = assetNodeSchema.extend({ assetNodeId: z.uuid() });

export const assetNetworkSchema = z.object({
  assetId: z.uuid(),
  nodeId: z.union([z.uuid(), z.literal("")]).optional(),
  label: trimmed(120),
  purpose: z.enum(["management", "business", "a_link", "private", "bmc", "storage", "other"]),
  address: optionalText(200),
  peerAddress: optionalText(200),
  macAddress: optionalText(50),
  vlanId: optionalPositiveInteger(4094),
  speedMbps: optionalPositiveInteger(800000),
  switchPort: optionalText(120),
  redundancyGroup: optionalText(120),
  status: z.enum(["up", "down", "degraded", "unknown"]),
  lastVerifiedAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
  notes: optionalText(2000),
});
export const assetNetworkUpdateSchema = assetNetworkSchema.extend({ networkInterfaceId: z.uuid() });

export const assetVmSchema = z.object({
  assetId: z.uuid(),
  name: trimmed(160),
  businessRole: optionalText(160),
  operatingSystem: optionalText(160),
  protectionMode: z.enum(["ha", "ft", "unprotected", "other"]),
  status: z.enum(["running", "stopped", "degraded", "faulted", "unknown"]),
  vcpu: optionalPositiveInteger(1024),
  memoryGb: optionalPositiveNumber(1048576),
  storageGb: optionalPositiveNumber(1073741824),
  ipAddresses: optionalText(500),
  preferredNode: z.union([z.uuid(), z.literal("")]).optional(),
  lastVerifiedAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
  notes: optionalText(2000),
});
export const assetVmUpdateSchema = assetVmSchema.extend({ virtualMachineId: z.uuid() });

export const assetContractSchema = z.object({
  assetId: z.uuid(),
  scope: z.enum(["customer_support", "partner_support", "vendor_support"]),
  status: z.enum(["active", "pending_renewal", "not_contracted", "expired"]),
  contractNumber: optionalText(120),
  providerName: trimmed(160),
  recipientName: optionalText(160),
  intermediaryName: optionalText(160),
  supportLevel: optionalText(120),
  serviceMethod: z.enum(["remote", "visit", "hybrid"]),
  startsOn: z.union([z.iso.date(), z.literal("")]).optional(),
  endsOn: z.union([z.iso.date(), z.literal("")]).optional(),
  coverageSummary: optionalText(3000),
  exclusions: optionalText(3000),
  renewalOwnerId: z.union([z.uuid(), z.literal("")]).optional(),
  notes: optionalText(2000),
}).superRefine((value, context) => {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) context.addIssue({ code: "custom", path: ["endsOn"], message: "계약 종료일은 시작일보다 빠를 수 없습니다." });
  if (value.status !== "not_contracted" && !value.contractNumber && !value.coverageSummary) context.addIssue({ code: "custom", path: ["contractNumber"], message: "계약번호 또는 지원 범위를 입력하세요." });
});

export const assetLicenseSchema = z.object({
  assetId: z.uuid(),
  productName: trimmed(160),
  licenseType: z.enum(["perpetual", "subscription", "oem", "trial", "other"]),
  entitlementReference: optionalText(160),
  licenseKeyHint: optionalText(12),
  version: optionalText(120),
  quantity: z.coerce.number().int().positive().max(1000000),
  status: z.enum(["active", "suspended", "retired"]),
  supportContractId: z.union([z.uuid(), z.literal("")]).optional(),
  issuedOn: z.union([z.iso.date(), z.literal("")]).optional(),
  expiresOn: z.union([z.iso.date(), z.literal("")]).optional(),
  notes: optionalText(2000),
}).superRefine((value, context) => {
  if (value.issuedOn && value.expiresOn && value.expiresOn < value.issuedOn) context.addIssue({ code: "custom", path: ["expiresOn"], message: "라이선스 만료일은 발급일보다 빠를 수 없습니다." });
  if (value.licenseType !== "perpetual" && value.status === "active" && !value.expiresOn) context.addIssue({ code: "custom", path: ["expiresOn"], message: "기간형 라이선스의 만료일을 입력하세요." });
});
export const assetLicenseUpdateSchema = assetLicenseSchema.safeExtend({ licenseId: z.uuid() });

export const serviceCaseSchema = z.object({
  counterpartyId: z.uuid(),
  assetId: z.union([z.uuid(), z.literal("")]).optional(),
  caseType: z.enum(["incident", "request", "question", "maintenance"]),
  title: trimmed(200),
  description: optionalText(20000),
  severity: z.enum(["low", "normal", "high", "critical"]),
  dueAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
  nextActionAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
  contactName: optionalText(120),
  contactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  contactPhone: optionalText(30),
  entitlement: optionalText(160),
  externalProvider: optionalText(80),
  externalCaseNumber: optionalText(120),
  externalState: optionalText(80),
  sourceUrl: optionalHttpsUrl,
}).superRefine((value, context) => {
  if (value.externalCaseNumber && !value.externalProvider) {
    context.addIssue({ code: "custom", path: ["externalProvider"], message: "외부 케이스 번호가 있으면 지원사를 입력하세요." });
  }
  if (value.sourceUrl && !value.externalProvider) {
    context.addIssue({ code: "custom", path: ["externalProvider"], message: "외부 원문 주소가 있으면 지원사를 입력하세요." });
  }
});

export const serviceCaseTransitionSchema = z.object({
  caseId: z.uuid(),
  nextStatus: z.enum(serviceCaseStatuses),
  waitingReason: optionalText(1000),
  resolutionSummary: optionalText(20000),
  nextActionAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
});

export const serviceCaseActivitySchema = z.object({
  caseId: z.uuid(),
  kind: z.enum(["comment", "internal_note", "vendor_reply", "customer_reply"]),
  authorName: optionalText(120),
  body: trimmed(20000),
  occurredAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
}).superRefine((value, context) => {
  if ((value.kind === "vendor_reply" || value.kind === "customer_reply") && !value.authorName) {
    context.addIssue({ code: "custom", path: ["authorName"], message: "외부 회신의 작성자를 입력하세요." });
  }
});

export const serviceCaseAttachmentSchema = z.object({
  caseId: z.uuid(),
  fileName: trimmed(255),
  sourceUrl: z.string().trim().max(2048).refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "HTTPS 다운로드 주소를 입력하세요."),
  contentType: optionalText(120),
  sizeMb: z.preprocess(
    (value) => value === "" || value === undefined ? undefined : value,
    z.coerce.number().min(0).max(102400).optional(),
  ),
  description: optionalText(500),
  occurredAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
});

export const serviceCaseWatcherSchema = z.object({
  caseId: z.uuid(),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  displayName: optionalText(120),
  source: z.enum(["manual", "customer", "vendor", "distribution_list"]),
});

export const customerSiteSchema = z.object({
  counterpartyId: z.uuid(),
  code: trimmed(30).transform((value) => value.toUpperCase()),
  name: trimmed(120),
  address: optionalText(300),
  contactName: optionalText(80),
  contactPhone: optionalText(30),
  contactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  siContactName: optionalText(80),
  siContactPhone: optionalText(30),
  siContactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  timezone: z.enum(["Asia/Seoul", "Europe/Prague", "UTC"]),
});
export const customerSiteUpdateSchema = customerSiteSchema.extend({ id: z.uuid() });
export const customerSiteDeleteSchema = z.object({ id: z.uuid() });

export const inspectionSchema = z.object({
  assetId: z.uuid(),
  inspectionType: z.enum(["installation", "preventive", "quarterly", "incident", "upgrade"]),
  scheduledDate: z.iso.date(),
  reportReference: optionalText(300),
});

export const inspectionTransitionSchema = z.object({
  inspectionId: z.uuid(),
  nextStatus: z.enum(inspectionStatuses),
  systemHealth: z.enum(["healthy", "warning", "critical", "unknown"]).optional(),
  protectionStatus: z.enum(["pass", "warning", "fail", "na"]).optional(),
  syncStatus: z.enum(["pass", "warning", "fail", "na"]).optional(),
  serviceStatus: z.enum(["pass", "warning", "fail", "na"]).optional(),
  cpuPercent: optionalPercentage,
  memoryPercent: optionalPercentage,
  diskPercent: optionalPercentage,
  findings: optionalText(5000),
  actionItems: optionalText(5000),
  nextInspectionDate: z.union([z.iso.date(), z.literal("")]).optional(),
});

const cliDecimal = z.preprocess(
  (value) => typeof value === "number" ? String(value) : value,
  nonNegativeDecimal,
);
const cliAmount = z.preprocess(
  (value) => value === undefined || value === "" ? "0" : typeof value === "number" ? String(value) : value,
  nonNegativeDecimal,
);

export const drivingLogSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  departure: trimmed(160),
  destination: trimmed(160),
  purpose: trimmed(500),
  vehicleName: trimmed(120),
  distanceKm: cliDecimal.refine((value) => Number(value) > 0, "운행 거리는 0보다 커야 합니다."),
  ratePerKm: cliAmount,
  tollAmount: cliAmount,
  parkingAmount: cliAmount,
  fuelAmount: cliAmount,
  dailyAllowanceAmount: cliAmount,
  counterpartyId: z.union([z.uuid(), z.literal("")]).optional(),
  siteId: z.union([z.uuid(), z.literal("")]).optional(),
  caseId: z.union([z.uuid(), z.literal("")]).optional(),
  reason: optionalText(1000),
  notes: optionalText(4000),
}).superRefine((value, context) => {
  if (value.endDate < value.startDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "종료일은 시작일보다 빠를 수 없습니다.",
    });
  }
});

export const drivingLogUpdateSchema = drivingLogSchema.safeExtend({
  drivingLogId: z.uuid(),
  expectedVersion: z.coerce.number().int().positive(),
});

export const drivingLogTransitionSchema = z.object({
  drivingLogId: z.uuid(),
  nextStatus: z.enum(drivingLogStatuses),
  expectedVersion: z.coerce.number().int().positive(),
  reason: optionalText(1000),
}).superRefine((value, context) => {
  if ((value.nextStatus === "void" || value.nextStatus === "draft") && !value.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: value.nextStatus === "void" ? "무효 처리 사유를 입력하세요." : "반려 사유를 입력하세요.",
    });
  }
});

export const drivingLogListSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다.").optional(),
  status: z.enum(drivingLogStatuses).optional(),
  counterpartyId: z.uuid().optional(),
  caseId: z.uuid().optional(),
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const drivingLogMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다."),
});

export const memberSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  name: trimmed(100),
  password: z.string().min(12, "초기 비밀번호는 12자 이상이어야 합니다.").max(128),
  role: z.enum(roles),
});

export const memberUpdateSchema = z.object({
  userId: z.uuid(),
  role: z.enum(roles),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
