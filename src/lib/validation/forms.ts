import { z } from "zod";
import { documentKinds } from "@/lib/services/documents";
import { documentStatuses } from "@/lib/domain/document-state";
import { roles } from "@/lib/security/permissions";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const decimalText = z.string().trim().regex(/^-?\d+(\.\d{1,4})?$/, "숫자는 소수점 넷째 자리까지만 입력하세요.");
const nonNegativeDecimal = decimalText.refine((value) => !value.startsWith("-"), "0 이상의 값을 입력하세요.");

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
  assetTag: trimmed(50).transform((value) => value.toUpperCase()),
  productName: trimmed(160),
  serialNumber: optionalText(120),
  site: optionalText(200),
  installedAt: z.union([z.iso.date(), z.literal("")]).optional(),
  warrantyUntil: z.union([z.iso.date(), z.literal("")]).optional(),
  supportUntil: z.union([z.iso.date(), z.literal("")]).optional(),
  notes: optionalText(2000),
});

export const serviceCaseSchema = z.object({
  counterpartyId: z.uuid(),
  assetId: z.union([z.uuid(), z.literal("")]).optional(),
  title: trimmed(200),
  description: optionalText(5000),
  severity: z.enum(["low", "normal", "high", "critical"]),
  dueAt: z.union([z.iso.datetime({ local: true }), z.literal("")]).optional(),
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
