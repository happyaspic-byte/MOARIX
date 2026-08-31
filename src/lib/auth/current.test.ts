import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./repository";
import { getCurrentSession, readSessionToken, requirePermission, requireSession, secureCookies, sessionCookieName } from "./current";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("./repository", () => ({ findSession: vi.fn() }));

const cookiesMock = vi.mocked(cookies);
const redirectMock = vi.mocked(redirect);
const findSessionMock = vi.mocked(findSession);
const cookieStore = { get: vi.fn() };

beforeEach(() => {
  cookieStore.get.mockReset();
  cookiesMock.mockResolvedValue(cookieStore as never);
  redirectMock.mockClear();
  findSessionMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookie policy", () => {
  it("fails closed in production when an insecure override is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");

    expect(secureCookies()).toBe(true);
    expect(sessionCookieName()).toBe("__Host-moarix_session");
  });

  it("requires an explicit opt-in for local HTTP production smoke tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "true");

    expect(secureCookies()).toBe(false);
    expect(sessionCookieName()).toBe("moarix_session");
  });

  it("defaults to secure cookies in production when no override is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", undefined as never);
    vi.stubEnv("ALLOW_INSECURE_COOKIES", undefined as never);

    expect(secureCookies()).toBe(true);
  });

  it("keeps local development cookies usable over HTTP", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "false");

    expect(secureCookies()).toBe(false);
    expect(sessionCookieName()).toBe("moarix_session");
  });

  it("reads only the host cookie when secure cookies are enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    cookieStore.get.mockImplementation((name: string) => name === "__Host-moarix_session" ? { value: "secure-token" } : undefined);

    await expect(readSessionToken()).resolves.toBe("secure-token");
    expect(cookieStore.get).toHaveBeenCalledWith("__Host-moarix_session");
  });

  it("accepts the local cookie and falls back to a secure cookie for local smoke", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("COOKIE_SECURE", "false");
    cookieStore.get.mockImplementation((name: string) => name === "__Host-moarix_session" ? { value: "secure-token" } : undefined);

    await expect(readSessionToken()).resolves.toBe("secure-token");
    expect(cookieStore.get).toHaveBeenNthCalledWith(1, "moarix_session");
    expect(cookieStore.get).toHaveBeenNthCalledWith(2, "__Host-moarix_session");
  });

  it("passes the cookie token to the session repository", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("COOKIE_SECURE", "false");
    cookieStore.get.mockReturnValue({ value: "session-token" });
    findSessionMock.mockResolvedValue(null);

    await expect(getCurrentSession()).resolves.toBeNull();
    expect(findSessionMock).toHaveBeenCalledWith("session-token");
  });

  it("returns an active session and protects unauthenticated routes", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("COOKIE_SECURE", "false");
    cookieStore.get.mockReturnValue({ value: "session-token" });
    const activeSession = { role: "owner" } as never;
    findSessionMock.mockResolvedValue(activeSession);

    await expect(requireSession()).resolves.toBe(activeSession);
    await expect(requirePermission("users:manage")).resolves.toBe(activeSession);

    findSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("redirect:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
