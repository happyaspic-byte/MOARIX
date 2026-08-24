export const serviceCaseStatuses = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
export type ServiceCaseStatus = (typeof serviceCaseStatuses)[number];

const transitions: Record<ServiceCaseStatus, readonly ServiceCaseStatus[]> = {
  open: ["in_progress", "waiting"],
  in_progress: ["waiting", "resolved"],
  waiting: ["in_progress", "resolved"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

export function allowedServiceCaseTransitions(status: ServiceCaseStatus) {
  return transitions[status];
}

export function assertServiceCaseTransition(current: ServiceCaseStatus, next: ServiceCaseStatus) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid service case transition: ${current} -> ${next}`);
  }
}
