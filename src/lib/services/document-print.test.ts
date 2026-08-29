import { describe, expect, it } from "vitest";
import { generateDocumentHtml } from "./document-print";

describe("document print", () => {
  it("renders Korean invoice HTML with line totals", () => {
    const html = generateDocumentHtml({
      kindLabel: "매출 청구",
      number: "INV-2026-00001",
      counterpartyName: "대한제조(주)",
      issueDate: "2026-08-28",
      dueDate: "2026-09-27",
      notes: "설치 포함",
      currency: "KRW",
      subtotal: "10000.0000",
      taxTotal: "1000.0000",
      grandTotal: "11000.0000",
      lines: [
        { name: "정기점검", sku: "SVC-001", quantity: "1", unitPrice: "10000", taxRate: "10", grossAmount: "11000" },
      ],
    });
    expect(html).toContain("매출 청구");
    expect(html).toContain("INV-2026-00001");
    expect(html).toContain("대한제조(주)");
    expect(html).toContain("정기점검");
  });
});
