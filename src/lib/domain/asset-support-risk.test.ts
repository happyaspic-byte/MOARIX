import { describe, expect, it } from "vitest";
import { formatAssetSupportRisk, getAssetSupportRisk, getLicenseHealth, getRenewalBand } from "./asset-support-risk";

describe("renewal bands", () => {
  const today = "2026-08-25";

  it.each([
    ["2026-11-24", "covered", 91],
    ["2026-11-23", "renewal_90", 90],
    ["2026-10-25", "renewal_90", 61],
    ["2026-10-24", "renewal_60", 60],
    ["2026-09-25", "renewal_60", 31],
    ["2026-09-24", "renewal_30", 30],
    ["2026-08-26", "renewal_30", 1],
    ["2026-08-25", "expires_today", 0],
    ["2026-08-24", "expired", -1],
  ] as const)("classifies %s as %s", (endsOn, band, daysRemaining) => {
    expect(getRenewalBand(endsOn, today)).toEqual({ band, daysRemaining });
  });

  it("handles leap-day boundaries with calendar-day arithmetic", () => {
    expect(getRenewalBand("2028-02-29", "2028-02-28")).toEqual({ band: "renewal_30", daysRemaining: 1 });
  });
});

describe("effective Stratus support risk", () => {
  const base = { assetStatus: "active" as const, customerStatus: "active" as const, customerEndsOn: "2027-12-31" };

  it.each([
    ["2026-11-24", "covered", 91, "지원 정상"],
    ["2026-11-23", "renewal_90", 90, "D-90"],
    ["2026-10-24", "renewal_60", 60, "D-60"],
    ["2026-09-24", "renewal_30", 30, "D-30"],
    ["2026-08-25", "expires_today", 0, "D-0"],
    ["2026-08-24", "expired", -1, "D+1"],
  ] as const)("propagates the D-day boundary %s into the asset queue", (customerEndsOn, state, daysRemaining, label) => {
    const risk = getAssetSupportRisk(
      { ...base, customerEndsOn, vendorStatus: "active", vendorEndsOn: "2027-12-31" },
      "2026-08-25",
    );
    expect(risk).toMatchObject({ state, daysRemaining });
    expect(formatAssetSupportRisk(risk)).toBe(label);
  });

  it("distinguishes customer coverage from missing vendor backing", () => {
    expect(getAssetSupportRisk({ ...base, vendorStatus: "not_contracted" }, "2026-08-25").state).toBe("vendor_gap");
    expect(getAssetSupportRisk(base, "2026-08-25").state).toBe("vendor_unverified");
  });

  it("reports both an explicitly expired vendor contract and a lapsed active revision as a vendor gap", () => {
    const explicitlyExpired = getAssetSupportRisk(
      { ...base, vendorStatus: "expired", vendorEndsOn: "2026-08-24" },
      "2026-08-25",
    );
    const dateLapsed = getAssetSupportRisk(
      { ...base, vendorStatus: "active", vendorEndsOn: "2026-08-24" },
      "2026-08-25",
    );
    expect(explicitlyExpired).toMatchObject({ state: "vendor_gap", vendorBand: "expired" });
    expect(dateLapsed).toMatchObject({ state: "vendor_gap", vendorBand: "expired", daysRemaining: -1 });
    expect(formatAssetSupportRisk(dateLapsed)).toBe("D+1");
  });

  it("uses the earliest customer or vendor renewal deadline", () => {
    const risk = getAssetSupportRisk({ ...base, vendorStatus: "active", vendorEndsOn: "2026-09-10" }, "2026-08-25");
    expect(risk.state).toBe("renewal_30");
    expect(risk.daysRemaining).toBe(16);
    expect(formatAssetSupportRisk(risk)).toBe("D-16");
  });

  it("removes retired assets from the operational queue", () => {
    expect(getAssetSupportRisk({ ...base, assetStatus: "retired", vendorStatus: "not_contracted" }, "2026-08-25").state).toBe("retired");
  });

  it("keeps perpetual licenses separate from support expiry", () => {
    expect(getLicenseHealth({ status: "active", licenseType: "perpetual" }, "2026-08-25")).toEqual({ state: "perpetual", daysRemaining: null });
    expect(getLicenseHealth({ status: "active", licenseType: "subscription", expiresOn: "2026-08-25" }, "2026-08-25").state).toBe("expires_today");
  });

  it("keeps license lifecycle states independent of renewal bands", () => {
    expect(getLicenseHealth({ status: "suspended", licenseType: "subscription", expiresOn: "2027-12-31" }, "2026-08-25")).toEqual({ state: "suspended", daysRemaining: null });
    expect(getLicenseHealth({ status: "retired", licenseType: "perpetual" }, "2026-08-25")).toEqual({ state: "retired", daysRemaining: null });
    expect(getLicenseHealth({ status: "active", licenseType: "subscription", expiresOn: "2026-08-24" }, "2026-08-25")).toEqual({ state: "expired", daysRemaining: -1 });
  });
});
