import { dateInTimeZone } from "./company-date";

export const drivingLogStatuses = ["draft", "submitted", "approved", "void"] as const;
export type DrivingLogStatus = (typeof drivingLogStatuses)[number];
export type DrivingLogWorkspaceAction = "edit" | "submit" | "return" | "approve" | "void";
export type DrivingLogWorkspaceActor = {
  canWrite: boolean;
  canApprove: boolean;
  isCreator: boolean;
};

const transitions: Record<DrivingLogStatus, readonly DrivingLogStatus[]> = {
  draft: ["submitted", "void"],
  submitted: ["draft", "approved", "void"],
  approved: ["void"],
  void: [],
};

export function allowedDrivingLogTransitions(status: DrivingLogStatus) {
  return transitions[status];
}

export function assertDrivingLogTransition(current: DrivingLogStatus, next: DrivingLogStatus) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid driving log transition: ${current} -> ${next}`);
  }
}

export function assertDrivingLogDraft(status: DrivingLogStatus) {
  if (status !== "draft") {
    throw new Error("Only draft driving logs can be edited");
  }
}

export function currentDrivingLogMonth(timeZone: string, now = new Date()) {
  return dateInTimeZone(timeZone, now).slice(0, 7);
}

export function drivingLogWorkspaceActions(
  status: DrivingLogStatus,
  actor: DrivingLogWorkspaceActor,
): DrivingLogWorkspaceAction[] {
  if (status === "draft") return actor.canWrite ? ["edit", "submit", "void"] : [];
  if (status === "submitted") {
    const actions: DrivingLogWorkspaceAction[] = [];
    if (actor.canWrite) actions.push("return");
    if (actor.canApprove && !actor.isCreator) actions.push("approve");
    if (actor.canWrite) actions.push("void");
    return actions;
  }
  if (status === "approved") return actor.canApprove ? ["void"] : [];
  return [];
}
