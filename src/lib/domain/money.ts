import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const currencyScales: Readonly<Record<string, number>> = {
  KRW: 0,
  JPY: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CNY: 2,
};

export type LineInput = {
  quantity: string;
  unitPrice: string;
  discountRate?: string;
  taxRate?: string;
  currency?: string;
};

export type LineAmounts = {
  net: string;
  discount: string;
  tax: string;
  gross: string;
};

function fixedStorage(value: Decimal) {
  return value.toFixed(4);
}

export function currencyScale(currency: string) {
  return currencyScales[currency.toUpperCase()] ?? 2;
}

export function roundCurrency(value: Decimal.Value, currency = "KRW") {
  return new Decimal(value).toDecimalPlaces(currencyScale(currency), Decimal.ROUND_HALF_UP);
}

export function calculateLine(input: LineInput): LineAmounts {
  const quantity = new Decimal(input.quantity);
  const unitPrice = new Decimal(input.unitPrice);
  const discountRate = new Decimal(input.discountRate ?? 0);
  const taxRate = new Decimal(input.taxRate ?? 0);
  const currency = input.currency ?? "KRW";

  if (quantity.lte(0)) throw new Error("Quantity must be greater than zero");
  if (unitPrice.lt(0)) throw new Error("Unit price cannot be negative");
  if (discountRate.lt(0) || discountRate.gt(100)) throw new Error("Invalid discount rate");
  if (taxRate.lt(0) || taxRate.gt(100)) throw new Error("Invalid tax rate");

  const beforeDiscount = quantity.mul(unitPrice);
  const discount = roundCurrency(beforeDiscount.mul(discountRate).div(100), currency);
  const net = roundCurrency(beforeDiscount.minus(discount), currency);
  const tax = roundCurrency(net.mul(taxRate).div(100), currency);
  const gross = net.plus(tax);

  return {
    net: fixedStorage(net),
    discount: fixedStorage(discount),
    tax: fixedStorage(tax),
    gross: fixedStorage(gross),
  };
}

export function sumLineAmounts(lines: LineAmounts[]) {
  return lines.reduce(
    (totals, line) => ({
      net: totals.net.plus(line.net),
      discount: totals.discount.plus(line.discount),
      tax: totals.tax.plus(line.tax),
      gross: totals.gross.plus(line.gross),
    }),
    {
      net: new Decimal(0),
      discount: new Decimal(0),
      tax: new Decimal(0),
      gross: new Decimal(0),
    },
  );
}

export function formatMoney(value: Decimal.Value, currency = "KRW", locale = "ko-KR") {
  const amount = new Decimal(value);
  if (!currency) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(amount.toNumber());
  }
  if (!amount.isFinite() || amount.abs().gt(Number.MAX_SAFE_INTEGER)) {
    return `${amount.toFixed(currencyScale(currency))} ${currency}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currencyScale(currency),
  }).format(amount.toNumber());
}
