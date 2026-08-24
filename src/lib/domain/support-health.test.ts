import { describe, expect, it } from "vitest";
import { formatSupportHealth, getSupportHealth } from "./support-health";

describe("support health", () => {
  const today = "2026-08-24";

  it.each([
    ["2026-11-22", "expiring", 90],
    ["2026-11-23", "covered", 91],
    ["2026-08-24", "expiring", 0],
    ["2026-08-23", "expired", -1],
  ] as const)("classifies %s as %s", (supportUntil, state, daysRemaining) => {
    expect(getSupportHealth({ contractStatus: "active", supportUntil }, today)).toEqual({ state, daysRemaining });
  });

  it("distinguishes a missing date from an explicit no-contract state", () => {
    expect(getSupportHealth({ contractStatus: "active" }, today).state).toBe("unknown");
    expect(getSupportHealth({ contractStatus: "not_contracted" }, today).state).toBe("not_contracted");
  });

  it("excludes retired assets from operational alerts", () => {
    expect(getSupportHealth({ contractStatus: "expired", supportUntil: "2020-01-01", assetStatus: "retired" }, today).state).toBe("retired");
  });

  it("formats expiry boundaries with readable D-day text", () => {
    expect(formatSupportHealth(getSupportHealth({ contractStatus: "active", supportUntil: "2026-09-02" }, today))).toBe("D-9");
    expect(formatSupportHealth(getSupportHealth({ contractStatus: "active", supportUntil: "2026-08-20" }, today))).toBe("D+4");
  });
});
