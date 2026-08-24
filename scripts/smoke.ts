import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { authenticate, findSession } from "../src/lib/auth/repository";
import { getDatabase } from "../src/lib/db/client";
import { hashSessionToken } from "../src/lib/security/session-token";
import { createAsset, listAssets } from "../src/lib/services/assets-service";
import { createMember, listAuditLogs, listMembers, updateMember } from "../src/lib/services/admin";
import { getDashboard } from "../src/lib/services/dashboard";
import { createDocument, listDocuments, transitionDocument } from "../src/lib/services/documents";
import { listInventory, postInventoryMovement } from "../src/lib/services/inventory-service";
import { createCounterparty, createItem, createWarehouse } from "../src/lib/services/master-data";
import { getStandardReports } from "../src/lib/services/reports";
import { createCustomerSite, createInspection, listCustomerSites, listInspections, transitionInspection } from "../src/lib/services/operations-service";
import { appendServiceCaseActivity, createServiceCase, getServiceCaseDetail, listServiceCases, registerServiceCaseAttachment, transitionServiceCase } from "../src/lib/services/service-cases";

const email = process.env.SMOKE_EMAIL ?? "admin@moarix.local";
const password = process.env.SMOKE_PASSWORD;
const port = Number(process.env.SMOKE_PORT ?? 3010);

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function exerciseDomain() {
  invariant(password, "SMOKE_PASSWORD is required");
  const auth = await authenticate(email, password, { userAgent: "moarix-runtime-smoke" });
  invariant(auth, "Smoke login failed");
  const session = await findSession(auth.token);
  invariant(session, "Created smoke session could not be read");

  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const counterpartyId = await createCounterparty(session, {
    code: `SMK-${suffix}`,
    kind: "customer",
    name: `런타임 검증 고객 ${suffix}`,
    paymentTermsDays: 30,
    creditLimit: "1000000",
  });
  const otherCustomerId = await createCounterparty(session, {
    code: `SMK-B-${suffix}`,
    kind: "customer",
    name: `런타임 검증 다른 고객 ${suffix}`,
    paymentTermsDays: 30,
    creditLimit: "1000000",
  });
  const siteId = await createCustomerSite(session, {
    counterpartyId,
    code: `SITE-${suffix}`,
    name: `런타임 검증 사업장 ${suffix}`,
    address: "검증 전용 주소",
    contactName: "검증 담당자",
    timezone: "Asia/Seoul",
  });
  const itemId = await createItem(session, {
    sku: `SMK-ITEM-${suffix}`,
    name: `런타임 검증 품목 ${suffix}`,
    kind: "product",
    unit: "EA",
    taxRate: "10",
    salePrice: "10000",
    purchasePrice: "7000",
    trackInventory: true,
    reorderPoint: "1",
  });
  const warehouseId = await createWarehouse(session, {
    code: `SMK-${suffix}`,
    name: `검증 창고 ${suffix}`,
    location: "임시 검증 구역",
  });

  await postInventoryMovement(session, {
    warehouseId,
    itemId,
    movementType: "receipt",
    quantity: "5",
    unitCost: "7000",
    reason: "런타임 입고 검증",
    idempotencyKey: randomUUID(),
  });
  await postInventoryMovement(session, {
    warehouseId,
    itemId,
    movementType: "issue",
    quantity: "2",
    unitCost: "7000",
    reason: "런타임 출고 검증",
    idempotencyKey: randomUUID(),
  });
  const inventory = await listInventory(session.companyId);
  const smokeBalance = inventory.balances.find((row) => row.item_id === itemId && row.warehouse_id === warehouseId);
  invariant(smokeBalance?.on_hand === "3.0000", "Inventory receipt/issue balance is incorrect");

  const today = new Date().toISOString().slice(0, 10);
  const document = await createDocument(session, {
    kind: "quote",
    counterpartyId,
    itemId,
    issueDate: today,
    quantity: "2",
    unitPrice: "10000",
    discountRate: "5",
    taxRate: "10",
    notes: "런타임 문서 상태 검증",
  });
  await transitionDocument(session, document.id, "submitted");
  await transitionDocument(session, document.id, "approved");
  await transitionDocument(session, document.id, "posted");
  const documents = await listDocuments(session.companyId, "quote");
  invariant(documents.some((row) => row.id === document.id && row.status === "posted"), "Document workflow did not reach posted");

  const assetId = await createAsset(session, {
    counterpartyId,
    siteId,
    assetTag: `SMK-AST-${suffix}`,
    vendorAssetId: `ee-${suffix.toLowerCase()}`,
    productName: `런타임 검증 자산 ${suffix}`,
    productFamily: "everrun",
    productModel: "Smoke Platform",
    softwareVersion: "8.0-smoke",
    protectionMode: "ft",
    operatingSystem: "Windows Server Smoke",
    serviceMethod: "hybrid",
    contractStatus: "pending_renewal",
    supportProvider: "Stratus",
    supportUntil: today,
  });
  const service = await createServiceCase(session, {
    counterpartyId,
    assetId,
    caseType: "incident",
    title: `런타임 검증 케이스 ${suffix}`,
    description: "FT 동기화 지연이 반복됩니다.\n진단 로그를 확인해 주세요.",
    severity: "high",
    contactName: "검증 담당자",
    entitlement: "24x7 Demo Support",
    externalProvider: "Stratus",
    externalCaseNumber: `CS-${suffix}`,
    sourceUrl: `https://support.example.invalid/case/${suffix}`,
  });
  await appendServiceCaseActivity(session, { caseId: service.id, kind: "vendor_reply", authorName: "Demo Support", body: "네트워크 오류 카운터와 메모리 사용률을 확인했습니다.\n케이블을 한 개씩 교체해 주세요." });
  await registerServiceCaseAttachment(session, { caseId: service.id, fileName: `diagnostic-${suffix}.zip`, sourceUrl: `https://storage.example.invalid/${suffix}/diagnostic.zip`, contentType: "application/zip", sizeMb: 395 });
  await transitionServiceCase(session, { caseId: service.id, nextStatus: "in_progress" });
  await transitionServiceCase(session, { caseId: service.id, nextStatus: "waiting", waitingReason: "고객 작업 일정 확인 대기" });
  await transitionServiceCase(session, { caseId: service.id, nextStatus: "in_progress" });
  await transitionServiceCase(session, { caseId: service.id, nextStatus: "resolved", resolutionSummary: "런타임 검증 해결" });
  await transitionServiceCase(session, { caseId: service.id, nextStatus: "closed" });
  let mismatchedAssetRejected = false;
  try {
    await createServiceCase(session, { counterpartyId: otherCustomerId, assetId, caseType: "incident", title: "잘못된 고객 자산 연결", severity: "normal" });
  } catch (error) {
    mismatchedAssetRejected = error instanceof Error && error.message.includes("asset mismatch");
  }
  invariant(mismatchedAssetRejected, "A service case accepted an asset owned by another customer");

  const inspection = await createInspection(session, {
    assetId,
    inspectionType: "quarterly",
    scheduledDate: today,
    reportReference: "런타임 점검 양식",
  });
  await transitionInspection(session, { inspectionId: inspection.id, nextStatus: "in_progress" });
  await transitionInspection(session, {
    inspectionId: inspection.id,
    nextStatus: "completed",
    systemHealth: "healthy",
    protectionStatus: "pass",
    syncStatus: "pass",
    serviceStatus: "pass",
    cpuPercent: 21.5,
    memoryPercent: 43.2,
    diskPercent: 51,
    findings: "이상 없음",
    actionItems: "다음 분기 재점검",
  });
  const [assets, cases, caseDetail] = await Promise.all([listAssets(session.companyId), listServiceCases(session.companyId), getServiceCaseDetail(session.companyId, service.id)]);
  invariant(assets.some((row) => row.id === assetId), "Created asset was not listed");
  invariant(cases.some((row) => row.id === service.id && row.status === "closed"), "Service case workflow did not reach closed");
  invariant(caseDetail, "Created service case detail was not found");
  invariant(caseDetail.detail.waiting_reason === null && caseDetail.detail.resolution_summary === "런타임 검증 해결", "Resolved case retained stale waiting state");
  invariant(caseDetail.activities.some((row) => row.kind === "vendor_reply" && row.body.includes("네트워크 오류")), "Service case activity was not preserved");
  invariant(caseDetail.attachments.some((row) => row.file_name === `diagnostic-${suffix}.zip` && row.size_bytes === String(395 * 1024 * 1024)), "Service case attachment metadata was not preserved");
  invariant((await listCustomerSites(session.companyId)).some((row) => row.id === siteId), "Created customer site was not listed");
  invariant((await listInspections(session.companyId)).some((row) => row.id === inspection.id && row.status === "completed"), "Inspection workflow did not reach completed");

  const memberId = await createMember(session, {
    email: `member-${suffix.toLowerCase()}@moarix.local`,
    name: `검증 사용자 ${suffix}`,
    password: "Smoke-Member-Password-42!",
    role: "member",
  });
  await updateMember(session, { userId: memberId, role: "viewer", isActive: true });
  const members = await listMembers(session.companyId);
  invariant(members.some((row) => row.user_id === memberId && row.role === "viewer"), "Member role update was not listed");
  let lastOwnerProtected = false;
  try {
    await updateMember(session, { userId: session.userId, role: "owner", isActive: false });
  } catch (error) {
    lastOwnerProtected = error instanceof Error && error.message.includes("last active owner");
  }
  invariant(lastOwnerProtected, "Last active owner protection did not reject deactivation");

  const [dashboard, reports, audit] = await Promise.all([
    getDashboard(session.companyId),
    getStandardReports(session.companyId),
    listAuditLogs(session.companyId),
  ]);
  invariant(dashboard.documents.length > 0, "Dashboard document query returned no rows");
  invariant(reports.documentSummary.length > 0, "Standard report query returned no rows");
  invariant(reports.supportSummary.length > 0, "Support coverage report returned no rows");
  invariant(reports.inspectionSummary.length > 0, "Inspection report returned no rows");
  invariant(audit.some((row) => row.action === "document.status_changed"), "Audit trail missed document state changes");

  const database = await getDatabase();
  const missingEmail = `missing-${suffix.toLowerCase()}@moarix.local`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    invariant(await authenticate(missingEmail, "invalid-password") === null, "Missing account unexpectedly authenticated");
  }
  const limiter = await database.query<{ attempt_count: number; blocked: boolean }>(
    `SELECT attempt_count, COALESCE(blocked_until > now(), false) AS blocked
     FROM login_attempts WHERE identifier_hash = $1`,
    [hashSessionToken(`login:${missingEmail}`)],
  );
  invariant(limiter.rows[0]?.attempt_count === 5 && limiter.rows[0].blocked, "Login throttling did not block the fifth failure");
  await database.close();
  return { token: auth.token, serviceCaseId: service.id };
}

