import { describe, expect, it } from "vitest";
import { allocatePayment, agingBucket, remainingOpen } from "./settlement";

describe("settlement allocation", () => {
  it("allocates FIFO across open invoices with Decimal precision", () => {
    const result = allocatePayment("15000", [
      { id: "inv-1", openAmount: "10000.0000" },
      { id: "inv-2", openAmount: "8000.0000" },
    ]);
    expect(result).toEqual([
      { id: "inv-1", applied: "10000.0000" },
      { id: "inv-2", applied: "5000.0000" },
    ]);
  });

  it("rejects over-allocation", () => {
    expect(() => allocatePayment("10", [{ id: "inv-1", openAmount: "5" }, { id: "inv-2", openAmount: "4" }])).toThrow();
  });

  it("classifies aging buckets from due date", () => {
    expect(agingBucket("2026-08-01", "2026-08-28")).toBe("1_30");
    expect(agingBucket("2026-07-01", "2026-08-28")).toBe("31_60");
    expect(agingBucket("2026-08-28", "2026-08-28")).toBe("current");
    expect(agingBucket(null, "2026-08-28")).toBe("current");
  });

  it("computes remaining open after allocation", () => {
    expect(remainingOpen("10990.0000", "1990.0000")).toBe("9000.0000");
  });
});
