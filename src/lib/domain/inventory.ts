import Decimal from "decimal.js";

export type StockBalance = {
  onHand: string;
  reserved: string;
};

export type MovementKind = "receipt" | "issue" | "adjustment" | "transfer_in" | "transfer_out" | "reservation" | "release" | "reversal";

export function availableQuantity(balance: StockBalance) {
  return new Decimal(balance.onHand).minus(balance.reserved).toFixed(4);
}

export function applyStockMovement(
  balance: StockBalance,
  kind: MovementKind,
  quantity: string,
): StockBalance {
  const onHand = new Decimal(balance.onHand);
  const reserved = new Decimal(balance.reserved);
  const amount = new Decimal(quantity);
  if (amount.eq(0)) throw new Error("Movement quantity cannot be zero");

  let nextOnHand = onHand;
  let nextReserved = reserved;

  switch (kind) {
    case "receipt":
    case "transfer_in":
      if (amount.lt(0)) throw new Error("Inbound quantity must be positive");
      nextOnHand = onHand.plus(amount);
      break;
    case "issue":
    case "transfer_out":
      if (amount.lt(0)) throw new Error("Outbound quantity must be positive");
      nextOnHand = onHand.minus(amount);
      break;
    case "reservation":
      if (amount.lt(0)) throw new Error("Reservation quantity must be positive");
      nextReserved = reserved.plus(amount);
      break;
    case "release":
      if (amount.lt(0)) throw new Error("Release quantity must be positive");
      nextReserved = reserved.minus(amount);
      break;
    case "adjustment":
    case "reversal":
      nextOnHand = onHand.plus(amount);
      break;
  }

  if (nextOnHand.lt(0)) throw new Error("Negative stock is not allowed");
  if (nextReserved.lt(0)) throw new Error("Reserved stock cannot be negative");
  if (nextReserved.gt(nextOnHand)) throw new Error("Reserved stock cannot exceed on-hand stock");

  return { onHand: nextOnHand.toFixed(4), reserved: nextReserved.toFixed(4) };
}
