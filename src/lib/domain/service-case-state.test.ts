import { describe, expect, it } from "vitest";
import { allowedServiceCaseTransitions, assertServiceCaseTransition } from "./service-case-state";

describe("service case state", () => {
  it("supports the normal receive-to-close workflow", () => {
    expect(() => assertServiceCaseTransition("open", "in_progress")).not.toThrow();
    expect(() => assertServiceCaseTransition("in_progress", "resolved")).not.toThrow();
    expect(() => assertServiceCaseTransition("resolved", "closed")).not.toThrow();
  });

  it("allows waiting and reopening before closure", () => {
    expect(allowedServiceCaseTransitions("waiting")).toEqual(["in_progress", "resolved"]);
    expect(() => assertServiceCaseTransition("resolved", "in_progress")).not.toThrow();
  });

  it("keeps closed cases final and rejects skipped states", () => {
    expect(() => assertServiceCaseTransition("closed", "in_progress")).toThrow("Invalid service case transition");
    expect(() => assertServiceCaseTransition("open", "closed")).toThrow("Invalid service case transition");
  });
});
