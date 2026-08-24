import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "admin@moarix.local";
const password = process.env.E2E_PASSWORD;
const sessionCookieNames = new Set(["moarix_session", "__Host-moarix_session"]);

async function login(page: Page, expectedPath = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(expectedPath)}`);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await expect(page).toHaveURL((url) => url.pathname === expectedPath);
}

async function expectNoHighImpactAccessibilityViolations(page: Page, context: string) {
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const highImpact = accessibility.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  const details = highImpact.map((violation) => {
    const targets = violation.nodes.flatMap((node) => node.target).join(", ");
    return `[${violation.impact}] ${violation.id}: ${violation.help}${targets ? ` (${targets})` : ""}`;
  }).join("\n");
  expect(highImpact, `${context}\n${details}`).toEqual([]);
}

async function expectNoDocumentHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(
    Math.max(dimensions.body, dimensions.root),
    `${context}: document width ${Math.max(dimensions.body, dimensions.root)}px exceeds ${dimensions.viewport}px viewport`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("rejects invalid credentials without issuing a session", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");

  await page.goto("/login");
  await expect(page).toHaveTitle("로그인 | MOARIX");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("incorrect-password");
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "이메일 또는 비밀번호가 올바르지 않습니다." }),
  ).toHaveText("이메일 또는 비밀번호가 올바르지 않습니다.");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  expect(
    (await page.context().cookies()).filter((cookie) => sessionCookieNames.has(cookie.name)),
  ).toEqual([]);
});

test("authenticates and keeps ERP navigation accessible", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");

  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("업무 현황입니다");
  const sessionCookie = (await page.context().cookies()).find((cookie) => sessionCookieNames.has(cookie.name));
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const critical = accessibility.violations.filter((violation) => violation.impact === "critical");
  expect(critical, critical.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);

  const routes: Array<[string, string]> = [
    ["/counterparties", "거래처"],
    ["/items", "품목"],
    ["/warehouses", "창고"],
    ["/documents/quote", "견적"],
    ["/documents/sales_order", "수주"],
    ["/documents/purchase_order", "발주"],
    ["/documents/invoice", "매출 청구"],
    ["/documents/bill", "매입 청구"],
    ["/inventory", "재고·원장"],
    ["/sites", "고객 사업장"],
    ["/assets", "Stratus 자산 운영"],
    ["/inspections", "정기점검"],
    ["/service", "서비스 케이스"],
    ["/reports", "표준·운영 보고서"],
    ["/admin/users", "사용자·역할"],
    ["/admin/audit", "감사 로그"],
  ];
  for (const [route, title] of routes) {
    await page.goto(route);
    await expect(page).toHaveURL((url) => url.pathname === route);
    await expect(page).toHaveTitle(`${title} | MOARIX`);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("validates the seeded Stratus asset 360 workspace and risk-first queue", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await login(page, "/assets");

  await page.goto("/assets?q=ee-demo-001&q=ignored");
  await expect(page.getByRole("heading", { level: 1, name: "Stratus 자산 운영" })).toBeVisible();
  await expect(page.getByLabel("통합 검색")).toHaveValue("ee-demo-001");
  await page.goto("/assets");

  const desktopTable = page.locator(".asset-desktop-table");
  const queueRows = desktopTable.locator("tbody tr");
  await expect(queueRows.first()).toContainText("zen-demo-002");
  await expect(queueRows.first().locator(".status-not_contracted")).toHaveText("미계약");
  await expect(page.getByText(/지원 위험 우선/)).toBeVisible();

  await page.getByLabel("통합 검색").fill("ee-demo-001");
  await page.getByRole("button", { name: "검색 적용" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/assets" && url.searchParams.get("q") === "ee-demo-001");
  await expect(queueRows).toHaveCount(1);
  const assetLink = desktopTable.getByRole("link", { name: "ee-demo-001", exact: true });
  await expect(assetLink).toBeVisible();
  await expectNoHighImpactAccessibilityViolations(page, "Stratus asset queue accessibility");

  await assetLink.click();
  await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/);
  const assetPath = new URL(page.url()).pathname;
  const assetId = assetPath.split("/").at(-1)!;
  await expect(page).toHaveTitle("Stratus 자산 상세 | MOARIX");
  await expect(page.getByRole("heading", { level: 1, name: "everRun Enterprise 이중화 시스템" })).toBeVisible();
  await expect(page.locator(".asset-hero-main")).toContainText("합성 생산 실행 시스템");

  const tabs = page.getByRole("navigation", { name: "자산 상세 메뉴" });
  await expect(tabs.getByRole("link", { name: "개요" })).toHaveAttribute("aria-current", "page");
  await expectNoHighImpactAccessibilityViolations(page, "Stratus asset overview accessibility");

  await tabs.getByRole("link", { name: "노드·네트워크" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "infrastructure");
  const nodeTable = page.getByRole("table", { name: "노드 구성" });
  await expect(nodeTable.getByText("DEMO-NODE0", { exact: true })).toBeVisible();
  await expect(nodeTable.getByText("DEMO-NODE1", { exact: true })).toBeVisible();
  await expect(page.getByText("A-Link Node0", { exact: true })).toBeVisible();
  await expect(page.getByText("A-Link Node1", { exact: true })).toBeVisible();
  await expect(page.getByText("198.51.100.21", { exact: true })).toBeVisible();

  await tabs.getByRole("link", { name: "가상 머신" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "vms");
  await expect(page.getByText("DEMO-FT-APP", { exact: true })).toBeVisible();
  await expect(page.getByText(/8 vCPU · 32(?:\.00)? GB · 256(?:\.00)? GB/)).toBeVisible();

  await tabs.getByRole("link", { name: "계약·라이선스" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "contracts");
  await expect(page.getByText("SYN-CUST-SUP-0001", { exact: true })).toBeVisible();
  await expect(page.getByText("SYN-VEND-SUP-0001", { exact: true })).toBeVisible();
  await expect(page.getByText("everRun Enterprise Synthetic", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Guest OS Subscription", { exact: true })).toBeVisible();
  await expect(page.getByText("DEMO-ONLY", { exact: false })).toBeVisible();
  await expectNoHighImpactAccessibilityViolations(page, "Stratus contract and license accessibility");

  await tabs.getByRole("link", { name: "점검" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "inspections");
  await expect(page.getByText("INSP-DEMO-00001", { exact: true })).toBeVisible();
  await expect(page.getByText("Protection 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("메모리 사용률", { exact: true })).toBeVisible();

  await tabs.getByRole("link", { name: "케이스" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "cases");
  const seededCase = page.getByRole("link", { name: "FT VM 메모리 동기화 지연", exact: true });
  await expect(seededCase).toBeVisible();
  await seededCase.click();
  await expect(page.getByRole("heading", { level: 2, name: "Task Watch List" })).toBeVisible();
  const watcherRow = page.locator("tr").filter({ hasText: "demo-operations@example.invalid" });
  await expect(watcherRow).toContainText("합성 운영 배포 목록");
  await expect(watcherRow).toContainText("배포 목록");
  await expect(page.getByRole("link", { name: "demo-operations@example.invalid" })).toHaveAttribute(
    "href",
    "mailto:demo-operations@example.invalid",
  );
  await expectNoHighImpactAccessibilityViolations(page, "Stratus service case watcher accessibility");

  await page.goto(assetPath);
  await page.locator(".page-actions").getByRole("link", { name: "케이스 접수" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/service"
    && url.searchParams.get("assetId") === assetId
    && url.searchParams.get("create") === "1");
  let drawer = page.locator(".create-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("관련 자산")).toHaveValue(assetId);
  await expect(drawer.getByLabel("관련 자산").locator("option:checked")).toContainText("ee-demo-001");

  await page.goto(assetPath);
  await page.locator(".page-actions").getByRole("link", { name: "점검 예약" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/inspections"
    && url.searchParams.get("assetId") === assetId
    && url.searchParams.get("create") === "1");
  drawer = page.locator(".create-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("점검 자산 *")).toHaveValue(assetId);
  await expect(drawer.getByLabel("점검 자산 *").locator("option:checked")).toContainText("ee-demo-001");
});

test("keeps the Stratus asset workspace accessible without mobile document overflow", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/assets");

  const mobileList = page.locator(".asset-mobile-list");
  await expect(mobileList).toBeVisible();
  await expect(page.locator(".asset-desktop-table")).toBeHidden();
  await expectNoDocumentHorizontalOverflow(page, "mobile Stratus asset queue");
  await expectNoHighImpactAccessibilityViolations(page, "mobile Stratus asset queue accessibility");

  const seededAssetCard = mobileList.locator("article").filter({ hasText: "ee-demo-001" });
  await expect(seededAssetCard).toBeVisible();
  await seededAssetCard.getByRole("link", { name: "자산 워크스페이스 열기" }).click();
  await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/);
  const assetPath = new URL(page.url()).pathname;
  await expectNoDocumentHorizontalOverflow(page, "mobile Stratus asset overview");

  const tabs = page.getByRole("navigation", { name: "자산 상세 메뉴" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "노드·네트워크" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "infrastructure");
  await expect(page.getByText("A-Link Node0", { exact: true })).toBeVisible();
  await expectNoDocumentHorizontalOverflow(page, "mobile Stratus infrastructure tab");

  await tabs.getByRole("link", { name: "계약·라이선스" }).click();
  await expect(page).toHaveURL((url) => url.pathname === assetPath && url.searchParams.get("tab") === "contracts");
  await expect(page.getByText("everRun Enterprise Synthetic", { exact: true })).toBeVisible();
  await expectNoDocumentHorizontalOverflow(page, "mobile Stratus contracts tab");
  await expectNoHighImpactAccessibilityViolations(page, "mobile Stratus contract and license accessibility");
});

test("creates a counterparty through the browser", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await login(page, "/counterparties");

  const suffix = Date.now().toString(36).toUpperCase();
  await page.locator("summary", { hasText: "거래처 등록" }).click();
  const drawer = page.locator(".create-drawer");
  await drawer.getByLabel("거래처 코드 *").fill(`E2E-${suffix}`);
  await drawer.getByLabel("거래처명 *").fill(`브라우저 검증 고객 ${suffix}`);
  await drawer.getByRole("button", { name: "거래처 등록" }).click();
  await expect(page.getByText("거래처를 등록했습니다.")).toBeVisible();
  await expect(page.getByText(`브라우저 검증 고객 ${suffix}`)).toBeVisible();
});

test("connects a customer site, Stratus asset and inspection", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await login(page, "/counterparties");

  const suffix = Date.now().toString(36).toUpperCase();
  const customerName = `운영 검증 고객 ${suffix}`;
  const siteName = `검증 1공장 ${suffix}`;
  const assetTag = `OPS-${suffix}`;
  const vendorAssetId = `ee-${suffix.toLowerCase()}`;

  await page.locator("summary", { hasText: "거래처 등록" }).click();
  let drawer = page.locator(".create-drawer");
  await drawer.getByLabel("거래처 코드 *").fill(`OPS-${suffix}`);
  await drawer.getByLabel("거래처명 *").fill(customerName);
  await drawer.getByRole("button", { name: "거래처 등록" }).click();
  await expect(page.locator(".data-table").getByText(customerName)).toBeVisible();

  await page.goto("/sites");
  await page.locator("summary", { hasText: "사업장 등록" }).click();
  drawer = page.locator(".create-drawer");
  await drawer.getByLabel("고객사 *").selectOption({ label: `OPS-${suffix} · ${customerName}` });
  await drawer.getByLabel("사업장 코드 *").fill(`PLANT-${suffix}`);
  await drawer.getByLabel("사업장명 *").fill(siteName);
  await drawer.getByRole("button", { name: "사업장 등록" }).click();
  await expect(page.locator(".data-table").getByText(siteName)).toBeVisible();

  await page.goto("/assets");
  await page.locator("summary", { hasText: "자산 등록" }).click();
  drawer = page.locator(".create-drawer");
  await drawer.getByLabel("고객사 *").selectOption({ label: `OPS-${suffix} · ${customerName}` });
  await drawer.getByLabel("사업장 *").selectOption({ label: `PLANT-${suffix} · ${siteName}` });
  await drawer.getByLabel("내부 자산 태그 *").fill(assetTag);
  await drawer.getByLabel("Stratus Asset ID").fill(vendorAssetId);
  await drawer.getByLabel("제품명 *").fill("everRun 운영 검증 시스템");
  await drawer.getByLabel("계약 상태 *").selectOption("not_contracted");
  await drawer.getByRole("button", { name: "자산 등록" }).click();
  const assetRow = page.locator(".data-table tbody tr").filter({ hasText: vendorAssetId });
  await expect(assetRow.getByText(vendorAssetId)).toBeVisible();
  await expect(assetRow.locator(".status-not_contracted")).toHaveText("미계약");

  await page.goto("/inspections");
  await page.locator("summary", { hasText: "점검 예약" }).click();
  drawer = page.locator(".create-drawer");
  await drawer.getByLabel("점검 자산 *").selectOption({ label: `${customerName} · ${siteName} · ${vendorAssetId}` });
  await drawer.getByLabel("예정일 *").fill(new Date().toISOString().slice(0, 10));
  await drawer.getByRole("button", { name: "점검 일정 등록" }).click();
  await expect(page.locator(".data-table").getByText(assetTag)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});

test("creates and operates a detailed service case", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await login(page, "/service");

  const suffix = Date.now().toString(36).toUpperCase();
  const title = `FT 동기화 브라우저 검증 ${suffix}`;
  await page.locator("summary", { hasText: "케이스 접수" }).click();
  let panel = page.locator(".create-drawer");
  await panel.getByLabel("고객사 *").selectOption({ label: "CUST-001 · 한빛 제조" });
  await panel.getByLabel("관련 자산").selectOption({ label: "ee-demo-001 · 창원 1공장 · everRun Enterprise 이중화 시스템" });
  await panel.getByLabel("케이스 유형 *").selectOption("incident");
  await panel.getByLabel("심각도 *").selectOption("high");
  await panel.getByLabel("제목 *").fill(title);
  await panel.getByLabel("최초 문의·장애 내용").fill("FT 메모리 동기화가 지연됩니다.\n가용성 링크와 메모리 사용률을 확인해 주세요.");
  await panel.getByLabel("고객 담당자").fill("브라우저 검증 담당자");
  await panel.getByLabel("지원 권한·Entitlement").fill("Demo Support 24x7");
  await panel.getByLabel("외부 지원사").fill("Demo Support");
  await panel.getByLabel("외부 케이스 번호").fill(`EXT-${suffix}`);
  await panel.getByLabel("외부 원문 HTTPS 주소").fill(`https://support.example.invalid/case/${suffix}`);
  await panel.getByRole("button", { name: "케이스 접수" }).click();
  const caseLink = page.getByRole("link", { name: title });
  await expect(caseLink).toBeVisible();
  await caseLink.click();
  await expect(page).toHaveURL(/\/service\/[0-9a-f-]+$/);
  await expect(page).toHaveTitle("서비스 케이스 상세 | MOARIX");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("FT 메모리 동기화가 지연됩니다.")).toBeVisible();

  await page.locator("summary", { hasText: "활동 기록" }).click();
  panel = page.locator(".case-entry-popover");
  await panel.getByLabel("활동 유형 *").selectOption("vendor_reply");
  await panel.getByLabel("외부 작성자 *").fill("Demo Support Engineer");
  await panel.getByLabel("내용 *").fill("패킷 오류를 확인했습니다.\n케이블을 한 개씩 교체해 주세요.");
  await panel.getByRole("button", { name: "활동 기록" }).click();
  await expect(page.getByText("패킷 오류를 확인했습니다.")).toBeVisible();

  await page.locator("summary", { hasText: "첨부 링크 등록" }).click();
  panel = page.locator(".case-entry-popover");
  await panel.getByLabel("파일명 *").fill(`diagnostic-${suffix}.zip`);
  await panel.getByLabel("HTTPS 다운로드 주소 *").fill(`https://storage.example.invalid/${suffix}/diagnostic.zip`);
  await panel.getByLabel("MIME 유형").fill("application/zip");
  await panel.getByLabel("파일 크기 (MB)").fill("395");
  await panel.getByRole("button", { name: "첨부 링크 등록" }).click();
  const attachment = page.locator(".attachment-item").filter({ hasText: `diagnostic-${suffix}.zip` });
  await expect(attachment).toBeVisible();
  await expect(attachment).toContainText("395.00 MB");

  await page.getByRole("button", { name: "처리 시작" }).click();
  await expect(page.locator(".status-in_progress").first()).toHaveText("처리 중");

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});

test("keeps core navigation usable on a mobile viewport", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await page.getByRole("link", { name: "재고·원장" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { level: 1, name: "재고·원장" })).toBeVisible();
});