async function waitUntilReady(origin: string, logs: () => string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`, { redirect: "manual" });
      const payload = response.ok ? await response.json() as { status?: string } : null;
      if (response.ok && payload?.status === "ok") return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready.\n${logs()}`);
}

async function exerciseHttp(token: string, serviceCaseId: string) {
  const origin = `http://127.0.0.1:${port}`;
  const nextBinary = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBinary, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", COOKIE_SECURE: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  try {
    await waitUntilReady(origin, () => output);
    const login = await fetch(`${origin}/login`);
    invariant(login.ok && (await login.text()).includes("안전하게 로그인"), "Public login page smoke failed");

    const cookie = `moarix_session=${token}; __Host-moarix_session=${token}`;
    const pages: Array<[string, string]> = [
      ["/dashboard", "대시보드"],
      ["/counterparties", "거래처"],
      ["/items", "품목"],
      ["/warehouses", "창고"],
      ["/documents/quote", "견적"],
      ["/inventory", "재고·원장"],
      ["/sites", "고객 사업장"],
      ["/assets", "자산·지원 계약"],
      ["/inspections", "정기점검"],
      ["/service", "서비스 케이스"],
      [`/service/${serviceCaseId}`, "서비스 케이스 상세"],
      ["/reports", "표준·운영 보고서"],
      ["/admin/users", "사용자·역할"],
      ["/admin/audit", "감사 로그"],
    ];
    for (const [pathname, expected] of pages) {
      const response = await fetch(`${origin}${pathname}`, { headers: { cookie }, redirect: "manual" });
      const body = await response.text();
      const visibleText = body
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      invariant(
        response.ok && body.includes(`<title>${expected} | MOARIX</title>`),
        `${pathname} runtime smoke failed with ${response.status}: ${visibleText.slice(0, 1_500)}`,
      );
    }
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
}

const smoke = await exerciseDomain();
await exerciseHttp(smoke.token, smoke.serviceCaseId);
console.info("Runtime smoke passed: domain workflows, auth hardening and 14 authenticated pages verified.");
