import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/auth/repository";
import { withCompany } from "@/lib/db/client";
import { applyStockMovement, type MovementKind } from "@/lib/domain/inventory";
import { writeAudit } from "./audit";

export type BalanceRow = {
  warehouse_id: string;
  warehouse_name: string;
  item_id: string;
  sku: string;
  item_name: string;
  on_hand: string;
  reserved: string;
  available: string;
  reorder_point: string;
};

export type MovementRow = {
  id: string;
  occurred_at: string;
  movement_type: MovementKind;
  quantity: string;
  warehouse_name: string;
  sku: string;
  item_name: string;
  reference_number: string | null;
  reason: string | null;
  created_by_name: string;
};

export function listInventory(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const [balances, movements] = await Promise.all([
      tx.query<BalanceRow>(
        `SELECT b.warehouse_id, w.name AS warehouse_name, b.item_id, i.sku, i.name AS item_name,
                b.on_hand::text, b.reserved::text, (b.on_hand - b.reserved)::text AS available,
                i.reorder_point::text
         FROM inventory_balances b
         JOIN warehouses w ON w.company_id = b.company_id AND w.id = b.warehouse_id
         JOIN items i ON i.company_id = b.company_id AND i.id = b.item_id
         ORDER BY w.name, i.name`,
      ),
      tx.query<MovementRow>(
        `SELECT m.id, m.occurred_at::text, m.movement_type, m.quantity::text,
                w.name AS warehouse_name, i.sku, i.name AS item_name,
                m.reference_number, m.reason, u.name AS created_by_name
         FROM inventory_movements m
         JOIN warehouses w ON w.company_id = m.company_id AND w.id = m.warehouse_id
         JOIN items i ON i.company_id = m.company_id AND i.id = m.item_id
         JOIN users u ON u.id = m.created_by
         ORDER BY m.occurred_at DESC
         LIMIT 100`,
      ),
    ]);
    return { balances: balances.rows, movements: movements.rows };
  });
}

export type InventoryMovementInput = {
  warehouseId: string;
  itemId: string;
  movementType: Extract<MovementKind, "receipt" | "issue" | "adjustment">;
  quantity: string;
  unitCost: string;
  reason: string;
  idempotencyKey: string;
};

export function postInventoryMovement(session: SessionContext, input: InventoryMovementInput) {
  return withCompany(session.companyId, async (tx) => {
    const prior = await tx.query<{ id: string }>(
      "SELECT id FROM inventory_movements WHERE idempotency_key = $1",
      [input.idempotencyKey],
    );
    if (prior.rows[0]) return prior.rows[0].id;

    await tx.query(
      `INSERT INTO inventory_balances (company_id, warehouse_id, item_id, on_hand, reserved)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (company_id, warehouse_id, item_id) DO NOTHING`,
      [session.companyId, input.warehouseId, input.itemId],
    );
    const currentResult = await tx.query<{ on_hand: string; reserved: string }>(
      `SELECT on_hand::text, reserved::text FROM inventory_balances
       WHERE warehouse_id = $1 AND item_id = $2 FOR UPDATE`,
      [input.warehouseId, input.itemId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Inventory balance not found");

    const signedQuantity = input.movementType === "adjustment" ? input.quantity : input.quantity.replace(/^-/, "");
    const next = applyStockMovement(
      { onHand: current.on_hand, reserved: current.reserved },
      input.movementType,
      signedQuantity,
    );
    await tx.query(
      `UPDATE inventory_balances
       SET on_hand = $3, reserved = $4, version = version + 1, updated_at = now()
       WHERE warehouse_id = $1 AND item_id = $2`,
      [input.warehouseId, input.itemId, next.onHand, next.reserved],
    );

    const id = randomUUID();
    const ledgerQuantity = input.movementType === "issue" ? `-${signedQuantity}` : signedQuantity;
    await tx.query(
      `INSERT INTO inventory_movements
         (id, company_id, warehouse_id, item_id, movement_type, quantity, unit_cost,
          reference_type, reference_number, reason, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, $11)`,
      [id, session.companyId, input.warehouseId, input.itemId, input.movementType, ledgerQuantity, input.unitCost, `MAN-${id.slice(0, 8).toUpperCase()}`, input.reason, input.idempotencyKey, session.userId],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "inventory.posted",
      entityType: "inventory_movement",
      entityId: id,
      summary: `재고 ${input.movementType} ${ledgerQuantity}`,
      beforeData: current,
      afterData: next,
      metadata: { warehouseId: input.warehouseId, itemId: input.itemId },
    });
    return id;
  });
}
