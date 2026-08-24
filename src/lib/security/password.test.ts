import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password security", () => {
  it("hashes and verifies an eligible password", async () => {
    const encoded = await hashPassword("Correct-Horse-42!");
    expect(encoded).not.toContain("Correct-Horse-42!");
    expect(await verifyPassword("Correct-Horse-42!", encoded)).toBe(true);
    expect(await verifyPassword("Wrong-Horse-42!", encoded)).toBe(false);
  });

  it("rejects passwords outside the supported length", () => {
    expect(() => hashPassword("too-short")).toThrow("12");
    expect(() => hashPassword("x".repeat(129))).toThrow("128");
  });
});
