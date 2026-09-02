import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientKey } from "./client-key";

const originalCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  vi.restoreAllMocks();
});

describe("createClientKey", () => {
  it("uses randomUUID when the browser provides it", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    });
    expect(createClientKey()).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("works on an insecure HTTP origin where randomUUID is unavailable", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) },
    });
    expect(createClientKey()).toMatch(/^07070707-0707-4707-8707-070707070707$/);
  });

  it("still returns distinct UUID-shaped keys without Web Crypto", () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    vi.spyOn(Date, "now").mockReturnValue(1_788_330_000_000);
    const first = createClientKey();
    const second = createClientKey();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  });
});
