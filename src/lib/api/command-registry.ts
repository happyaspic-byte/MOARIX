import { z } from "zod";
import type { ApiTokenContext } from "@/lib/auth/api-token";
import { hasApiTokenScope } from "@/lib/auth/api-token";
import type { Permission } from "@/lib/security/permissions";
import { hasPermission } from "@/lib/security/permissions";
import {
  createAsset,
  createAssetLicense,
  createAssetNetwork,
  createAssetNode,
  createAssetSupportContract,
  createAssetVirtualMachine,
  getAssetWorkspace,
  listAssets,
  updateAssetLicense,
  updateAssetNetwork,
  updateAssetNode,
  updateAssetOperationsProfile,
  updateAssetVirtualMachine,
} from "@/lib/services/assets-service";
import {
  createDocument,
  getDocumentDetail,
  listDocuments,
  transitionDocument,
  updateDraftDocument,
} from "@/lib/services/documents";
import {
  createDrivingLog,
  getDrivingLog,
  getDrivingLogMonthSummary,
  listDrivingLogs,
  transitionDrivingLog,
  updateDrivingLog,
} from "@/lib/services/driving-logs";
import {
  createCounterparty,
  createItem,
  createWarehouse,
  deleteCounterparty,
  listCounterparties,
  listItems,
  listWarehouses,
  updateCounterparty,
} from "@/lib/services/master-data";
import {
  createCustomerSite,
  createInspection,
  deleteCustomerSite,
  listCustomerSites,
  listInspections,
  transitionInspection,
  updateCustomerSite,
} from "@/lib/services/operations-service";
import { getStandardReports } from "@/lib/services/reports";
import {
  addServiceCaseWatcher,
  appendServiceCaseActivity,
  createServiceCase,
  getServiceCaseDetail,
  listServiceCases,
  registerServiceCaseAttachment,
  transitionServiceCase,
} from "@/lib/services/service-cases";
import {
  assetContractSchema,
  assetLicenseSchema,
  assetLicenseUpdateSchema,
  assetNetworkSchema,
  assetNetworkUpdateSchema,
  assetNodeSchema,
  assetNodeUpdateSchema,
  assetProfileSchema,
  assetSchema,
  assetVmSchema,
  assetVmUpdateSchema,
  counterpartyDeleteSchema,
  counterpartySchema,
  counterpartyUpdateSchema,
  customerSiteDeleteSchema,
  customerSiteSchema,
  customerSiteUpdateSchema,
  rawDocumentSchema,
  drivingLogListSchema,
  drivingLogMonthSchema,
  drivingLogSchema,
  drivingLogTransitionSchema,
  drivingLogUpdateSchema,
  inspectionSchema,
  inspectionTransitionSchema,
  itemSchema,
  serviceCaseActivitySchema,
  serviceCaseAttachmentSchema,
  serviceCaseSchema,
  serviceCaseTransitionSchema,
  serviceCaseWatcherSchema,
  warehouseSchema,
} from "@/lib/validation/forms";
import { ApiError } from "./errors";
import { assertApiCommandAccess } from "./access";
import { filterAndLimit, resolveExactReference } from "./references";

export type CommandMode = "read" | "write";

export type CommandDefinition = {
  operation: string;
  summary: string;
  mode: CommandMode;
  permission: Permission;
  scope: string;
  conditionalAccess?: Array<{
    permission: Permission;
    scope: string;
    when: string;
    required: (input: unknown) => boolean;
  }>;
  inputSchema: z.ZodType;
  execute: (actor: ApiTokenContext, input: unknown) => Promise<unknown>;
};

function defineCommand<TSchema extends z.ZodType>(definition: Omit<CommandDefinition, "inputSchema" | "execute"> & {
  inputSchema: TSchema;
  execute: (actor: ApiTokenContext, input: z.output<TSchema>) => Promise<unknown>;
}): CommandDefinition {
  return {
    ...definition,
    inputSchema: definition.inputSchema,
    execute: (actor, input) => definition.execute(actor, input as z.output<TSchema>),
  };
}

const emptySchema = z.object({}).strict();
const referenceSchema = z.string().trim().min(1).max(160);
const listSchema = z.object({
  query: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(500).default(100),
}).strict();
const getSchema = z.object({ id: referenceSchema }).strict();

