import { describe, expect, it } from "vitest";
import { dateInTimeZone } from "./company-date";

describe("company date", () => {
  it("uses the company time zone at the UTC/KST date boundary", () => {
    const instant = new Date("2026-08-23T15:30:00.000Z");
    expect(dateInTimeZone("UTC", instant)).toBe("2026-08-23");
    expect(dateInTimeZone("Asia/Seoul", instant)).toBe("2026-08-24");
  });
});
