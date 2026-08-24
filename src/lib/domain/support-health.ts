export const supportHealthStates = ["covered", "expiring", "expired", "not_contracted", "unknown", "retired"] as const;
export type SupportHealthState = (typeof supportHealthStates)[number];

export type SupportHealth = {
  state: SupportHealthState;
  daysRemaining: number | null;
};

type SupportHealthInput = {
  contractStatus: "active" | "pending_renewal" | "not_contracted" | "expired";
  supportUntil?: string | null;
  assetStatus?: "active" | "maintenance" | "retired";
};

function dayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid ISO date: ${value}`);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getSupportHealth(input: SupportHealthInput, today: string): SupportHealth {
  if (input.assetStatus === "retired") return { state: "retired", daysRemaining: null };
  if (input.contractStatus === "not_contracted") return { state: "not_contracted", daysRemaining: null };

  const daysRemaining = input.supportUntil ? dayNumber(input.supportUntil) - dayNumber(today) : null;
  if (input.contractStatus === "expired" || (daysRemaining !== null && daysRemaining < 0)) {
    return { state: "expired", daysRemaining };
  }
  if (input.contractStatus === "pending_renewal" || (daysRemaining !== null && daysRemaining <= 90)) {
    return { state: "expiring", daysRemaining };
  }
  if (daysRemaining === null) return { state: "unknown", daysRemaining: null };
  return { state: "covered", daysRemaining };
}

export const supportHealthLabels: Record<SupportHealthState, string> = {
  covered: "지원 정상",
  expiring: "갱신 필요",
  expired: "지원 만료",
  not_contracted: "미계약",
  unknown: "만료일 미등록",
  retired: "퇴역",
};

export function formatSupportHealth(health: SupportHealth) {
  if (health.state === "expiring" && health.daysRemaining !== null) return `D-${Math.max(health.daysRemaining, 0)}`;
  if (health.state === "expired" && health.daysRemaining !== null) return `D+${Math.abs(health.daysRemaining)}`;
  return supportHealthLabels[health.state];
}
