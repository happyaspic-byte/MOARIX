import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { deleteSessionCookie, writeSessionCookie } from "./cookies";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const cookiesMock = vi.mocked(cookies);
const cookieStore = { set: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  cookiesMock.mockResolvedValue(cookieStore as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookie writes", () => {
  it("writes a non-secure LAN cookie for the explicit HTTP mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "true");
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");

    await writeSessionCookie("session-token", expiresAt);

    expect(cookieStore.set).toHaveBeenCalledWith("moarix_session", "session-token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      priority: "high",
    });
  });

  it("writes a host-only Secure cookie for the explicit HTTPS mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");

    await writeSessionCookie("session-token", new Date("2026-09-01T00:00:00.000Z"));

    expect(cookieStore.set).toHaveBeenCalledWith(
      "__Host-moarix_session",
      "session-token",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }),
    );
  });

  it("removes both cookie names when signing out or recovering from a mode change", async () => {
    await deleteSessionCookie();

    expect(cookieStore.delete).toHaveBeenNthCalledWith(1, "__Host-moarix_session");
    expect(cookieStore.delete).toHaveBeenNthCalledWith(2, "moarix_session");
  });
});
