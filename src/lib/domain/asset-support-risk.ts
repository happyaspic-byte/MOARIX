export const renewalBands = ["covered", "renewal_90", "renewal_60", "renewal_30", "expires_today", "expired", "unknown"] as const;
export type RenewalBand = (typeof renewalBands)[number];

export const assetSupportRiskStates = [
  "covered",
  "renewal_90",
  "renewal_60",
  "renewal_30",
  "expires_today",
  "expired",
  "not_contracted",
  "vendor_gap",
  "vendor_unverified",
  "unknown",
  "retired",
] as const;
export type AssetSupportRiskState = (typeof assetSupportRiskStates)[number];

type ContractStatus = "active" | "pending_renewal" | "not_contracted" | "expired";

function dayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid ISO date: ${value}`);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getRenewalBand(endsOn: string | null | undefined, today: string): { band: RenewalBand; daysRemaining: number | null } {
  if (!endsOn) return { band: "unknown", daysRemaining: null };
  const daysRemaining = dayNumber(endsOn) - dayNumber(today);
  if (daysRemaining < 0) return { band: "expired", daysRemaining };
  if (daysRemaining === 0) return { band: "expires_today", daysRemaining };
  if (daysRemaining <= 30) return { band: "renewal_30", daysRemaining };
  if (daysRemaining <= 60) return { band: "renewal_60", daysRemaining };
  if (daysRemaining <= 90) return { band: "renewal_90", daysRemaining };
  return { band: "covered", daysRemaining };
}

export type AssetSupportRisk = {
  state: AssetSupportRiskState;
  daysRemaining: number | null;
  customerBand: RenewalBand | "not_contracted";
  vendorBand: RenewalBand | "not_contracted" | "unverified";
};

export function getAssetSupportRisk(input: {
  assetStatus: "active" | "maintenance" | "retired";
  customerStatus: ContractStatus;
  customerEndsOn?: string | null;
  vendorStatus?: ContractStatus | null;
  vendorEndsOn?: string | null;
}, today: string): AssetSupportRisk {
  if (input.assetStatus === "retired") {
    return { state: "retired", daysRemaining: null, customerBand: "unknown", vendorBand: "unverified" };
  }
  if (input.customerStatus === "not_contracted") {
    return { state: "not_contracted", daysRemaining: null, customerBand: "not_contracted", vendorBand: input.vendorStatus === "not_contracted" ? "not_contracted" : "unverified" };
  }

  const customer = getRenewalBand(input.customerEndsOn, today);
  const customerBand = input.customerStatus === "expired" ? "expired" : input.customerStatus === "pending_renewal" && customer.band === "covered" ? "renewal_90" : customer.band;
  if (customerBand === "expired") {
    return { state: "expired", daysRemaining: customer.daysRemaining, customerBand, vendorBand: input.vendorStatus ? getRenewalBand(input.vendorEndsOn, today).band : "unverified" };
  }

  if (!input.vendorStatus) {
    return { state: customerBand === "unknown" ? "unknown" : "vendor_unverified", daysRemaining: customer.daysRemaining, customerBand, vendorBand: "unverified" };
  }
  if (input.vendorStatus === "not_contracted" || input.vendorStatus === "expired") {
    return { state: "vendor_gap", daysRemaining: null, customerBand, vendorBand: input.vendorStatus === "not_contracted" ? "not_contracted" : "expired" };
  }

  const vendor = getRenewalBand(input.vendorEndsOn, today);
  const vendorBand = input.vendorStatus === "pending_renewal" && vendor.band === "covered" ? "renewal_90" : vendor.band;
  if (vendorBand === "expired") return { state: "vendor_gap", daysRemaining: vendor.daysRemaining, customerBand, vendorBand };

  const ranked: RenewalBand[] = ["expired", "expires_today", "renewal_30", "renewal_60", "renewal_90", "unknown", "covered"];
  const state = ranked.indexOf(customerBand) <= ranked.indexOf(vendorBand) ? customerBand : vendorBand;
  const candidates = [customer.daysRemaining, vendor.daysRemaining].filter((value): value is number => value !== null);
  return {
    state,
    daysRemaining: candidates.length > 0 ? Math.min(...candidates) : null,
    customerBand,
    vendorBand,
  };
}

export const assetSupportRiskLabels: Record<AssetSupportRiskState, string> = {
  covered: "지원 정상",
  renewal_90: "90일 내 갱신",
  renewal_60: "60일 내 갱신",
  renewal_30: "30일 내 갱신",
  expires_today: "오늘 만료",
  expired: "고객 지원 만료",
  not_contracted: "고객 미계약",
  vendor_gap: "벤더 지원 공백",
  vendor_unverified: "벤더 계약 미확인",
  unknown: "계약 기한 미등록",
  retired: "퇴역",
};

export function formatAssetSupportRisk(risk: AssetSupportRisk) {
  if (["renewal_90", "renewal_60", "renewal_30"].includes(risk.state) && risk.daysRemaining !== null) return `D-${risk.daysRemaining}`;
  if (risk.state === "expires_today") return "D-0";
  if ((risk.state === "expired" || risk.state === "vendor_gap") && risk.daysRemaining !== null && risk.daysRemaining < 0) return `D+${Math.abs(risk.daysRemaining)}`;
  return assetSupportRiskLabels[risk.state];
}

export function getLicenseHealth(input: { status: "active" | "suspended" | "retired"; licenseType: string; expiresOn?: string | null }, today: string) {
  if (input.status === "retired") return { state: "retired" as const, daysRemaining: null };
  if (input.status === "suspended") return { state: "suspended" as const, daysRemaining: null };
  if (input.licenseType === "perpetual" && !input.expiresOn) return { state: "perpetual" as const, daysRemaining: null };
  const renewal = getRenewalBand(input.expiresOn, today);
  return { state: renewal.band, daysRemaining: renewal.daysRemaining };
}
