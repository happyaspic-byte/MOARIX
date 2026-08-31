import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeSessionCookie } from "@/lib/auth/cookies";
import { authenticate } from "@/lib/auth/repository";
import { loginAction } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/auth/cookies", () => ({ writeSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/repository", () => ({ authenticate: vi.fn() }));

const headersMock = vi.mocked(headers);
const redirectMock = vi.mocked(redirect);
const writeSessionCookieMock = vi.mocked(writeSessionCookie);
const authenticateMock = vi.mocked(authenticate);

function loginForm() {
  const form = new FormData();
  form.set("email", "admin@example.invalid");
  form.set("password", "synthetic-password-42");
  form.set("next", "/dashboard");
  return form;
}

beforeEach(() => {
  headersMock.mockReset();
  redirectMock.mockClear();
  writeSessionCookieMock.mockReset();
  authenticateMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("login session transport", () => {
  it("explains an HTTP and Secure-cookie mismatch before creating a session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");
    headersMock.mockResolvedValue(new Headers({ origin: "http://moarix.test:9010" }) as never);

    await expect(loginAction({ status: "idle" }, loginForm())).resolves.toEqual({
      status: "error",
      message: "현재 HTTP 주소에서는 보안 세션 쿠키를 유지할 수 없습니다. HTTPS로 접속하거나 서버의 HTTP 쿠키 허용 설정을 확인해 주세요.",
    });
    expect(authenticateMock).not.toHaveBeenCalled();
    expect(writeSessionCookieMock).not.toHaveBeenCalled();
  });

  it("writes the session and redirects for the explicit LAN HTTP mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "true");
    headersMock.mockResolvedValue(new Headers({ origin: "http://moarix.test:9010" }) as never);
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");
    authenticateMock.mockResolvedValue({ token: "session-token", expiresAt });

    await expect(loginAction({ status: "idle" }, loginForm())).rejects.toThrow("redirect:/dashboard");
    expect(writeSessionCookieMock).toHaveBeenCalledWith("session-token", expiresAt);
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
