import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import { listInventory, postInventoryMovement } from "./inventory-service";
import {
  convertDocument,
  createDocument,
  getDocumentDetail,
  transitionDocument,
  updateDraftDocument,
  type CreateDocumentInput,
  type UpdateDraftDocumentInput,
} from "./documents";

const companyId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const supplierId = randomUUID();
const warehouseId = randomUUID();
const trackedItemId = randomUUID();
const serviceItemId = randomUUID();
const extraItemId = randomUUID();
let databaseDirectory = "";

const session: SessionContext = {
  sessionId: randomUUID(),
  userId,
  companyId,
  userName: "합성 문서 담당",
  email: "documents-test@example.invalid",
  companyName: "Synthetic Document Test",
  companyTimezone: "Asia/Seoul",
  role: "owner",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

function tmpRoot() {
  return process.env.CLAUDE_JOB_DIR
    ? path.join(process.env.CLAUDE_JOB_DIR, "tmp")
    : tmpdir();
}

async function postThrough(documentId: string) {
  await transitionDocument(session, documentId, "submitted");
  await transitionDocument(session, documentId, "approved");
  await transitionDocument(session, documentId, "posted");
}

function onHand(itemId: string) {
  return listInventory(companyId).then((inventory) =>
    inventory.balances.find((row) => row.item_id === itemId && row.warehouse_id === warehouseId)?.on_hand ?? "0.0000",
  );
}

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpRoot(), "moarix-documents-"));
  process.env.DATABASE_DRIVER = "local";
  process.env.LOCAL_DATABASE_PATH = path.join(databaseDirectory, "pglite");

  const database = await getDatabase();
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  await database.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-document-test', 'Synthetic Document Test')",
      [companyId],
    );
    await tx.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, 'not-a-login-password-hash')",
      [userId, session.email, session.userName],
    );
    await tx.query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [companyId, userId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name) VALUES
         ($1, $3, 'customer', 'SYN-DOC-CUSTOMER', 'Synthetic Document Customer'),
         ($2, $3, 'supplier', 'SYN-DOC-SUPPLIER', 'Synthetic Document Supplier')`,
      [customerId, supplierId, companyId],
    );
    await tx.query(
      `INSERT INTO warehouses (id, company_id, code, name)
       VALUES ($1, $2, 'SYN-WH', 'Synthetic Warehouse')`,
      [warehouseId, companyId],
    );
    await tx.query(
      `INSERT INTO items
         (id, company_id, sku, name, kind, unit, sale_price, purchase_price, track_inventory)
       VALUES
         ($1, $4, 'SYN-PART', 'Synthetic Spare Part', 'product', 'EA', 10000, 7000, true),
         ($2, $4, 'SYN-SVC', 'Synthetic Service Hour', 'service', 'HR', 80000, 0, false),
         ($3, $4, 'SYN-PART-2', 'Synthetic Spare Part Two', 'product', 'EA', 4000, 2500, true)`,
      [trackedItemId, serviceItemId, extraItemId, companyId],
    );
  });
}, 60_000);

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("fulfillment documents post inventory", () => {
  it("posts a receipt into on-hand stock in the same transaction", async () => {
    const created = await createDocument(session, {
      kind: "receipt",
      counterpartyId: supplierId,
      warehouseId,
      issueDate: "2026-08-20",
      lines: [{
        itemId: trackedItemId,
        quantity: "5",
        unitPrice: "7000",
        discountRate: "0",
        taxRate: "10",
      }],
    } as CreateDocumentInput);

    await postThrough(created.id);

    expect(await onHand(trackedItemId)).toBe("5.0000");
    const inventory = await listInventory(companyId);
    const movement = inventory.movements.find((row) => row.reference_number === created.number);
    expect(movement).toMatchObject({
      movement_type: "receipt",
      sku: "SYN-PART",
      quantity: "5.0000",
    });
  });

  it("posts a shipment as an issue and refuses to post when stock would go negative", async () => {
    await postInventoryMovement(session, {
      warehouseId,
      itemId: extraItemId,
      movementType: "receipt",
      quantity: "5",
      unitCost: "2500",
      reason: "합성 출고 시험 시드",
      idempotencyKey: randomUUID(),
    });

    const shipment = await createDocument(session, {
      kind: "shipment",
      counterpartyId: customerId,
      warehouseId,
      issueDate: "2026-08-21",
      lines: [{
        itemId: extraItemId,
        quantity: "2",
        unitPrice: "4000",
        discountRate: "0",
        taxRate: "10",
      }],
    } as CreateDocumentInput);

    await postThrough(shipment.id);
    expect(await onHand(extraItemId)).toBe("3.0000");

    const overdrawn = await createDocument(session, {
      kind: "shipment",
      counterpartyId: customerId,
      warehouseId,
      issueDate: "2026-08-21",
      lines: [{
        itemId: extraItemId,
        quantity: "99",
        unitPrice: "4000",
        discountRate: "0",
        taxRate: "10",
      }],
    } as CreateDocumentInput);
    await transitionDocument(session, overdrawn.id, "submitted");
    await transitionDocument(session, overdrawn.id, "approved");
    await expect(transitionDocument(session, overdrawn.id, "posted")).rejects.toThrow("Negative stock");

    const detail = await getDocumentDetail(companyId, overdrawn.id, "shipment");
    expect(detail?.document.status).toBe("approved");
    expect(await onHand(extraItemId)).toBe("3.0000");
  });

  it("posts a converted fulfillment document with the warehouse chosen at confirmation", async () => {
    const order = await createDocument(session, {
      kind: "purchase_order",
      counterpartyId: supplierId,
      issueDate: "2026-08-22",
      itemId: trackedItemId,
      quantity: "2",
      unitPrice: "7000",
      discountRate: "0",
      taxRate: "10",
    });
    await postThrough(order.id);
    const receipt = await convertDocument(session, order.id);
    await transitionDocument(session, receipt.id, "submitted");
    await transitionDocument(session, receipt.id, "approved");
    const before = await onHand(trackedItemId);
    await transitionDocument(session, receipt.id, "posted", warehouseId);

    const detail = await getDocumentDetail(companyId, receipt.id, "receipt");
    expect(detail?.document.warehouse_id).toBe(warehouseId);
    expect(Number(await onHand(trackedItemId))).toBe(Number(before) + 2);
  });

  it("skips non-inventory lines and requires a warehouse on shipment or receipt post", async () => {
    const serviceOnly = await createDocument(session, {
      kind: "receipt",
      counterpartyId: supplierId,
      warehouseId,
      issueDate: "2026-08-22",
      lines: [{
        itemId: serviceItemId,
        quantity: "3",
        unitPrice: "80000",
        discountRate: "0",
        taxRate: "10",
      }],
    } as CreateDocumentInput);
    await postThrough(serviceOnly.id);
    expect(await onHand(serviceItemId)).toBe("0.0000");

    const quote = await createDocument(session, {
      kind: "quote",
      counterpartyId: customerId,
      issueDate: "2026-08-22",
      itemId: trackedItemId,
      quantity: "1",
      unitPrice: "10000",
      discountRate: "0",
      taxRate: "10",
    });
    await postThrough(quote.id);
    const quoteInventory = await listInventory(companyId);
    expect(quoteInventory.movements.some((row) => row.reference_number === quote.number)).toBe(false);

    const missingWarehouse = await createDocument(session, {
      kind: "receipt",
      counterpartyId: supplierId,
      issueDate: "2026-08-22",
      itemId: extraItemId,
      quantity: "1",
      unitPrice: "2500",
      discountRate: "0",
      taxRate: "10",
    });
    await transitionDocument(session, missingWarehouse.id, "submitted");
    await transitionDocument(session, missingWarehouse.id, "approved");
    await expect(transitionDocument(session, missingWarehouse.id, "posted")).rejects.toThrow(/warehouse/i);
  });
});

describe("draft document line replacement", () => {
  it("replaces every draft line in one update", async () => {
    const created = await createDocument(session, {
      kind: "quote",
      counterpartyId: customerId,
      issueDate: "2026-08-23",
      lines: [
        { itemId: trackedItemId, quantity: "1", unitPrice: "10000", discountRate: "0", taxRate: "10" },
        { itemId: extraItemId, quantity: "2", unitPrice: "4000", discountRate: "0", taxRate: "10" },
      ],
    });

    const updated = await updateDraftDocument(session, {
      documentId: created.id,
      kind: "quote",
      expectedVersion: 1,
      counterpartyId: customerId,
      issueDate: "2026-08-24",
      notes: "합성 다중행 수정",
      lines: [
        { itemId: extraItemId, quantity: "3", unitPrice: "4000", discountRate: "0", taxRate: "10" },
        { itemId: serviceItemId, quantity: "1", unitPrice: "80000", discountRate: "0", taxRate: "10" },
        { itemId: trackedItemId, quantity: "4", unitPrice: "10000", discountRate: "5", taxRate: "10" },
      ],
    } as UpdateDraftDocumentInput);

    expect(updated.version).toBe(2);
    const detail = await getDocumentDetail(companyId, created.id, "quote");
    expect(detail?.lines).toHaveLength(3);
    expect(detail?.lines.map((line) => line.sku_snapshot)).toEqual(["SYN-PART-2", "SYN-SVC", "SYN-PART"]);
    expect(detail?.lines[2]?.quantity).toBe("4.0000");
    const historyCount = await withCompany(companyId, async (tx) => {
      const result = await tx.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM document_lines WHERE document_id = $1",
        [created.id],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
    expect(historyCount).toBe(5);
  });

  it("rejects physical deletion of document lines", async () => {
    const created = await createDocument(session, {
      kind: "quote",
      counterpartyId: customerId,
      itemId: trackedItemId,
      issueDate: "2026-08-25",
      quantity: "1",
      unitPrice: "10000",
      discountRate: "0",
      taxRate: "10",
    });

    await expect(withCompany(companyId, (tx) =>
      tx.query("DELETE FROM document_lines WHERE document_id = $1", [created.id]),
    )).rejects.toThrow(/append-only/i);
  });

  it("still updates a single-line draft through the original fields", async () => {
    const created = await createDocument(session, {
      kind: "quote",
      counterpartyId: customerId,
      itemId: trackedItemId,
      issueDate: "2026-08-25",
      quantity: "2",
      unitPrice: "10000",
      discountRate: "5",
      taxRate: "10",
    });
    const updated = await updateDraftDocument(session, {
      documentId: created.id,
      kind: "quote",
      expectedVersion: 1,
      counterpartyId: customerId,
      itemId: trackedItemId,
      issueDate: "2026-08-25",
      quantity: "3",
      unitPrice: "10000",
      discountRate: "5",
      taxRate: "10",
      notes: "합성 단일행 수정",
    });
    expect(updated.version).toBe(2);
    const detail = await getDocumentDetail(companyId, created.id, "quote");
    expect(detail?.lines).toHaveLength(1);
    expect(detail?.lines[0]?.quantity).toBe("3.0000");
  });
});
