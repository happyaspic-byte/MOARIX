import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./repository";
import {
  getCurrentSession,
  hasSessionCookieTransportMismatch,
  readSessionToken,
  requestProtocol,
  requirePermission,
  requireSession,
  secureCookies,
  sessionCookieName,
  sessionCookiePolicy,
} from "./current";

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
  it("uses a host-only secure cookie for the explicit HTTPS mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");

    expect(sessionCookiePolicy()).toEqual({ name: "__Host-moarix_session", secure: true });
    expect(secureCookies()).toBe(true);
    expect(sessionCookieName()).toBe("__Host-moarix_session");
  });

  it("uses a local non-secure cookie for the explicit trusted LAN HTTP mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "true");

    expect(sessionCookiePolicy()).toEqual({ name: "moarix_session", secure: false });
    expect(secureCookies()).toBe(false);
    expect(sessionCookieName()).toBe("moarix_session");
  });

  it.each([
    ["false", "false"],
    ["true", "true"],
    [undefined, undefined],
    ["invalid", "false"],
  ])("rejects an invalid production pair COOKIE_SECURE=%s ALLOW_INSECURE_COOKIES=%s", (secure, allow) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", secure as never);
    vi.stubEnv("ALLOW_INSECURE_COOKIES", allow as never);

    expect(() => sessionCookiePolicy()).toThrow();
  });

  it("keeps local development cookies usable over HTTP", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "false");

    expect(secureCookies()).toBe(false);
    expect(sessionCookieName()).toBe("moarix_session");
  });

  it("detects a secure-cookie policy used over a direct HTTP origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");
    const requestHeaders = new Headers({ origin: "http://moarix.test:9010" });

    expect(requestProtocol(requestHeaders)).toBe("http");
    expect(hasSessionCookieTransportMismatch(requestHeaders)).toBe(true);
  });

  it("uses the first forwarded protocol supplied by an HTTPS reverse proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");
    const requestHeaders = new Headers({
      origin: "http://app.internal",
      "x-forwarded-proto": "https, http",
    });

    expect(requestProtocol(requestHeaders)).toBe("https");
    expect(hasSessionCookieTransportMismatch(requestHeaders)).toBe(false);
  });

  it("does not infer a transport mismatch without reliable protocol headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");

    expect(requestProtocol(new Headers({ origin: "not-a-url" }))).toBeNull();
    expect(hasSessionCookieTransportMismatch(new Headers())).toBe(false);
  });

  it("reads only the host cookie when secure cookies are enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");
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
