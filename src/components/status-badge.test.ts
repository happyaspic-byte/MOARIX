import { describe, expect, it } from "vitest";
import { statusLabels } from "./status-badge";

describe("status labels", () => {
  it("names driving log void as 무효", () => {
    expect(statusLabels.void).toBe("무효");
  });
});
