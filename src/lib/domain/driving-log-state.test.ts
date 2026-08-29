import { describe, expect, it } from "vitest";
import {
  allowedDrivingLogTransitions,
  assertDrivingLogDraft,
  assertDrivingLogTransition,
  currentDrivingLogMonth,
  drivingLogWorkspaceActions,
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

  it("defaults the list to the company-local calendar month", () => {
    expect(currentDrivingLogMonth("Asia/Seoul", new Date("2026-08-31T16:00:00.000Z"))).toBe("2026-09");
  });

  it("shows writer draft actions and independent approval without self-approve", () => {
    const writer = { canWrite: true, canApprove: false, isCreator: true };
    const approver = { canWrite: true, canApprove: true, isCreator: false };
    const selfApprover = { canWrite: true, canApprove: true, isCreator: true };
    const viewer = { canWrite: false, canApprove: false, isCreator: false };

    expect(drivingLogWorkspaceActions("draft", writer)).toEqual(["edit", "submit", "void"]);
    expect(drivingLogWorkspaceActions("submitted", writer)).toEqual(["return", "void"]);
    expect(drivingLogWorkspaceActions("submitted", approver)).toEqual(["return", "approve", "void"]);
    expect(drivingLogWorkspaceActions("submitted", selfApprover)).toEqual(["return", "void"]);
    expect(drivingLogWorkspaceActions("approved", writer)).toEqual([]);
    expect(drivingLogWorkspaceActions("approved", approver)).toEqual(["void"]);
    expect(drivingLogWorkspaceActions("void", approver)).toEqual([]);
    expect(drivingLogWorkspaceActions("draft", viewer)).toEqual([]);
  });
});
