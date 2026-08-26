export const drivingLogStatuses = ["draft", "submitted", "approved", "void"] as const;
export type DrivingLogStatus = (typeof drivingLogStatuses)[number];

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
