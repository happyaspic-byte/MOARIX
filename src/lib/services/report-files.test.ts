import { describe, expect, it } from "vitest";
import { generateInspectionExcelXml, generateInspectionPdf } from "./report-files";

const report = {
  number: "INS-2026-0001",
  customer_name: "Synthetic Customer",
  site_name: "Synthetic Site",
  asset_tag: "SYN-ASSET-001",
  product_name: "Stratus ftServer",
  inspection_type: "quarterly",
  scheduled_date: "2026-08-28",
  completed_at: "2026-08-28T09:00:00Z",
  engineer_name: "Synthetic Engineer",
  system_health: "healthy",
  protection_status: "pass",
  sync_status: "pass",
  service_status: "pass",
  cpu_percent: "24",
  memory_percent: "48",
  disk_percent: "62",
  findings: "No findings",
  action_items: "None",
  customer_confirmed_by: "Synthetic Customer Lead",
  customer_confirmed_at: "2026-08-28T10:00:00Z",
  checks: [{ category: "availability", label: "Protection", result: "pass", observed_value: "FT Duplex" }],
};

describe("inspection report files", () => {
  it("generates Excel 2003 XML workbook", () => {
    const xml = generateInspectionExcelXml(report);
    expect(xml).toContain("<?mso-application progid=\"Excel.Sheet\"?>");
    expect(xml).toContain("INS-2026-0001");
    expect(xml).toContain("FT Duplex");
  });

  it("generates a valid PDF byte stream", () => {
    const pdf = generateInspectionPdf(report);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
    expect(pdf.byteLength).toBeGreaterThan(300);
  });
});
