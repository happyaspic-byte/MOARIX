import { describe, expect, it } from "vitest";
import { buildTaxInvoicePayload, UnsupportedTaxInvoiceProviderError } from "./tax-invoice-adapter";

describe("tax invoice adapter boundary", () => {
  it("builds a provider-neutral payload from a posted invoice", () => {
    const payload = buildTaxInvoicePayload({
      number: "INV-2026-00001",
      issueDate: "2026-08-28",
      counterpartyName: "대한제조(주)",
      grandTotal: "11000.0000",
      taxTotal: "1000.0000",
    });
    expect(payload.documentNumber).toBe("INV-2026-00001");
    expect(payload.provider).toBe("none");
  });

  it("refuses real provider dispatch until contracted", () => {
    expect(() => buildTaxInvoicePayload({
      number: "INV-2026-00001",
      issueDate: "2026-08-28",
      counterpartyName: "대한제조(주)",
      grandTotal: "11000.0000",
      taxTotal: "1000.0000",
      provider: "hometax",
    })).toThrow(UnsupportedTaxInvoiceProviderError);
  });
});
