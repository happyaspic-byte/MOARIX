import { randomUUID } from "node:crypto";
import { withCompany } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import { writeAudit } from "./audit";

export type CounterpartyRow = {
  id: string;
  code: string;
  kind: "customer" | "supplier" | "both";
  name: string;
  business_number: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  payment_terms_days: number;
  credit_limit: string;
  is_active: boolean;
};

export type ItemRow = {
  id: string;
  sku: string;
  name: string;
  kind: "product" | "material" | "service";
  unit: string;
  tax_rate: string;
  sale_price: string;
  purchase_price: string;
  track_inventory: boolean;
  reorder_point: string;
  is_active: boolean;
};

export type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  is_active: boolean;
};

export function listCounterparties(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<CounterpartyRow>(
      `SELECT id, code, kind, name, business_number, representative_name, email, phone,
              payment_terms_days, credit_limit::text, is_active
       FROM counterparties
       ORDER BY is_active DESC, name ASC`,
    );
    return result.rows;
  });
}

export function listItems(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<ItemRow>(
      `SELECT id, sku, name, kind, unit, tax_rate::text, sale_price::text,
              purchase_price::text, track_inventory, reorder_point::text, is_active
       FROM items
       ORDER BY is_active DESC, name ASC`,
    );
    return result.rows;
  });
}

export function listWarehouses(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<WarehouseRow>(
      `SELECT id, code, name, location, is_active FROM warehouses
       ORDER BY is_active DESC, name ASC`,
    );
    return result.rows;
  });
}

export type CounterpartyInput = {
  code: string;
  kind: CounterpartyRow["kind"];
  name: string;
  businessNumber?: string;
  representativeName?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTermsDays: number;
  creditLimit: string;
};

export function createCounterparty(session: SessionContext, input: CounterpartyInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties
         (id, company_id, kind, code, name, business_number, representative_name, email, phone, address, payment_terms_days, credit_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        session.companyId,
        input.kind,
        input.code,
        input.name,
        input.businessNumber || null,
        input.representativeName || null,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.paymentTermsDays,
        input.creditLimit,
      ],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "counterparty.created",
      entityType: "counterparty",
      entityId: id,
      summary: `${input.code} ${input.name} 거래처 등록`,
      afterData: { code: input.code, kind: input.kind, name: input.name },
    });
    return id;
  });
}

export type ItemInput = {
  sku: string;
  name: string;
  kind: ItemRow["kind"];
  unit: string;
  taxRate: string;
  salePrice: string;
  purchasePrice: string;
  trackInventory: boolean;
  reorderPoint: string;
};

export function createItem(session: SessionContext, input: ItemInput) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    await tx.query(
      `INSERT INTO items
         (id, company_id, sku, name, kind, unit, tax_rate, sale_price, purchase_price, track_inventory, reorder_point)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, session.companyId, input.sku, input.name, input.kind, input.unit, input.taxRate, input.salePrice, input.purchasePrice, input.trackInventory, input.reorderPoint],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "item.created",
      entityType: "item",
      entityId: id,
      summary: `${input.sku} ${input.name} 품목 등록`,
      afterData: { sku: input.sku, name: input.name, kind: input.kind },
    });
    return id;
  });
}

export function createWarehouse(
  session: SessionContext,
  input: { code: string; name: string; location?: string },
) {
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    await tx.query(
      `INSERT INTO warehouses (id, company_id, code, name, location)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, session.companyId, input.code, input.name, input.location || null],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: id,
      summary: `${input.code} ${input.name} 창고 등록`,
      afterData: input,
    });
    return id;
  });
}
