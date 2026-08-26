import { describe, expect, it } from "vitest";
import { assertApiCommandAccess } from "./access";

describe("API command access", () => {
  it("requires both the account role permission and token scope", () => {
    expect(() => assertApiCommandAccess(
      { role: "member", scopes: ["assets:read"] },
      { permission: "assets:read", scope: "assets:read" },
    )).not.toThrow();
    expect(() => assertApiCommandAccess(
      { role: "viewer", scopes: ["assets:write"] },
      { permission: "assets:write", scope: "assets:write" },
    )).toThrow(/권한 또는 API 토큰 범위/);
    expect(() => assertApiCommandAccess(
      { role: "owner", scopes: ["assets:read"] },
      { permission: "assets:write", scope: "assets:write" },
    )).toThrow(/권한 또는 API 토큰 범위/);
  });

  it("accepts global and resource wildcards without bypassing the role", () => {
    expect(() => assertApiCommandAccess(
      { role: "owner", scopes: ["*"] },
      { permission: "service:write", scope: "cases:write" },
    )).not.toThrow();
    expect(() => assertApiCommandAccess(
      { role: "member", scopes: ["cases:*"] },
      { permission: "service:write", scope: "cases:write" },
    )).not.toThrow();
  });
});
