export type ConvertibleKind = "quote" | "sales_order" | "shipment" | "purchase_order" | "receipt" | "invoice" | "bill";

const nextKind: Partial<Record<ConvertibleKind, ConvertibleKind>> = {
  quote: "sales_order",
  sales_order: "shipment",
  shipment: "invoice",
  purchase_order: "receipt",
  receipt: "bill",
};

const labels: Partial<Record<ConvertibleKind, string>> = {
  quote: "수주로 전환",
  sales_order: "출고로 전환",
  shipment: "매출 청구로 전환",
  purchase_order: "입고로 전환",
  receipt: "매입 청구로 전환",
};

export function nextDocumentKind(kind: ConvertibleKind): ConvertibleKind | null {
  return nextKind[kind] ?? null;
}

export function conversionLabel(kind: ConvertibleKind): string | null {
  return labels[kind] ?? null;
}
