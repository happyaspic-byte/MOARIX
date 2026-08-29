import { describe, expect, it } from "vitest";
import { buildSupportContractChain, nextRevisionNumber } from "./support-contract-chain";

describe("support contract chain", () => {
  it("orders customer, partner, and Stratus tiers", () => {
    const chain = buildSupportContractChain([
      { scope: "vendor_support", providerName: "Stratus", recipientName: "Partner" },
      { scope: "customer_support", providerName: "MOARIX", recipientName: "Customer" },
      { scope: "partner_support", providerName: "Partner", recipientName: "MOARIX" },
    ]);

    expect(chain.map((item) => item.scope)).toEqual([
      "customer_support",
      "partner_support",
      "vendor_support",
    ]);
    expect(chain.map((item) => item.tier)).toEqual([1, 2, 3]);
  });

  it("assigns the next immutable renewal revision", () => {
    expect(nextRevisionNumber([])).toBe(1);
    expect(nextRevisionNumber([{ revisionNumber: 1 }, { revisionNumber: 3 }])).toBe(4);
  });
});
