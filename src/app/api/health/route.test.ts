import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/lib/db/client";
import { GET } from "./route";

vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));

const getDatabaseMock = vi.mocked(getDatabase);

beforeEach(() => {
  getDatabaseMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("health readiness", () => {
  it("returns 503 before touching the database for an invalid production cookie policy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "false");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "error", service: "moarix" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getDatabaseMock).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("[health] runtime readiness check failed");
  });

  it("keeps the health endpoint ready for the explicit trusted LAN HTTP mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_DRIVER", "local");
    vi.stubEnv("COOKIE_SECURE", "false");
    vi.stubEnv("ALLOW_INSECURE_COOKIES", "true");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    getDatabaseMock.mockResolvedValue({ query } as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", service: "moarix" });
    expect(query).toHaveBeenCalledOnce();
  });
});
