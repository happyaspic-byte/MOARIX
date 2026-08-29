import { describe, expect, it } from "vitest";
import { conversionLabel, nextDocumentKind } from "./document-conversion";

describe("document conversion", () => {
  it("maps quote to sales order and sales order to shipment", () => {
    expect(nextDocumentKind("quote")).toBe("sales_order");
    expect(nextDocumentKind("sales_order")).toBe("shipment");
    expect(nextDocumentKind("shipment")).toBe("invoice");
    expect(conversionLabel("quote")).toBe("수주로 전환");
    expect(conversionLabel("sales_order")).toBe("출고로 전환");
  });

  it("maps purchase order to receipt and receipt to bill", () => {
    expect(nextDocumentKind("purchase_order")).toBe("receipt");
    expect(nextDocumentKind("receipt")).toBe("bill");
    expect(conversionLabel("purchase_order")).toBe("입고로 전환");
  });

  it("rejects terminal document kinds", () => {
    expect(nextDocumentKind("invoice")).toBeNull();
    expect(nextDocumentKind("bill")).toBeNull();
  });
});
