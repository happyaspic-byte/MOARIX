import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "admin@moarix.local";
const password = process.env.E2E_PASSWORD;

test.describe.configure({ mode: "serial" });

test("authentication, accessibility and ERP navigation", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");

  await page.goto("/login");
  await expect(page).toHaveTitle("로그인 | MOARIX");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("incorrect-password");
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();

  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("업무 현황입니다");

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
    ["/assets", "고객 자산"],
    ["/service", "서비스 케이스"],
    ["/reports", "표준 보고서"],
    ["/admin/users", "사용자·역할"],
    ["/admin/audit", "감사 로그"],
  ];
  for (const [route, title] of routes) {
    await page.goto(route);
    await expect(page).toHaveTitle(`${title} | MOARIX`);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("creates a counterparty through the browser", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await page.goto("/counterparties");

  const suffix = Date.now().toString(36).toUpperCase();
  await page.locator("summary", { hasText: "거래처 등록" }).click();
  const drawer = page.locator(".create-drawer");
  await drawer.getByLabel("거래처 코드 *").fill(`E2E-${suffix}`);
  await drawer.getByLabel("거래처명 *").fill(`브라우저 검증 고객 ${suffix}`);
  await drawer.getByRole("button", { name: "거래처 등록" }).click();
  await expect(page.getByText("거래처를 등록했습니다.")).toBeVisible();
  await expect(page.getByText(`브라우저 검증 고객 ${suffix}`)).toBeVisible();
});

test("keeps core navigation usable on a mobile viewport", async ({ page }) => {
  test.skip(!password, "E2E_PASSWORD is required");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "안전하게 로그인" }).click();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await page.getByRole("link", { name: "재고·원장" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { level: 1, name: "재고·원장" })).toBeVisible();
});
