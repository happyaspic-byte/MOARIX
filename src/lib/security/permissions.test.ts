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
    expect(hasPermission("viewer", "trips:read")).toBe(true);
    expect(hasPermission("viewer", "trips:write")).toBe(false);
    expect(hasPermission("viewer", "trips:approve")).toBe(false);
  });

  it("uses maker-checker roles for driving log approval", () => {
    expect(hasPermission("member", "trips:read")).toBe(true);
    expect(hasPermission("member", "trips:write")).toBe(true);
    expect(hasPermission("member", "trips:approve")).toBe(false);
    expect(hasPermission("manager", "trips:approve")).toBe(true);
  });

  it("reserves company settings for owners", () => {
    expect(hasPermission("admin", "users:manage")).toBe(true);
    expect(hasPermission("admin", "settings:manage")).toBe(false);
  });

  it("throws on a denied permission", () => {
    expect(() => assertPermission("member", "users:manage")).toThrow("Permission denied");
  });
});
