import { describe, expect, it, vi } from "vitest";
import { createBrowserId } from "./browser-id";

describe("browser IDs", () => {
  it("creates unique IDs when randomUUID is unavailable on LAN HTTP", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
      return bytes;
    });

    const first = createBrowserId({ getRandomValues });
    const second = createBrowserId({
      getRandomValues: (bytes) => {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = 200 - index;
        return bytes;
      },
    });

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRandomValues).toHaveBeenCalled();
  });

  it("uses randomUUID in a secure context", () => {
    expect(createBrowserId({ randomUUID: () => "11111111-1111-4111-8111-111111111111" })).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("falls back when randomUUID throws on LAN HTTP", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(7);
      return bytes;
    });

    const id = createBrowserId({
      randomUUID: () => {
        throw new DOMException("secure context required", "NotSupportedError");
      },
      getRandomValues,
    });

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRandomValues).toHaveBeenCalled();
  });
});
