import { describe, expect, it } from "vitest";
import { allowedInspectionTransitions, assertInspectionTransition } from "./inspection-state";

describe("inspection state", () => {
  it("supports scheduled, active and completed inspections", () => {
    expect(() => assertInspectionTransition("scheduled", "in_progress")).not.toThrow();
    expect(() => assertInspectionTransition("in_progress", "completed")).not.toThrow();
  });

  it("can record an issue and resume corrective work", () => {
    expect(allowedInspectionTransitions("issue_found")).toEqual(["in_progress", "completed"]);
  });

  it("keeps completed and cancelled work final", () => {
    expect(() => assertInspectionTransition("completed", "in_progress")).toThrow("Invalid inspection transition");
    expect(() => assertInspectionTransition("cancelled", "in_progress")).toThrow("Invalid inspection transition");
  });
});
