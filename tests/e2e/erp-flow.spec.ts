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
    ["/assets", "자산·지원 계약"],
    ["/inspections", "정기점검"],
    ["/service", "장애·지원 케이스"],
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
  await expect(page.locator(".data-table").getByText(vendorAssetId)).toBeVisible();
  await expect(page.locator(".data-table").getByText("미계약")).toBeVisible();

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

test("keeps core navigation usable on a mobile viewport", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await page.getByRole("link", { name: "재고·원장" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { level: 1, name: "재고·원장" })).toBeVisible();
});