function omitCommandId<T extends { id: string }>(input: T): Omit<T, "id"> {
  const { id, ...rest } = input;
  void id;
  return rest;
}

const quoteCreateSchema = rawDocumentSchema.omit({ kind: true }).superRefine((value, context) => {
  if (value.lines && value.lines.length > 0) return;
  if (!value.itemId) context.addIssue({ code: "custom", path: ["itemId"], message: "품목을 선택하세요." });
  if (!value.quantity) context.addIssue({ code: "custom", path: ["quantity"], message: "수량을 입력하세요." });
  if (value.unitPrice === undefined) context.addIssue({ code: "custom", path: ["unitPrice"], message: "단가를 입력하세요." });
});
const quoteUpdateSchema = rawDocumentSchema.omit({ kind: true }).extend({
  id: referenceSchema,
  expectedVersion: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.lines && value.lines.length > 0) return;
  if (!value.itemId) context.addIssue({ code: "custom", path: ["itemId"], message: "품목을 선택하세요." });
  if (!value.quantity) context.addIssue({ code: "custom", path: ["quantity"], message: "수량을 입력하세요." });
  if (value.unitPrice === undefined) context.addIssue({ code: "custom", path: ["unitPrice"], message: "단가를 입력하세요." });
});
const quoteTransitionSchema = z.object({
  id: referenceSchema,
  nextStatus: z.enum(["draft", "submitted", "approved", "posted", "cancelled"]),
  expectedVersion: z.number().int().positive(),
}).strict();
const assetUpdateSchema = assetProfileSchema.omit({ assetId: true }).partial().extend({ id: referenceSchema }).strict()
  .refine((value) => Object.keys(value).some((key) => key !== "id"), "수정할 자산 운영 프로필 필드를 하나 이상 입력하세요.");
const caseTransitionCommandSchema = serviceCaseTransitionSchema.omit({ caseId: true }).extend({ id: referenceSchema }).strict();
const caseActivityCommandSchema = z.object({
  id: referenceSchema,
  kind: serviceCaseActivitySchema.shape.kind,
  authorName: serviceCaseActivitySchema.shape.authorName,
  body: serviceCaseActivitySchema.shape.body,
  occurredAt: serviceCaseActivitySchema.shape.occurredAt,
}).strict().superRefine((value, context) => {
  if ((value.kind === "vendor_reply" || value.kind === "customer_reply") && !value.authorName) {
    context.addIssue({ code: "custom", path: ["authorName"], message: "외부 회신의 작성자를 입력하세요." });
  }
});
const caseAttachmentCommandSchema = serviceCaseAttachmentSchema.omit({ caseId: true }).extend({ id: referenceSchema }).strict();
const caseWatcherCommandSchema = serviceCaseWatcherSchema.omit({ caseId: true }).extend({ id: referenceSchema }).strict();
const inspectionTransitionCommandSchema = inspectionTransitionSchema.omit({ inspectionId: true }).extend({ id: referenceSchema }).strict();
const drivingLogUpdateCommandSchema = drivingLogSchema.safeExtend({
  id: referenceSchema,
  expectedVersion: drivingLogUpdateSchema.shape.expectedVersion,
}).strict();
const drivingLogTransitionCommandSchema = z.object({
  id: referenceSchema,
  nextStatus: drivingLogTransitionSchema.shape.nextStatus,
  expectedVersion: drivingLogTransitionSchema.shape.expectedVersion,
  reason: drivingLogTransitionSchema.shape.reason,
}).strict().superRefine((value, context) => {
  if (value.nextStatus === "void" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "무효 처리 사유를 입력하세요." });
  }
});
const reportSchema = z.object({
  report: z.enum(["all", "finance", "stock", "support-risk", "licenses", "inspections"]).default("all"),
  format: z.literal("json").default("json"),
}).strict();

async function resolveAsset(companyId: string, reference: string) {
  const rows = await listAssets(companyId);
  return resolveExactReference(rows, reference, ["id", "asset_tag", "vendor_asset_id"], "자산");
}

async function resolveCase(companyId: string, reference: string) {
  const rows = await listServiceCases(companyId);
  return resolveExactReference(rows, reference, ["id", "number", "external_case_number"], "서비스 케이스");
}

async function resolveInspection(companyId: string, reference: string) {
  const rows = await listInspections(companyId);
  return resolveExactReference(rows, reference, ["id", "number"], "점검");
}

