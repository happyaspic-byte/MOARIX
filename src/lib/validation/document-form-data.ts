export type DocumentFormLine = {
  itemId: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

export function parseDocumentFormData(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const lines: DocumentFormLine[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^lines\.(\d+)\.(\w+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2] as keyof DocumentFormLine;
    lines[index] ??= { itemId: "", quantity: "1", unitPrice: "0", discountRate: "0", taxRate: "10" };
    lines[index][field] = String(value);
  }
  return {
    ...raw,
    lines: lines.filter((line) => line && line.itemId),
  };
}
