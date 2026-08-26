import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/repository";
import { getDatabase, withCompany } from "@/lib/db/client";
import {
  drivingLogSchema,
  drivingLogTransitionSchema,
} from "@/lib/validation/forms";
import {
  createDrivingLog,
  getDrivingLog,
  getDrivingLogMonthSummary,
  listDrivingLogs,
  transitionDrivingLog,
  updateDrivingLog,
  type DrivingLogInput,
} from "./driving-logs";

const companyId = randomUUID();
const creatorId = randomUUID();
const approverId = randomUUID();
const customerId = randomUUID();
const otherCustomerId = randomUUID();
const siteId = randomUUID();
const assetId = randomUUID();
const caseId = randomUUID();
let databaseDirectory = "";

function session(userId: string, role: SessionContext["role"]): SessionContext {
  return {
    sessionId: randomUUID(),
    userId,
    companyId,
    userName: userId === creatorId ? "합성 운행 작성자" : "합성 운행 승인자",
    email: `${userId}@example.invalid`,
    companyName: "Synthetic Driving Log Test",
    companyTimezone: "Asia/Seoul",
    role,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };
}

const creatorSession = session(creatorId, "manager");
const approverSession = session(approverId, "manager");
const viewerSession = session(approverId, "viewer");

const baseInput: DrivingLogInput = {
  startDate: "2026-08-10",
  endDate: "2026-08-12",
  departure: "창원",
  destination: "동탄",
  purpose: "합성 고객사 Stratus 정기점검",
  vehicleName: "합성 시험 차량",
  distanceKm: "687",
  ratePerKm: "200",
  tollAmount: "31200",
  parkingAmount: "0",
  fuelAmount: "0",
  dailyAllowanceAmount: "60000",
  siteId,
  caseId,
  reason: "고객사 현장 점검",
  notes: "실제 인물·차량 정보가 아닌 합성 테스트 데이터",
};

beforeAll(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "moarix-driving-logs-"));
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
      "INSERT INTO companies (id, slug, name) VALUES ($1, 'synthetic-driving-log', 'Synthetic Driving Log Test')",
      [companyId],
    );
    await tx.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES
         ($1, $3, '합성 운행 작성자', 'not-a-login-password-hash'),
         ($2, $4, '합성 운행 승인자', 'not-a-login-password-hash')`,
      [creatorId, approverId, creatorSession.email, approverSession.email],
    );
    await tx.query(
      `INSERT INTO company_members (company_id, user_id, role) VALUES
         ($1, $2, 'manager'), ($1, $3, 'manager')`,
      [companyId, creatorId, approverId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name) VALUES
         ($1, $3, 'customer', 'SYN-TRIP-CUSTOMER', 'Synthetic Trip Customer'),
         ($2, $3, 'customer', 'SYN-TRIP-OTHER', 'Synthetic Other Customer')`,
      [customerId, otherCustomerId, companyId],
    );
    await tx.query(
      `INSERT INTO customer_sites (id, company_id, counterparty_id, code, name)
       VALUES ($1, $2, $3, 'SYN-TRIP-SITE', 'Synthetic Trip Site')`,
      [siteId, companyId, customerId],
    );
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, product_name,
          product_family, protection_mode)
       VALUES ($1, $2, $3, $4, 'SYN-TRIP-ASSET', 'Synthetic everRun Asset',
               'everrun', 'ft')`,
      [assetId, companyId, customerId, siteId],
    );
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, title, created_by)
       VALUES ($1, $2, 'SYN-TRIP-CASE', $3, $4, 'Synthetic Trip Case', $5)`,
      [caseId, companyId, customerId, assetId, creatorId],
    );
  });
}, 60_000);

