export class UnsupportedTaxInvoiceProviderError extends Error {
  constructor(provider: string) {
    super(`전자세금계산서 공급자 '${provider}'는 계약·샌드박스 연동 전까지 사용할 수 없습니다.`);
    this.name = "UnsupportedTaxInvoiceProviderError";
  }
}

export type TaxInvoicePayload = {
  provider: "none";
  documentNumber: string;
  issueDate: string;
  counterpartyName: string;
  taxTotal: string;
  grandTotal: string;
};

export function buildTaxInvoicePayload(input: {
  number: string;
  issueDate: string;
  counterpartyName: string;
  taxTotal: string;
  grandTotal: string;
  provider?: string;
}): TaxInvoicePayload {
  if (input.provider && input.provider !== "none") {
    throw new UnsupportedTaxInvoiceProviderError(input.provider);
  }
  return {
    provider: "none",
    documentNumber: input.number,
    issueDate: input.issueDate,
    counterpartyName: input.counterpartyName,
    taxTotal: input.taxTotal,
    grandTotal: input.grandTotal,
  };
}
