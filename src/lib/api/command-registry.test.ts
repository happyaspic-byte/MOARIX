import { describe, expect, it } from "vitest";
import type { ApiTokenContext } from "@/lib/auth/api-token";
import {
  assertCommandInputAccess,
  getCommandDefinition,
  listCommandCapabilities,
  parseCommandInput,
} from "./command-registry";

function actor(role: ApiTokenContext["role"], scopes: string[]) {
  return { role, scopes } as Pick<ApiTokenContext, "role" | "scopes">;
}

describe("command registry", () => {
  it("publishes AI-readable schemas for the complete operations story", () => {
    const capabilities = listCommandCapabilities(actor("owner", ["*"]));
    const operations = capabilities.map((capability) => capability.operation);
    expect(operations).toEqual(expect.arrayContaining([
      "assets.get",
      "assets.networks.update",
      "cases.activity.add",
      "cases.attachment.add",
      "quotes.update",
      "trips.create",
      "trips.transition",
      "trips.summary",
      "reports.run",
    ]));
    expect(capabilities.every((capability) => capability.inputSchema.$schema === "https://json-schema.org/draft/2020-12/schema")).toBe(true);
  });

  it("filters capabilities using role and token scope together", () => {
    const viewerAssets = listCommandCapabilities(actor("viewer", ["assets:read"]));
    expect(viewerAssets.map((entry) => entry.operation)).toEqual(["sites.list", "assets.list", "assets.get"]);
    expect(viewerAssets.every((entry) => entry.mode === "read")).toBe(true);
  });

  it("rejects unknown operations and misspelled input keys", () => {
    expect(() => getCommandDefinition("assets.delete")).toThrow(/지원하지 않는 operation/);
    const definition = getCommandDefinition("assets.get");
    expect(() => parseCommandInput(definition, { asset: "AST-0001" })).toThrow();
    expect(parseCommandInput(definition, { id: "AST-0001" })).toEqual({ id: "AST-0001" });
  });

  it("requires a distinct token scope for approval-risk transitions", () => {
    const tripTransition = getCommandDefinition("trips.transition");
    const approveTrip = parseCommandInput(tripTransition, {
      id: "TRIP-2026-00001",
      nextStatus: "approved",
      expectedVersion: 2,
    });
    expect(() => assertCommandInputAccess(
      tripTransition,
      actor("manager", ["trips:write"]),
      approveTrip,
    )).toThrow(/권한 또는 API 토큰 범위/);
    expect(() => assertCommandInputAccess(
      tripTransition,
      actor("manager", ["trips:write", "trips:approve"]),
      approveTrip,
    )).not.toThrow();

    const submitTrip = parseCommandInput(tripTransition, {
      id: "TRIP-2026-00001",
      nextStatus: "submitted",
      expectedVersion: 1,
    });
    expect(() => assertCommandInputAccess(
      tripTransition,
      actor("manager", ["trips:write"]),
      submitTrip,
    )).not.toThrow();

    const quoteTransition = getCommandDefinition("quotes.transition");
    const approveQuote = parseCommandInput(quoteTransition, {
      id: "Q-2026-0001",
      nextStatus: "approved",
    });
    expect(() => assertCommandInputAccess(
      quoteTransition,
      actor("manager", ["quotes:write"]),
      approveQuote,
    )).toThrow(/권한 또는 API 토큰 범위/);
  });
});
