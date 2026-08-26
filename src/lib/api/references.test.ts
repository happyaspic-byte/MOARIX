import { describe, expect, it } from "vitest";
import { filterAndLimit, resolveExactReference } from "./references";

const rows = [
  { id: "1", number: "CS-2026-00001", title: "A-Link fault", status: "open" },
  { id: "2", number: "CS-2026-00002", title: "Memory pressure", status: "closed" },
];

describe("human-readable command references", () => {
  it("resolves exact references case-insensitively and never guesses partial IDs", () => {
    expect(resolveExactReference(rows, "cs-2026-00001", ["id", "number"], "케이스").id).toBe("1");
    expect(() => resolveExactReference(rows, "CS-2026", ["id", "number"], "케이스")).toThrow(/찾을 수 없습니다/);
  });

  it("rejects ambiguous matches", () => {
    const ambiguous = [{ id: "1", alias: "same" }, { id: "2", alias: "SAME" }];
    expect(() => resolveExactReference(ambiguous, "same", ["id", "alias"], "항목")).toThrow(/여러 항목/);
  });

  it("filters searches and applies a hard result limit", () => {
    expect(filterAndLimit(rows, { query: "memory", limit: 10 }, ["number", "title"])).toHaveLength(1);
    expect(filterAndLimit(rows, { status: "open", limit: 10 }, ["title"])[0]?.id).toBe("1");
    expect(filterAndLimit(rows, { limit: 1 }, ["title"])).toHaveLength(1);
  });
});
