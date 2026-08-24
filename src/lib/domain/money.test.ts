import { describe, expect, it } from "vitest";
import { calculateLine, currencyScale, formatMoney, sumLineAmounts } from "./money";

describe("money calculations", () => {
  it("rounds KRW tax with half-up semantics", () => {
    expect(calculateLine({ quantity: "3", unitPrice: "333", taxRate: "10", currency: "KRW" })).toEqual({
      net: "999.0000",
      discount: "0.0000",
      tax: "100.0000",
      gross: "1099.0000",
    });
  });

  it("calculates discount before tax", () => {
    expect(calculateLine({ quantity: "2", unitPrice: "10000", discountRate: "5", taxRate: "10" })).toEqual({
      net: "19000.0000",
      discount: "1000.0000",
      tax: "1900.0000",
      gross: "20900.0000",
    });
  });

  it("sums exact decimal strings", () => {
    const totals = sumLineAmounts([
      { net: "0.1000", discount: "0", tax: "0.0100", gross: "0.1100" },
      { net: "0.2000", discount: "0", tax: "0.0200", gross: "0.2200" },
    ]);
    expect(totals.net.toFixed(4)).toBe("0.3000");
    expect(totals.gross.toFixed(4)).toBe("0.3300");
  });

  it("rejects invalid quantities and rates", () => {
    expect(() => calculateLine({ quantity: "0", unitPrice: "1" })).toThrow();
    expect(() => calculateLine({ quantity: "1", unitPrice: "-1" })).toThrow();
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", taxRate: "101" })).toThrow();
  });

  it("formats supported currencies", () => {
    expect(currencyScale("KRW")).toBe(0);
    expect(currencyScale("USD")).toBe(2);
    expect(formatMoney("1234", "KRW")).toContain("1,234");
    expect(formatMoney("1.2345", "")).toContain("1.2345");
    expect(currencyScale("ABC")).toBe(2);
  });

  it("validates discount and negative tax rates", () => {
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", discountRate: "-1" })).toThrow();
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", discountRate: "101" })).toThrow();
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", taxRate: "-1" })).toThrow();
  });
});
