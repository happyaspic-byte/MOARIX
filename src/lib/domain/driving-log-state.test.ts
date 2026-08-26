import { describe, expect, it } from "vitest";
import {
  allowedDrivingLogTransitions,
  assertDrivingLogDraft,
  assertDrivingLogTransition,
} from "./driving-log-state";

describe("driving log state", () => {
  it("uses an explicit submit and maker-checker approval flow", () => {
    expect(allowedDrivingLogTransitions("draft")).toEqual(["submitted", "void"]);
    expect(allowedDrivingLogTransitions("submitted")).toEqual(["draft", "approved", "void"]);
    expect(allowedDrivingLogTransitions("approved")).toEqual(["void"]);
    expect(allowedDrivingLogTransitions("void")).toEqual([]);
  });

  it("rejects invalid transitions and edits outside draft", () => {
    expect(() => assertDrivingLogTransition("draft", "approved")).toThrow(
      "Invalid driving log transition",
    );
    expect(() => assertDrivingLogTransition("void", "draft")).toThrow(
      "Invalid driving log transition",
    );
    expect(() => assertDrivingLogDraft("submitted")).toThrow(
      "Only draft driving logs can be edited",
    );
    expect(() => assertDrivingLogDraft("draft")).not.toThrow();
  });
});
