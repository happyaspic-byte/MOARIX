import { describe, expect, it, vi } from "vitest";
import { createSessionToken, hashSessionToken, safeTokenHashEquals } from "./session-token";

describe("session tokens", () => {
  it("creates unpredictable opaque tokens", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes deterministically and compares in constant time", () => {
    const hash = hashSessionToken("token-a");
    expect(hash).toHaveLength(64);
    expect(safeTokenHashEquals(hash, hashSessionToken("token-a"))).toBe(true);
    expect(safeTokenHashEquals(hash, hashSessionToken("token-b"))).toBe(false);
    expect(safeTokenHashEquals(hash, "short")).toBe(false);
  });

  it("never uses the development fallback in production", () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", undefined);
      expect(() => hashSessionToken("token")).toThrow(/SESSION_SECRET is required/);
      vi.stubEnv("SESSION_SECRET", "too-short");
      expect(() => hashSessionToken("token")).toThrow(/at least 32/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
