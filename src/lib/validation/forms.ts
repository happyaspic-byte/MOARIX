import { z } from "zod";
import { documentKinds } from "@/lib/services/documents";
import { documentStatuses } from "@/lib/domain/document-state";
import { inspectionStatuses } from "@/lib/domain/inspection-state";
import { serviceCaseStatuses } from "@/lib/domain/service-case-state";
import { roles } from "@/lib/security/permissions";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
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

export const documentSchema = z.object({
  kind: z.enum(documentKinds),
  counterpartyId: z.uuid(),
  itemId: z.uuid(),
  issueDate: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  quantity: nonNegativeDecimal.refine((value) => Number(value) > 0, "수량은 0보다 커야 합니다."),
  unitPrice: nonNegativeDecimal,
  discountRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "할인율은 100 이하이어야 합니다."),
  taxRate: nonNegativeDecimal.refine((value) => Number(value) <= 100, "세율은 100 이하이어야 합니다."),
  notes: optionalText(2000),
});

export const documentTransitionSchema = z.object({
  documentId: z.uuid(),
  kind: z.enum(documentKinds),
  nextStatus: z.enum(documentStatuses),
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

export const customerSiteSchema = z.object({
  counterpartyId: z.uuid(),
  code: trimmed(30).transform((value) => value.toUpperCase()),
  name: trimmed(120),
  address: optionalText(300),
  contactName: optionalText(80),
  contactPhone: optionalText(30),
  contactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
  timezone: z.enum(["Asia/Seoul", "Europe/Prague", "UTC"]),
});

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
