import { describe, expect, it } from "vitest";
import { generateInspectionHtmlReport, generateInspectionCsvReport } from "./inspection-report";

describe("inspection-report", () => {
  const sampleInspection = {
    number: "INS-2026-0001",
    customer_name: "대한제조(주)",
    site_name: "판교 제1공장",
    asset_tag: "AST-STRATUS-001",
    product_name: "Stratus ftServer 2910",
    inspection_type: "quarterly",
    scheduled_date: "2026-08-28",
    completed_at: "2026-08-28T14:30:00Z",
    engineer_name: "홍길동 엔지니어",
    system_health: "healthy",
    protection_status: "pass",
    sync_status: "pass",
    service_status: "pass",
    cpu_percent: "24",
    memory_percent: "48",
    disk_percent: "62",
    findings: "하드웨어 및 시스템 특이사항 없음, 안정 운영 중",
    action_items: "다음 분기 팬 필터 청소 권장",
    customer_confirmed_by: "김고객 팀장",
    customer_confirmed_at: "2026-08-28T16:00:00Z",
    checks: [
      { category: "availability", label: "Protection 상태", result: "pass", observed_value: "FT Duplex" },
      { category: "availability", label: "동기화 상태", result: "pass", observed_value: "In Sync" },
      { category: "resources", label: "CPU 사용률", result: "pass", observed_value: "24%" },
    ],
  };

  it("generates structured HTML print/PDF report with customer sign-off", () => {
    const html = generateInspectionHtmlReport(sampleInspection);
    expect(html).toContain("정기점검 보고서");
    expect(html).toContain("INS-2026-0001");
    expect(html).toContain("대한제조(주)");
    expect(html).toContain("Stratus ftServer 2910");
    expect(html).toContain("김고객 팀장");
    expect(html).toContain("FT Duplex");
  });

  it("generates CSV export for inspection checks and metrics", () => {
    const csv = generateInspectionCsvReport(sampleInspection);
    expect(csv).toContain("점검번호");
    expect(csv).toContain("INS-2026-0001");
    expect(csv).toContain("Protection 상태");
  });
});
