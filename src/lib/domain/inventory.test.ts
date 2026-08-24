import { describe, expect, it } from "vitest";
import { applyStockMovement, availableQuantity } from "./inventory";

describe("inventory invariants", () => {
  it("tracks receipts, reservations and issues", () => {
    const received = applyStockMovement({ onHand: "0", reserved: "0" }, "receipt", "10");
    const reserved = applyStockMovement(received, "reservation", "4");
    expect(availableQuantity(reserved)).toBe("6.0000");
    expect(applyStockMovement(reserved, "issue", "3")).toEqual({ onHand: "7.0000", reserved: "4.0000" });
  });

  it("blocks negative or over-reserved stock", () => {
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "issue", "2")).toThrow("Negative stock");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "reservation", "2")).toThrow("cannot exceed");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "release", "1")).toThrow("cannot be negative");
  });

  it("supports signed adjustments and reversals", () => {
    expect(applyStockMovement({ onHand: "5", reserved: "0" }, "adjustment", "-2").onHand).toBe("3.0000");
    expect(applyStockMovement({ onHand: "5", reserved: "0" }, "reversal", "2").onHand).toBe("7.0000");
  });

  it("handles transfers and validates movement direction", () => {
    const inbound = applyStockMovement({ onHand: "2", reserved: "0" }, "transfer_in", "3");
    expect(applyStockMovement(inbound, "transfer_out", "1").onHand).toBe("4.0000");
    expect(applyStockMovement({ onHand: "5", reserved: "2" }, "release", "1").reserved).toBe("1.0000");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "receipt", "-1")).toThrow("positive");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "issue", "-1")).toThrow("positive");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "reservation", "-1")).toThrow("positive");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "release", "-1")).toThrow("positive");
    expect(() => applyStockMovement({ onHand: "1", reserved: "0" }, "adjustment", "0")).toThrow("zero");
  });
});
