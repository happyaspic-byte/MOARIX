import { describe, expect, it } from "vitest";
import { documentUpdateSchema } from "./forms";
import { parseDocumentFormData } from "./document-form-data";

const warehouseId = "d4d694e9-52d2-4aba-afb2-0bf47feaf347";

describe("document form data", () => {
  it("preserves warehouse and ordered lines for a draft update", () => {
    const formData = new FormData();
    formData.set("documentId", "c8e9d126-039a-431a-8f7b-b0e22d960169");
    formData.set("expectedVersion", "2");
    formData.set("kind", "quote");
    formData.set("counterpartyId", "8e5e254f-5144-470f-a987-fe6f11e35e31");
    formData.set("warehouseId", warehouseId);
    formData.set("issueDate", "2026-08-29");
    formData.set("lines.1.itemId", "e536f4bb-5c52-47be-8fc3-7affd57c1d32");
    formData.set("lines.1.quantity", "1");
    formData.set("lines.1.unitPrice", "80000");
    formData.set("lines.1.discountRate", "5");
    formData.set("lines.1.taxRate", "10");
    formData.set("lines.0.itemId", "2e62fe93-b7bd-4603-8911-03f08376cb2f");
    formData.set("lines.0.quantity", "2");
    formData.set("lines.0.unitPrice", "7000");
    formData.set("lines.0.discountRate", "0");
    formData.set("lines.0.taxRate", "10");

    const parsed = documentUpdateSchema.parse(parseDocumentFormData(formData));

    expect(parsed.warehouseId).toBe(warehouseId);
    expect(parsed.expectedVersion).toBe(2);
    expect(parsed.lines?.map((line) => line.itemId)).toEqual([
      "2e62fe93-b7bd-4603-8911-03f08376cb2f",
      "e536f4bb-5c52-47be-8fc3-7affd57c1d32",
    ]);
  });
});
