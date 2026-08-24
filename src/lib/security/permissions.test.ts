import { describe, expect, it } from "vitest";
import { assertPermission, hasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows owners to manage users and settings", () => {
    expect(hasPermission("owner", "users:manage")).toBe(true);
    expect(hasPermission("owner", "settings:manage")).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(hasPermission("viewer", "documents:read")).toBe(true);
    expect(hasPermission("viewer", "documents:write")).toBe(false);
    expect(hasPermission("viewer", "assets:read")).toBe(true);
    expect(hasPermission("viewer", "assets:write")).toBe(false);
    expect(hasPermission("viewer", "service:read")).toBe(true);
    expect(hasPermission("viewer", "service:write")).toBe(false);
  });

  it("reserves company settings for owners", () => {
    expect(hasPermission("admin", "users:manage")).toBe(true);
    expect(hasPermission("admin", "settings:manage")).toBe(false);
  });

  it("throws on a denied permission", () => {
    expect(() => assertPermission("member", "users:manage")).toThrow("Permission denied");
  });
});
