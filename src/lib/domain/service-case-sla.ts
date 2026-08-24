import type { ServiceCaseStatus } from "./service-case-state";

export const serviceCaseSlaStates = ["none", "on_track", "at_risk", "overdue", "stopped"] as const;
export type ServiceCaseSlaState = (typeof serviceCaseSlaStates)[number];

export type ServiceCaseSlaHealth = {
  state: ServiceCaseSlaState;
  minutesRemaining: number | null;
};

const AT_RISK_MINUTES = 24 * 60;

export function getServiceCaseSlaHealth(
  status: ServiceCaseStatus,
  dueAt: string | null,
  now = new Date(),
): ServiceCaseSlaHealth {
  if (!dueAt) return { state: "none", minutesRemaining: null };
  if (status === "resolved" || status === "closed") {
    return { state: "stopped", minutesRemaining: null };
  }

  const dueTime = new Date(dueAt).getTime();
  if (!Number.isFinite(dueTime)) throw new Error(`Invalid due date: ${dueAt}`);
  const minutesRemaining = Math.ceil((dueTime - now.getTime()) / 60_000);

  if (minutesRemaining <= 0) return { state: "overdue", minutesRemaining };
  if (minutesRemaining <= AT_RISK_MINUTES) return { state: "at_risk", minutesRemaining };
  return { state: "on_track", minutesRemaining };
}

export const serviceCaseSlaLabels: Record<ServiceCaseSlaState, string> = {
  none: "기한 없음",
  on_track: "기한 정상",
  at_risk: "기한 임박",
  overdue: "기한 초과",
  stopped: "SLA 종료",
};

export function formatServiceCaseSla(health: ServiceCaseSlaHealth) {
  if (health.state === "at_risk" && health.minutesRemaining !== null) {
    const hours = Math.max(1, Math.ceil(health.minutesRemaining / 60));
    return `${serviceCaseSlaLabels.at_risk} · ${hours}시간`;
  }
  if (health.state === "overdue" && health.minutesRemaining !== null) {
    const hours = Math.max(1, Math.ceil(Math.abs(health.minutesRemaining) / 60));
    return `${serviceCaseSlaLabels.overdue} · ${hours}시간`;
  }
  return serviceCaseSlaLabels[health.state];
}
