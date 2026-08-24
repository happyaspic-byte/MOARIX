import { describe, expect, it } from "vitest";
import { assertDocumentTransition, canTransitionDocument } from "./document-state";

describe("document state machine", () => {
  it("supports the controlled approval flow", () => {
    expect(canTransitionDocument("draft", "submitted")).toBe(true);
    expect(canTransitionDocument("submitted", "approved")).toBe(true);
    expect(canTransitionDocument("approved", "posted")).toBe(true);
  });

  it("keeps posted and cancelled documents immutable", () => {
    expect(canTransitionDocument("posted", "draft")).toBe(false);
    expect(canTransitionDocument("cancelled", "draft")).toBe(false);
    expect(() => assertDocumentTransition("posted", "cancelled")).toThrow("Invalid document transition");
  });
});