async function resolveQuote(companyId: string, reference: string) {
  const { rows } = await listDocuments(companyId, "quote");
  return resolveExactReference(rows, reference, ["id", "number"], "견적서");
}

async function resolveDrivingLog(actor: ApiTokenContext, reference: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) {
    const direct = await getDrivingLog(actor, reference);
    if (direct) return direct;
  }
  const rows = await listDrivingLogs(actor, { query: reference, limit: 200 });
  return resolveExactReference(rows, reference, ["id", "number"], "운행일지");
}

const commands: CommandDefinition[] = [
  defineCommand({
    operation: "context.get", summary: "현재 API 토큰의 회사·사용자·역할 범위를 조회합니다.",
    mode: "read", permission: "dashboard:read", scope: "context:read", inputSchema: emptySchema,
    execute: async (actor) => ({
      company: { id: actor.companyId, name: actor.companyName, timezone: actor.companyTimezone },
      user: { id: actor.userId, name: actor.userName, email: actor.email, role: actor.role },
      token: { id: actor.apiTokenId, name: actor.apiTokenName, prefix: actor.apiTokenPrefix, scopes: actor.scopes, expiresAt: actor.expiresAt.toISOString() },
    }),
  }),
  defineCommand({
    operation: "capabilities.get", summary: "현재 토큰으로 실행 가능한 명령과 JSON Schema를 조회합니다.",
    mode: "read", permission: "dashboard:read", scope: "context:read", inputSchema: emptySchema,
    execute: async (actor) => listCommandCapabilities(actor),
  }),
  defineCommand({
    operation: "master.counterparties.list", summary: "고객사·공급사를 조회합니다.",
    mode: "read", permission: "master:read", scope: "master:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listCounterparties(actor.companyId), input, ["code", "name", "email", "phone"]),
  }),
  defineCommand({
    operation: "master.counterparties.create", summary: "고객사 또는 공급사를 등록합니다.",
    mode: "write", permission: "master:write", scope: "master:write", inputSchema: counterpartySchema.strict(),
    execute: async (actor, input) => ({ id: await createCounterparty(actor, input) }),
  }),
  defineCommand({
    operation: "master.counterparties.update", summary: "고객사 또는 공급사 기준정보를 수정합니다.",
    mode: "write", permission: "master:write", scope: "master:write", inputSchema: counterpartyUpdateSchema.strict(),
    execute: async (actor, input) => {
      const { id, ...data } = input;
      await updateCounterparty(actor, id, data);
      return { id };
    },
  }),
  defineCommand({
    operation: "master.counterparties.delete", summary: "연결된 사업장·자산이 없는 거래처를 삭제합니다.",
    mode: "write", permission: "master:write", scope: "master:write", inputSchema: counterpartyDeleteSchema.strict(),
    execute: async (actor, input) => {
      await deleteCounterparty(actor, input.id);
      return { id: input.id };
    },
  }),
  defineCommand({
    operation: "master.items.list", summary: "상품·자재·서비스 품목을 조회합니다.",
    mode: "read", permission: "master:read", scope: "master:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listItems(actor.companyId), input, ["sku", "name"]),
  }),
  defineCommand({
    operation: "master.items.create", summary: "상품·자재·서비스 품목을 등록합니다.",
    mode: "write", permission: "master:write", scope: "master:write", inputSchema: itemSchema.strict(),
    execute: async (actor, input) => ({ id: await createItem(actor, input) }),
  }),
  defineCommand({
    operation: "master.warehouses.list", summary: "창고를 조회합니다.",
    mode: "read", permission: "master:read", scope: "master:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listWarehouses(actor.companyId), input, ["code", "name", "location"]),
  }),
  defineCommand({
    operation: "master.warehouses.create", summary: "창고를 등록합니다.",
    mode: "write", permission: "master:write", scope: "master:write", inputSchema: warehouseSchema.strict(),
    execute: async (actor, input) => ({ id: await createWarehouse(actor, input) }),
  }),
  defineCommand({
    operation: "sites.list", summary: "고객 사업장을 조회합니다.",
    mode: "read", permission: "assets:read", scope: "assets:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listCustomerSites(actor.companyId), input, ["code", "name", "counterparty_name", "address", "contact_name", "si_contact_name"]),
  }),
  defineCommand({
    operation: "sites.create", summary: "고객 사업장을 등록합니다.",
    mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: customerSiteSchema.strict(),
    execute: async (actor, input) => ({ id: await createCustomerSite(actor, input) }),
  }),
  defineCommand({
    operation: "sites.update", summary: "고객 사업장과 고객·SI업체 담당자를 수정합니다.",
    mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: customerSiteUpdateSchema.strict(),
    execute: async (actor, input) => {
      const { id, ...data } = input;
      await updateCustomerSite(actor, id, data);
      return { id };
    },
  }),
  defineCommand({
    operation: "sites.delete", summary: "연결된 자산이 없는 고객 사업장을 삭제합니다.",
    mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: customerSiteDeleteSchema.strict(),
    execute: async (actor, input) => {
      await deleteCustomerSite(actor, input.id);
      return { id: input.id };
    },
  }),
  defineCommand({
    operation: "assets.list", summary: "Stratus/일반 고객 자산을 조회합니다.",
    mode: "read", permission: "assets:read", scope: "assets:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listAssets(actor.companyId), input, ["asset_tag", "vendor_asset_id", "product_name", "counterparty_name", "serial_number"]),
  }),
  defineCommand({
    operation: "assets.get", summary: "자산 360° 정보(노드·A-Link·VM·계약·라이선스·점검·케이스)를 조회합니다.",
    mode: "read", permission: "assets:read", scope: "assets:read", inputSchema: getSchema,
    execute: async (actor, input) => {
      const asset = await resolveAsset(actor.companyId, input.id);
      const workspace = await getAssetWorkspace(actor.companyId, asset.id);
      if (!workspace) throw new ApiError("NOT_FOUND", 404, "자산을 찾을 수 없습니다.");
      return workspace;
    },
  }),
  defineCommand({
    operation: "assets.create", summary: "고객 자산을 등록합니다.",
    mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetSchema.strict(),
    execute: async (actor, input) => ({ id: await createAsset(actor, input) }),
  }),
  defineCommand({
    operation: "assets.update", summary: "자산 운영 프로필과 상태를 수정합니다. 퇴역 시 진행 업무를 검사합니다.",
    mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetUpdateSchema,
    execute: async (actor, input) => {
      const asset = await resolveAsset(actor.companyId, input.id);
      const profile = omitCommandId(input);
      await updateAssetOperationsProfile(actor, { ...profile, assetId: asset.id });
      return { id: asset.id };
    },
  }),
  defineCommand({ operation: "assets.nodes.create", summary: "Stratus 자산 노드를 등록합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetNodeSchema.strict(), execute: async (actor, input) => ({ id: await createAssetNode(actor, input) }) }),
  defineCommand({ operation: "assets.nodes.update", summary: "Stratus 자산 노드를 수정합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetNodeUpdateSchema.strict(), execute: async (actor, input) => { await updateAssetNode(actor, input); return { id: input.assetNodeId }; } }),
  defineCommand({ operation: "assets.networks.create", summary: "A-Link 등 네트워크 인터페이스를 등록합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetNetworkSchema.strict(), execute: async (actor, input) => ({ id: await createAssetNetwork(actor, input) }) }),
  defineCommand({ operation: "assets.networks.update", summary: "A-Link 등 네트워크 인터페이스를 수정합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetNetworkUpdateSchema.strict(), execute: async (actor, input) => { await updateAssetNetwork(actor, input); return { id: input.networkInterfaceId }; } }),
  defineCommand({ operation: "assets.vms.create", summary: "Stratus 보호 VM을 등록합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetVmSchema.strict(), execute: async (actor, input) => ({ id: await createAssetVirtualMachine(actor, input) }) }),
  defineCommand({ operation: "assets.vms.update", summary: "Stratus 보호 VM을 수정합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetVmUpdateSchema.strict(), execute: async (actor, input) => { await updateAssetVirtualMachine(actor, input); return { id: input.virtualMachineId }; } }),
  defineCommand({ operation: "assets.contracts.create", summary: "고객/벤더 기술지원 계약 이력을 등록합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetContractSchema.strict(), execute: async (actor, input) => ({ id: await createAssetSupportContract(actor, input) }) }),
  defineCommand({ operation: "assets.licenses.create", summary: "자산 라이선스를 등록합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetLicenseSchema.strict(), execute: async (actor, input) => ({ id: await createAssetLicense(actor, input) }) }),
  defineCommand({ operation: "assets.licenses.update", summary: "자산 라이선스를 수정하거나 폐기 상태로 전환합니다.", mode: "write", permission: "assets:write", scope: "assets:write", inputSchema: assetLicenseUpdateSchema.strict(), execute: async (actor, input) => { await updateAssetLicense(actor, input); return { id: input.licenseId }; } }),
  defineCommand({
    operation: "cases.list", summary: "SLA·심각도 순으로 서비스 케이스를 조회합니다.",
    mode: "read", permission: "service:read", scope: "cases:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listServiceCases(actor.companyId), input, ["number", "title", "external_case_number", "counterparty_name", "asset_tag"]),
  }),
  defineCommand({
    operation: "cases.get", summary: "케이스 원문·활동·첨부 링크·Task Watch List를 조회합니다.",
    mode: "read", permission: "service:read", scope: "cases:read", inputSchema: getSchema,
    execute: async (actor, input) => {
      const serviceCase = await resolveCase(actor.companyId, input.id);
      const detail = await getServiceCaseDetail(actor.companyId, serviceCase.id);
      if (!detail) throw new ApiError("NOT_FOUND", 404, "서비스 케이스를 찾을 수 없습니다.");
      return detail;
    },
  }),
  defineCommand({ operation: "cases.create", summary: "자산과 SLA 정보를 연결해 서비스 케이스를 접수합니다.", mode: "write", permission: "service:write", scope: "cases:write", inputSchema: serviceCaseSchema.strict(), execute: async (actor, input) => createServiceCase(actor, input) }),
  defineCommand({ operation: "cases.activity.add", summary: "내부 메모·고객/벤더 회신을 케이스 활동에 추가합니다.", mode: "write", permission: "service:write", scope: "cases:write", inputSchema: caseActivityCommandSchema, execute: async (actor, input) => { const serviceCase = await resolveCase(actor.companyId, input.id); const activity = omitCommandId(input); return { id: await appendServiceCaseActivity(actor, { ...activity, caseId: serviceCase.id }) }; } }),
  defineCommand({ operation: "cases.attachment.add", summary: "HTTPS 진단자료 링크를 케이스에 등록합니다.", mode: "write", permission: "service:write", scope: "cases:write", inputSchema: caseAttachmentCommandSchema, execute: async (actor, input) => { const serviceCase = await resolveCase(actor.companyId, input.id); const attachment = omitCommandId(input); return { id: await registerServiceCaseAttachment(actor, { ...attachment, caseId: serviceCase.id }) }; } }),
  defineCommand({ operation: "cases.watcher.add", summary: "Task Watch List 수신자를 추가합니다.", mode: "write", permission: "service:write", scope: "cases:write", inputSchema: caseWatcherCommandSchema, execute: async (actor, input) => { const serviceCase = await resolveCase(actor.companyId, input.id); const watcher = omitCommandId(input); return { id: await addServiceCaseWatcher(actor, { ...watcher, caseId: serviceCase.id }) }; } }),
  defineCommand({ operation: "cases.transition", summary: "케이스 상태를 업무 규칙에 따라 전환합니다.", mode: "write", permission: "service:write", scope: "cases:write", inputSchema: caseTransitionCommandSchema, execute: async (actor, input) => { const serviceCase = await resolveCase(actor.companyId, input.id); const transition = omitCommandId(input); await transitionServiceCase(actor, { ...transition, caseId: serviceCase.id }); return { id: serviceCase.id, status: input.nextStatus }; } }),
  defineCommand({
    operation: "inspections.list", summary: "자산 점검 일정과 결과를 조회합니다.",
    mode: "read", permission: "service:read", scope: "inspections:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit(await listInspections(actor.companyId), input, ["number", "asset_tag", "product_name", "customer_name", "site_name"]),
  }),
  defineCommand({ operation: "inspections.get", summary: "점검 한 건을 번호 또는 UUID로 조회합니다.", mode: "read", permission: "service:read", scope: "inspections:read", inputSchema: getSchema, execute: async (actor, input) => resolveInspection(actor.companyId, input.id) }),
  defineCommand({ operation: "inspections.create", summary: "자산 점검 일정을 등록합니다.", mode: "write", permission: "service:write", scope: "inspections:write", inputSchema: inspectionSchema.strict(), execute: async (actor, input) => createInspection(actor, input) }),
  defineCommand({ operation: "inspections.transition", summary: "점검 상태·체크 결과·후속 일정을 반영합니다.", mode: "write", permission: "service:write", scope: "inspections:write", inputSchema: inspectionTransitionCommandSchema, execute: async (actor, input) => { const inspection = await resolveInspection(actor.companyId, input.id); const transition = omitCommandId(input); await transitionInspection(actor, { ...transition, inspectionId: inspection.id }); return { id: inspection.id, status: input.nextStatus }; } }),
  defineCommand({
    operation: "quotes.list", summary: "견적서를 조회합니다.", mode: "read", permission: "documents:read", scope: "quotes:read", inputSchema: listSchema,
    execute: async (actor, input) => filterAndLimit((await listDocuments(actor.companyId, "quote")).rows, input, ["number", "counterparty_name"]),
  }),
  defineCommand({ operation: "quotes.get", summary: "견적서 헤더·라인·버전을 조회합니다.", mode: "read", permission: "documents:read", scope: "quotes:read", inputSchema: getSchema, execute: async (actor, input) => { const quote = await resolveQuote(actor.companyId, input.id); const detail = await getDocumentDetail(actor.companyId, quote.id, "quote"); if (!detail) throw new ApiError("NOT_FOUND", 404, "견적서를 찾을 수 없습니다."); return detail; } }),
  defineCommand({ operation: "quotes.create", summary: "다중 품목 견적 초안을 생성합니다.", mode: "write", permission: "documents:write", scope: "quotes:write", inputSchema: quoteCreateSchema, execute: async (actor, input) => createDocument(actor, { ...input, kind: "quote" }) }),
  defineCommand({ operation: "quotes.update", summary: "버전 충돌을 검사하며 다중 품목 견적 초안을 수정합니다.", mode: "write", permission: "documents:write", scope: "quotes:write", inputSchema: quoteUpdateSchema, execute: async (actor, input) => { const quote = await resolveQuote(actor.companyId, input.id); const update = omitCommandId(input); return updateDraftDocument(actor, { ...update, documentId: quote.id, kind: "quote" }); } }),
  defineCommand({
    operation: "quotes.transition", summary: "견적서를 제출·승인·확정·취소합니다.",
    mode: "write", permission: "documents:write", scope: "quotes:write", inputSchema: quoteTransitionSchema,
    conditionalAccess: [{
      permission: "documents:approve",
      scope: "quotes:approve",
      when: "nextStatus가 approved, posted 또는 cancelled인 경우",
      required: (input) => ["approved", "posted", "cancelled"].includes((input as { nextStatus?: string }).nextStatus ?? ""),
    }],
    execute: async (actor, input) => { const quote = await resolveQuote(actor.companyId, input.id); await transitionDocument(actor, quote.id, input.nextStatus, input.expectedVersion); return { id: quote.id, status: input.nextStatus, version: input.expectedVersion + 1 }; },
  }),
  defineCommand({
    operation: "trips.list", summary: "운행일지를 월·상태·고객·케이스 조건으로 조회합니다.",
    mode: "read", permission: "trips:read", scope: "trips:read", inputSchema: drivingLogListSchema.strict(),
    execute: async (actor, input) => listDrivingLogs(actor, input),
  }),
  defineCommand({
    operation: "trips.get", summary: "운행일지를 번호 또는 UUID로 조회합니다.",
    mode: "read", permission: "trips:read", scope: "trips:read", inputSchema: getSchema,
    execute: async (actor, input) => resolveDrivingLog(actor, input.id),
  }),
  defineCommand({
    operation: "trips.create", summary: "운행 거리와 비용을 계산해 운행일지 초안을 생성합니다.",
    mode: "write", permission: "trips:write", scope: "trips:write", inputSchema: drivingLogSchema.strict(),
    execute: async (actor, input) => createDrivingLog(actor, input),
  }),
  defineCommand({
    operation: "trips.update", summary: "버전 충돌을 검사하며 운행일지 초안을 수정합니다.",
    mode: "write", permission: "trips:write", scope: "trips:write", inputSchema: drivingLogUpdateCommandSchema,
    execute: async (actor, input) => {
      const drivingLog = await resolveDrivingLog(actor, input.id);
      const update = omitCommandId(input);
      return updateDrivingLog(actor, { ...update, drivingLogId: drivingLog.id });
    },
  }),
  defineCommand({
    operation: "trips.transition", summary: "운행일지를 제출·승인·반려·무효 처리합니다. 작성자 본인 승인을 차단합니다.",
    mode: "write", permission: "trips:write", scope: "trips:write", inputSchema: drivingLogTransitionCommandSchema,
    conditionalAccess: [{
      permission: "trips:approve",
      scope: "trips:approve",
      when: "nextStatus가 approved 또는 void인 경우",
      required: (input) => ["approved", "void"].includes((input as { nextStatus?: string }).nextStatus ?? ""),
    }],
    execute: async (actor, input) => {
      const drivingLog = await resolveDrivingLog(actor, input.id);
      const transition = omitCommandId(input);
      return transitionDrivingLog(actor, { ...transition, drivingLogId: drivingLog.id });
    },
  }),
  defineCommand({
    operation: "trips.summary", summary: "운행일지 월별 거리·신청액·승인액을 집계합니다.",
    mode: "read", permission: "trips:read", scope: "trips:read", inputSchema: drivingLogMonthSchema.strict(),
    execute: async (actor, input) => getDrivingLogMonthSummary(actor, input.month),
  }),
  defineCommand({
    operation: "reports.run", summary: "재무·재고·지원 위험·라이선스·점검 표준 보고서를 조회합니다.",
    mode: "read", permission: "reports:read", scope: "reports:read", inputSchema: reportSchema,
    execute: async (actor, input) => {
      const reports = await getStandardReports(actor.companyId);
      if (input.report === "all") return reports;
      if (input.report === "finance") return { documentSummary: reports.documentSummary, counterpartySummary: reports.counterpartySummary };
      if (input.report === "stock") return { stockValue: reports.stockValue };
      if (input.report === "support-risk") return { supportSummary: reports.supportSummary, supportQueue: reports.supportQueue };
      if (input.report === "licenses") return { licenseSummary: reports.licenseSummary, licenseQueue: reports.licenseQueue };
      return { inspectionSummary: reports.inspectionSummary, inspectionDueQueue: reports.inspectionDueQueue };
    },
  }),
];

const commandMap = new Map(commands.map((definition) => [definition.operation, definition]));
if (commandMap.size !== commands.length) throw new Error("Duplicate MOARIX command operation");

export function getCommandDefinition(operation: string) {
  const definition = commandMap.get(operation);
  if (!definition) throw new ApiError("UNKNOWN_OPERATION", 404, `지원하지 않는 operation입니다: ${operation}`);
  return definition;
}

function jsonSchema(schema: z.ZodType) {
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema, {
    io: "input",
    target: "draft-2020-12",
    unrepresentable: "any",
  }))) as Record<string, unknown>;
}

export function listCommandCapabilities(actor: Pick<ApiTokenContext, "role" | "scopes">) {
  return commands
    .filter((definition) => hasPermission(actor.role, definition.permission) && hasApiTokenScope(actor.scopes, definition.scope))
    .map((definition) => ({
      operation: definition.operation,
      summary: definition.summary,
      mode: definition.mode,
      permission: definition.permission,
      scope: definition.scope,
      conditionalAccess: definition.conditionalAccess?.map(({ permission, scope, when }) => ({
        permission,
        scope,
        when,
      })) ?? [],
      inputSchema: jsonSchema(definition.inputSchema),
      safety: definition.mode === "write"
        ? { dryRun: true, idempotencyRequired: true, hardDelete: false }
        : { dryRun: false, idempotencyRequired: false, hardDelete: false },
    }));
}

export function parseCommandInput(definition: CommandDefinition, input: unknown) {
  return definition.inputSchema.parse(input);
}

export function assertCommandInputAccess(
  definition: CommandDefinition,
  actor: Pick<ApiTokenContext, "role" | "scopes">,
  input: unknown,
) {
  for (const rule of definition.conditionalAccess ?? []) {
    if (rule.required(input)) assertApiCommandAccess(actor, rule);
  }
}

export function executeCommand(definition: CommandDefinition, actor: ApiTokenContext, input: unknown) {
  return definition.execute(actor, input);
}
