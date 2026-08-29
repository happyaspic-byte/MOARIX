import Decimal from "decimal.js";

export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "over_90";

export function remainingOpen(total: Decimal.Value, allocated: Decimal.Value) {
  const remaining = new Decimal(total).minus(allocated);
  if (remaining.lt(0)) throw new Error("배부액은 문서 미결 금액을 초과할 수 없습니다.");
  return remaining.toFixed(4);
}

export function allocatePayment(amount: Decimal.Value, entries: Array<{ id: string; openAmount: Decimal.Value }>) {
  let remaining = new Decimal(amount);
  if (remaining.lte(0)) throw new Error("입출금 금액은 0보다 커야 합니다.");
  const totalOpen = entries.reduce((sum, entry) => sum.plus(entry.openAmount), new Decimal(0));
  if (remaining.gt(totalOpen)) throw new Error("입출금 금액이 배부 가능한 미결 금액을 초과합니다.");
  const allocations: Array<{ id: string; applied: string }> = [];
  for (const entry of entries) {
    if (remaining.isZero()) break;
    const open = new Decimal(entry.openAmount);
    if (open.lte(0)) continue;
    const applied = Decimal.min(open, remaining);
    allocations.push({ id: entry.id, applied: applied.toFixed(4) });
    remaining = remaining.minus(applied);
  }
  return allocations;
}

export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  if (!dueDate || dueDate >= today) return "current";
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  const days = Math.floor((now - due) / 86_400_000);
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "over_90";
}
