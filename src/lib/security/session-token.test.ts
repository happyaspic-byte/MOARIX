import { describe, expect, it } from "vitest";
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
});