afterAll(async () => {
  await (await getDatabase()).close();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("driving log service", () => {
  it("normalizes AI-friendly numeric input and validates transition reasons", () => {
    const parsed = drivingLogSchema.parse({
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      departure: "창원",
      destination: "부산",
      purpose: "합성 점검",
      vehicleName: "합성 차량",
      distanceKm: 85.5,
      ratePerKm: 200,
    });
    expect(parsed).toMatchObject({
      distanceKm: "85.5",
      ratePerKm: "200",
      tollAmount: "0",
      parkingAmount: "0",
      fuelAmount: "0",
      dailyAllowanceAmount: "0",
    });
    expect(() => drivingLogTransitionSchema.parse({
      drivingLogId: randomUUID(),
      expectedVersion: 1,
      nextStatus: "void",
    })).toThrow();
  });

  it("creates, edits, submits, independently approves, summarizes, and voids a log", async () => {
    await expect(createDrivingLog(creatorSession, {
      ...baseInput,
      counterpartyId: otherCustomerId,
    })).rejects.toThrow("customer/site mismatch");

    const created = await createDrivingLog(creatorSession, baseInput);
    expect(created).toMatchObject({
      number: "TRIP-2026-00001",
      version: 1,
      totalAmount: "228600.0000",
    });

    await expect(updateDrivingLog(creatorSession, {
      ...baseInput,
      drivingLogId: created.id,
      expectedVersion: 2,
    })).rejects.toThrow("version conflict");

    const updated = await updateDrivingLog(creatorSession, {
      ...baseInput,
      drivingLogId: created.id,
      expectedVersion: 1,
      distanceKm: "688",
      parkingAmount: "5000",
    });
    expect(updated).toMatchObject({ version: 2, totalAmount: "233800.0000" });

    const listed = await listDrivingLogs(viewerSession, {
      month: "2026-08",
      query: "동탄",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      counterparty_id: customerId,
      site_id: siteId,
      case_id: caseId,
      distance_km: "688.0000",
      total_amount: "233800.0000",
      status: "draft",
      version: 2,
    });

    const submitted = await transitionDrivingLog(creatorSession, {
      drivingLogId: created.id,
      nextStatus: "submitted",
      expectedVersion: 2,
    });
    expect(submitted).toMatchObject({ status: "submitted", version: 3 });

    await expect(transitionDrivingLog(creatorSession, {
      drivingLogId: created.id,
      nextStatus: "approved",
      expectedVersion: 3,
    })).rejects.toThrow("Self approval");

    const approved = await transitionDrivingLog(approverSession, {
      drivingLogId: created.id,
      nextStatus: "approved",
      expectedVersion: 3,
    });
    expect(approved).toMatchObject({ status: "approved", version: 4 });

    await expect(updateDrivingLog(creatorSession, {
      ...baseInput,
      drivingLogId: created.id,
      expectedVersion: 4,
    })).rejects.toThrow("Only draft driving logs can be edited");

    await expect(withCompany(companyId, (tx) => tx.query(
      "UPDATE driving_logs SET notes = 'forbidden', version = version + 1 WHERE id = $1",
      [created.id],
    ))).rejects.toThrow("Only draft driving logs can be edited");
    await expect(withCompany(companyId, (tx) => tx.query(
      "DELETE FROM driving_logs WHERE id = $1",
      [created.id],
    ))).rejects.toThrow("cannot be deleted");

    const approvedSummary = await getDrivingLogMonthSummary(viewerSession, "2026-08");
    expect(approvedSummary).toEqual({
      month: "2026-08",
      entry_count: 1,
      draft_count: 0,
      submitted_count: 0,
      approved_count: 1,
      void_count: 0,
      distance_km: "688.0000",
      claimed_total_amount: "233800.0000",
      pending_total_amount: "0",
      approved_total_amount: "233800.0000",
    });

    await expect(transitionDrivingLog(approverSession, {
      drivingLogId: created.id,
      nextStatus: "void",
      expectedVersion: 4,
    })).rejects.toThrow("Void reason is required");

    const voided = await transitionDrivingLog(approverSession, {
      drivingLogId: created.id,
      nextStatus: "void",
      expectedVersion: 4,
      reason: "합성 승인 취소 사유",
    });
    expect(voided).toMatchObject({ status: "void", version: 5 });

    const detail = await getDrivingLog(viewerSession, created.id);
    expect(detail).toMatchObject({
      status: "void",
      approved_by: approverId,
      voided_by: approverId,
      void_reason: "합성 승인 취소 사유",
      version: 5,
    });
    await expect(withCompany(companyId, (tx) => tx.query(
      `UPDATE driving_logs
       SET void_reason = 'forbidden rewrite', version = version + 1
       WHERE id = $1`,
      [created.id],
    ))).rejects.toThrow("Invalid driving log transition");

    const voidedSummary = await getDrivingLogMonthSummary(viewerSession, "2026-08");
    expect(voidedSummary).toMatchObject({
      entry_count: 1,
      approved_count: 0,
      void_count: 1,
      distance_km: "0",
      claimed_total_amount: "0",
      approved_total_amount: "0",
    });

    const audit = await withCompany(companyId, (tx) => tx.query<{ action: string }>(
      `SELECT action FROM audit_logs
       WHERE entity_id = $1 ORDER BY created_at, id`,
      [created.id],
    ));
    expect(audit.rows.map((row) => row.action)).toEqual([
      "driving_log.created",
      "driving_log.updated",
      "driving_log.status_changed",
      "driving_log.status_changed",
      "driving_log.status_changed",
    ]);
  });
});
