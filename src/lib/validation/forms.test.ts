import { describe, expect, it } from "vitest";
import { documentTransitionSchema, documentUpdateSchema, rawDocumentSchema } from "./forms";

const warehouseId = "d4d694e9-52d2-4aba-afb2-0bf47feaf347";

const receiptInput = {
  kind: "receipt",
  counterpartyId: "8e5e254f-5144-470f-a987-fe6f11e35e31",
  warehouseId,
  issueDate: "2026-08-29",
  lines: [{
    itemId: "2e62fe93-b7bd-4603-8911-03f08376cb2f",
    quantity: "1",
    unitPrice: "7000",
    discountRate: "0",
    taxRate: "10",
  }],
};

describe("document warehouse validation", () => {
  it("preserves a valid warehouse on document input", () => {
    const parsed = rawDocumentSchema.parse(receiptInput);

    expect(parsed.warehouseId).toBe(warehouseId);
  });

  it("accepts an unselected optional warehouse from an HTML form", () => {
    const parsed = rawDocumentSchema.safeParse({ ...receiptInput, warehouseId: "" });

    expect(parsed.success).toBe(true);
  });

  it("preserves a valid warehouse on a posting transition", () => {
    const parsed = documentTransitionSchema.parse({
      documentId: "c8e9d126-039a-431a-8f7b-b0e22d960169",
      kind: "receipt",
      nextStatus: "posted",
      expectedVersion: "3",
      warehouseId,
    });

    expect(parsed.warehouseId).toBe(warehouseId);
  });

  it("rejects a malformed posting warehouse", () => {
    const parsed = documentTransitionSchema.safeParse({
      documentId: "c8e9d126-039a-431a-8f7b-b0e22d960169",
      kind: "receipt",
      nextStatus: "posted",
      expectedVersion: 3,
      warehouseId: "not-a-warehouse-id",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("draft document update validation", () => {
  it("accepts a multi-line draft edit with warehouse and version", () => {
    const parsed = documentUpdateSchema.parse({
      documentId: "c8e9d126-039a-431a-8f7b-b0e22d960169",
      expectedVersion: "2",
      kind: "quote",
      counterpartyId: "8e5e254f-5144-470f-a987-fe6f11e35e31",
      warehouseId,
      issueDate: "2026-08-29",
      notes: "합성 초안 수정",
      lines: [
        {
          itemId: "2e62fe93-b7bd-4603-8911-03f08376cb2f",
          quantity: "2",
          unitPrice: "7000",
          discountRate: "0",
          taxRate: "10",
        },
        {
          itemId: "e536f4bb-5c52-47be-8fc3-7affd57c1d32",
          quantity: "1",
          unitPrice: "80000",
          discountRate: "5",
          taxRate: "10",
        },
      ],
    });

    expect(parsed.expectedVersion).toBe(2);
    expect(parsed.warehouseId).toBe(warehouseId);
    expect(parsed.lines).toHaveLength(2);
  });

  it("rejects more than 50 draft lines", () => {
    const parsed = documentUpdateSchema.safeParse({
      documentId: "c8e9d126-039a-431a-8f7b-b0e22d960169",
      expectedVersion: 1,
      kind: "quote",
      counterpartyId: "8e5e254f-5144-470f-a987-fe6f11e35e31",
      issueDate: "2026-08-29",
      lines: Array.from({ length: 51 }, () => ({
        itemId: "2e62fe93-b7bd-4603-8911-03f08376cb2f",
        quantity: "1",
        unitPrice: "10000",
        discountRate: "0",
        taxRate: "10",
      })),
    });

    expect(parsed.success).toBe(false);
  });
});
