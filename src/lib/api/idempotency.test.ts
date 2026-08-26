import { describe, expect, it } from "vitest";
import { commandRequestHash, validateIdempotencyKey } from "./idempotency";

describe("command idempotency", () => {
  it("hashes semantically identical object keys consistently", () => {
    const first = commandRequestHash("assets.create", { nested: { b: 2, a: 1 }, tag: "A" });
    const second = commandRequestHash("assets.create", { tag: "A", nested: { a: 1, b: 2 } });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds the hash to operation, values, and array order", () => {
    const base = commandRequestHash("cases.create", { values: [1, 2] });
    expect(commandRequestHash("cases.update", { values: [1, 2] })).not.toBe(base);
    expect(commandRequestHash("cases.create", { values: [2, 1] })).not.toBe(base);
  });

  it("requires bounded URL-safe retry keys", () => {
    expect(validateIdempotencyKey("ai-job:20260826-001")).toBe("ai-job:20260826-001");
    expect(() => validateIdempotencyKey(null)).toThrow(/Idempotency-Key/);
    expect(() => validateIdempotencyKey("short")).toThrow(/8~128/);
    expect(() => validateIdempotencyKey(`a${"b".repeat(128)}`)).toThrow(/8~128/);
    expect(() => validateIdempotencyKey("contains space")).toThrow(/8~128/);
  });
});
