import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./internal-redirect";

describe("safeInternalRedirect", () => {
  it("accepts normalized same-origin application paths", () => {
    expect(safeInternalRedirect("/dashboard")).toBe("/dashboard");
    expect(safeInternalRedirect("/documents/quote?status=draft#recent")).toBe(
      "/documents/quote?status=draft#recent",
    );
    expect(safeInternalRedirect("/reports/../inventory")).toBe("/inventory");
  });

  it.each([
    null,
    "",
    "dashboard",
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "/%5cevil.example/phish",
    "/%2f%2fevil.example/phish",
    "/dashboard\u0000",
  ])("falls back for an unsafe target: %s", (target) => {
    expect(safeInternalRedirect(target)).toBe("/dashboard");
  });

  it("supports an explicit fallback", () => {
    expect(safeInternalRedirect("//evil.example", "/login")).toBe("/login");
  });
});
