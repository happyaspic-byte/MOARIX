export const inspectionStatuses = ["scheduled", "in_progress", "completed", "issue_found", "cancelled"] as const;
export type InspectionStatus = (typeof inspectionStatuses)[number];

const transitions: Record<InspectionStatus, readonly InspectionStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "issue_found", "cancelled"],
  issue_found: ["in_progress", "completed"],
  completed: [],
  cancelled: [],
};

export function allowedInspectionTransitions(status: InspectionStatus) {
  return transitions[status];
}

export function assertInspectionTransition(current: InspectionStatus, next: InspectionStatus) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid inspection transition: ${current} -> ${next}`);
  }
}
