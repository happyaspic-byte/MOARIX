import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { SessionContext } from "@/lib/auth/repository";
import {
  assertDrivingLogDraft,
  assertDrivingLogTransition,
  drivingLogStatuses,
  type DrivingLogStatus,
} from "@/lib/domain/driving-log-state";
import { roundCurrency } from "@/lib/domain/money";
import { withCompany, type TransactionClient } from "@/lib/db/client";
import { assertPermission } from "@/lib/security/permissions";
import { writeAudit } from "./audit";

export type DrivingLogInput = {
  startDate: string;
  endDate: string;
  departure: string;
  destination: string;
  purpose: string;
  vehicleName: string;
  distanceKm: string;
  ratePerKm: string;
  tollAmount: string;
  parkingAmount: string;
  fuelAmount: string;
  dailyAllowanceAmount: string;
  counterpartyId?: string;
  siteId?: string;
  caseId?: string;
  reason?: string;
  notes?: string;
};

export type UpdateDrivingLogInput = DrivingLogInput & {
  drivingLogId: string;
  expectedVersion: number;
};

export type DrivingLogTransitionInput = {
  drivingLogId: string;
  nextStatus: DrivingLogStatus;
  expectedVersion: number;
  reason?: string;
};

export type DrivingLogListFilters = {
  month?: string;
  status?: DrivingLogStatus;
  counterpartyId?: string;
  caseId?: string;
  query?: string;
  limit?: number;
};

export type DrivingLogRow = {
  id: string;
  number: string;
  start_date: string;
  end_date: string;
  departure: string;
  destination: string;
  purpose: string;
  vehicle_name: string;
  distance_km: string;
  rate_per_km: string;
  toll_amount: string;
  parking_amount: string;
  fuel_amount: string;
  daily_allowance_amount: string;
  total_amount: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  site_id: string | null;
  site_name: string | null;
  case_id: string | null;
  case_number: string | null;
  status: DrivingLogStatus;
  reason: string | null;
  notes: string | null;
  void_reason: string | null;
  created_by: string;
  created_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type DrivingLogMonthSummary = {
  month: string;
  entry_count: number;
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  void_count: number;
  distance_km: string;
  claimed_total_amount: string;
  pending_total_amount: string;
  approved_total_amount: string;
};

type NormalizedAmounts = {
  distanceKm: string;
  ratePerKm: string;
  tollAmount: string;
  parkingAmount: string;
  fuelAmount: string;
  dailyAllowanceAmount: string;
  totalAmount: string;
};

function normalizeDecimal(value: string, label: string, positive = false) {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`${label} must be a valid number`);
  }
  if (!decimal.isFinite() || decimal.lt(0) || (positive && decimal.isZero())) {
    throw new Error(`${label} must be ${positive ? "greater than zero" : "zero or greater"}`);
  }
  return decimal.toFixed(4);
}

export function calculateDrivingLogAmounts(input: DrivingLogInput): NormalizedAmounts {
  const distanceKm = normalizeDecimal(input.distanceKm, "Distance", true);
  const ratePerKm = normalizeDecimal(input.ratePerKm, "Rate per km");
  const tollAmount = normalizeDecimal(input.tollAmount, "Toll amount");
  const parkingAmount = normalizeDecimal(input.parkingAmount, "Parking amount");
  const fuelAmount = normalizeDecimal(input.fuelAmount, "Fuel amount");
  const dailyAllowanceAmount = normalizeDecimal(input.dailyAllowanceAmount, "Daily allowance");
  const totalAmount = roundCurrency(
    new Decimal(distanceKm)
      .mul(ratePerKm)
      .plus(tollAmount)
      .plus(parkingAmount)
      .plus(fuelAmount)
      .plus(dailyAllowanceAmount),
    "KRW",
  ).toFixed(4);
  return {
    distanceKm,
    ratePerKm,
    tollAmount,
    parkingAmount,
    fuelAmount,
    dailyAllowanceAmount,
    totalAmount,
  };
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be an ISO date`);
  }
}

function assertDrivingLogInput(input: DrivingLogInput) {
  assertIsoDate(input.startDate, "Start date");
  assertIsoDate(input.endDate, "End date");
  if (input.endDate < input.startDate) throw new Error("End date cannot be before start date");
  for (const [label, value] of [
    ["Departure", input.departure],
    ["Destination", input.destination],
    ["Purpose", input.purpose],
    ["Vehicle name", input.vehicleName],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} is required`);
  }
}

function normalizeOptionalId(value: string | undefined) {
  return value?.trim() || null;
}

async function resolveDrivingLogLinks(tx: TransactionClient, input: DrivingLogInput) {
  let counterpartyId = normalizeOptionalId(input.counterpartyId);
  const siteId = normalizeOptionalId(input.siteId);
  const caseId = normalizeOptionalId(input.caseId);

  let siteCounterpartyId: string | null = null;
  if (siteId) {
    const siteResult = await tx.query<{ counterparty_id: string }>(
      `SELECT counterparty_id FROM customer_sites WHERE id = $1`,
      [siteId],
    );
    const site = siteResult.rows[0];
    if (!site) throw new Error("Driving log site not found");
    siteCounterpartyId = site.counterparty_id;
    counterpartyId ??= siteCounterpartyId;
    if (counterpartyId !== siteCounterpartyId) throw new Error("Driving log customer/site mismatch");
  }

  if (caseId) {
    const caseResult = await tx.query<{ counterparty_id: string; site_id: string | null }>(
      `SELECT service_case.counterparty_id, asset.site_id
       FROM service_cases service_case
       LEFT JOIN assets asset
         ON asset.company_id = service_case.company_id AND asset.id = service_case.asset_id
       WHERE service_case.id = $1`,
      [caseId],
    );
    const serviceCase = caseResult.rows[0];
    if (!serviceCase) throw new Error("Driving log service case not found");
    counterpartyId ??= serviceCase.counterparty_id;
    if (counterpartyId !== serviceCase.counterparty_id) {
      throw new Error("Driving log customer/case mismatch");
    }
    if (siteId && serviceCase.site_id && siteId !== serviceCase.site_id) {
      throw new Error("Driving log site/case mismatch");
    }
  }

  if (counterpartyId) {
    const customer = await tx.query<{ id: string }>(
      `SELECT id FROM counterparties
       WHERE id = $1 AND kind IN ('customer', 'both')`,
      [counterpartyId],
    );
    if (!customer.rows[0]) throw new Error("Driving log customer not found");
  }

  return { counterpartyId, siteId, caseId };
}

async function nextDrivingLogNumber(
  tx: TransactionClient,
  companyId: string,
  year: string,
) {
  const counterKind = `driving_log:${year}`;
  await tx.query(
    `INSERT INTO document_counters (company_id, kind, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, kind) DO NOTHING`,
    [companyId, counterKind],
  );
  const result = await tx.query<{ value: string }>(
    `UPDATE document_counters
     SET next_value = next_value + 1
     WHERE company_id = $1 AND kind = $2
     RETURNING (next_value - 1)::text AS value`,
    [companyId, counterKind],
  );
  const value = Number(result.rows[0]?.value ?? 1);
  return `TRIP-${year}-${String(value).padStart(5, "0")}`;
}

export function createDrivingLog(session: SessionContext, input: DrivingLogInput) {
  assertPermission(session.role, "trips:write");
  assertDrivingLogInput(input);
  const amounts = calculateDrivingLogAmounts(input);
  const id = randomUUID();
  return withCompany(session.companyId, async (tx) => {
    const links = await resolveDrivingLogLinks(tx, input);
    const number = await nextDrivingLogNumber(tx, session.companyId, input.startDate.slice(0, 4));
    await tx.query(
      `INSERT INTO driving_logs
         (id, company_id, number, start_date, end_date, departure, destination,
          purpose, vehicle_name, distance_km, rate_per_km, toll_amount,
          parking_amount, fuel_amount, daily_allowance_amount, total_amount,
          counterparty_id, site_id, case_id, reason, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        id,
        session.companyId,
        number,
        input.startDate,
        input.endDate,
        input.departure.trim(),
        input.destination.trim(),
        input.purpose.trim(),
        input.vehicleName.trim(),
        amounts.distanceKm,
        amounts.ratePerKm,
        amounts.tollAmount,
        amounts.parkingAmount,
        amounts.fuelAmount,
        amounts.dailyAllowanceAmount,
        amounts.totalAmount,
        links.counterpartyId,
        links.siteId,
        links.caseId,
        input.reason?.trim() || null,
        input.notes?.trim() || null,
        session.userId,
      ],
    );
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "driving_log.created",
      entityType: "driving_log",
      entityId: id,
      summary: `${number} ${input.departure.trim()} → ${input.destination.trim()} 운행일지 작성`,
      afterData: {
        number,
        status: "draft",
        startDate: input.startDate,
        distanceKm: amounts.distanceKm,
        totalAmount: amounts.totalAmount,
      },
    });
    return { id, number, version: 1, totalAmount: amounts.totalAmount };
  });
}

export function updateDrivingLog(session: SessionContext, input: UpdateDrivingLogInput) {
  assertPermission(session.role, "trips:write");
  assertDrivingLogInput(input);
  const amounts = calculateDrivingLogAmounts(input);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("Expected version must be a positive integer");
  }
  return withCompany(session.companyId, async (tx) => {
    const currentResult = await tx.query<{
      number: string;
      status: DrivingLogStatus;
      version: number;
      total_amount: string;
    }>(
      `SELECT number, status, version, total_amount::text
       FROM driving_logs WHERE id = $1 FOR UPDATE`,
      [input.drivingLogId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Driving log not found");
    assertDrivingLogDraft(current.status);
    if (current.version !== input.expectedVersion) throw new Error("Driving log version conflict");
    const links = await resolveDrivingLogLinks(tx, input);
    const updated = await tx.query<{ version: number }>(
      `UPDATE driving_logs
       SET start_date = $3, end_date = $4, departure = $5, destination = $6,
           purpose = $7, vehicle_name = $8, distance_km = $9, rate_per_km = $10,
           toll_amount = $11, parking_amount = $12, fuel_amount = $13,
           daily_allowance_amount = $14, total_amount = $15, counterparty_id = $16,
           site_id = $17, case_id = $18, reason = $19, notes = $20,
           version = version + 1
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [
        input.drivingLogId,
        input.expectedVersion,
        input.startDate,
        input.endDate,
        input.departure.trim(),
        input.destination.trim(),
        input.purpose.trim(),
        input.vehicleName.trim(),
        amounts.distanceKm,
        amounts.ratePerKm,
        amounts.tollAmount,
        amounts.parkingAmount,
        amounts.fuelAmount,
        amounts.dailyAllowanceAmount,
        amounts.totalAmount,
        links.counterpartyId,
        links.siteId,
        links.caseId,
        input.reason?.trim() || null,
        input.notes?.trim() || null,
      ],
    );
    if (!updated.rows[0]) throw new Error("Driving log version conflict");
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "driving_log.updated",
      entityType: "driving_log",
      entityId: input.drivingLogId,
      summary: `${current.number} 운행일지 수정`,
      beforeData: { version: current.version, totalAmount: current.total_amount },
      afterData: { version: updated.rows[0].version, totalAmount: amounts.totalAmount },
    });
    return {
      id: input.drivingLogId,
      number: current.number,
      version: updated.rows[0].version,
      totalAmount: amounts.totalAmount,
    };
  });
}

export function transitionDrivingLog(session: SessionContext, input: DrivingLogTransitionInput) {
  if (!drivingLogStatuses.includes(input.nextStatus)) throw new Error("Invalid driving log status");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("Expected version must be a positive integer");
  }
  return withCompany(session.companyId, async (tx) => {
    const currentResult = await tx.query<{
      number: string;
      status: DrivingLogStatus;
      created_by: string;
      version: number;
    }>(
      `SELECT number, status, created_by, version
       FROM driving_logs WHERE id = $1 FOR UPDATE`,
      [input.drivingLogId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Driving log not found");
    const approvalMutation = input.nextStatus === "approved" || current.status === "approved";
    assertPermission(session.role, approvalMutation ? "trips:approve" : "trips:write");
    if (current.version !== input.expectedVersion) throw new Error("Driving log version conflict");
    assertDrivingLogTransition(current.status, input.nextStatus);
    if (input.nextStatus === "approved" && current.created_by === session.userId) {
      throw new Error("Self approval is not allowed for driving logs");
    }
    const transitionReason = input.reason?.trim() || null;
    if ((input.nextStatus === "void" || input.nextStatus === "draft") && !transitionReason) {
      throw new Error(input.nextStatus === "void" ? "Void reason is required" : "Return reason is required");
    }

    const updated = await tx.query<{ version: number }>(
      `UPDATE driving_logs
       SET status = $3,
           submitted_at = CASE
             WHEN $3 = 'draft' THEN NULL
             WHEN $3 = 'submitted' THEN pg_catalog.now()
             ELSE submitted_at
           END,
           approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END,
           approved_at = CASE WHEN $3 = 'approved' THEN pg_catalog.now() ELSE approved_at END,
           voided_by = CASE WHEN $3 = 'void' THEN $4 ELSE voided_by END,
           voided_at = CASE WHEN $3 = 'void' THEN pg_catalog.now() ELSE voided_at END,
           void_reason = CASE WHEN $3 = 'void' THEN $5 ELSE void_reason END,
           version = version + 1
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [input.drivingLogId, input.expectedVersion, input.nextStatus, session.userId, transitionReason],
    );
    if (!updated.rows[0]) throw new Error("Driving log version conflict");
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "driving_log.status_changed",
      entityType: "driving_log",
      entityId: input.drivingLogId,
      summary: `${current.number} 상태 ${current.status} → ${input.nextStatus}`,
      beforeData: { status: current.status, version: current.version },
      afterData: {
        status: input.nextStatus,
        version: updated.rows[0].version,
        reason: transitionReason,
      },
    });
    return {
      id: input.drivingLogId,
      number: current.number,
      status: input.nextStatus,
      version: updated.rows[0].version,
    };
  });
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Month must use YYYY-MM format");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month must use YYYY-MM format");
  }
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  if (nextYear > 9999) throw new Error("Month is outside the supported range");
  return {
    start: `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

const drivingLogSelect = `
  SELECT driving_log.id, driving_log.number, driving_log.start_date::text,
         driving_log.end_date::text, driving_log.departure, driving_log.destination,
         driving_log.purpose, driving_log.vehicle_name, driving_log.distance_km::text,
         driving_log.rate_per_km::text, driving_log.toll_amount::text,
         driving_log.parking_amount::text, driving_log.fuel_amount::text,
         driving_log.daily_allowance_amount::text, driving_log.total_amount::text,
         driving_log.counterparty_id, customer.name AS counterparty_name,
         driving_log.site_id, site.name AS site_name, driving_log.case_id,
         service_case.number AS case_number, driving_log.status, driving_log.reason,
         driving_log.notes, driving_log.void_reason, driving_log.created_by,
         creator.name AS created_by_name, driving_log.approved_by,
         approver.name AS approved_by_name, driving_log.voided_by,
         voider.name AS voided_by_name, driving_log.submitted_at::text,
         driving_log.approved_at::text, driving_log.voided_at::text,
         driving_log.created_at::text, driving_log.updated_at::text, driving_log.version
  FROM driving_logs driving_log
  LEFT JOIN counterparties customer
    ON customer.company_id = driving_log.company_id AND customer.id = driving_log.counterparty_id
  LEFT JOIN customer_sites site
    ON site.company_id = driving_log.company_id AND site.id = driving_log.site_id
  LEFT JOIN service_cases service_case
    ON service_case.company_id = driving_log.company_id AND service_case.id = driving_log.case_id
  JOIN users creator ON creator.id = driving_log.created_by
  LEFT JOIN users approver ON approver.id = driving_log.approved_by
  LEFT JOIN users voider ON voider.id = driving_log.voided_by`;

export function listDrivingLogs(session: SessionContext, filters: DrivingLogListFilters = {}) {
  assertPermission(session.role, "trips:read");
  const conditions: string[] = [];
  const parameters: unknown[] = [];
  const addParameter = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };
  if (filters.month) {
    const range = monthRange(filters.month);
    const start = addParameter(range.start);
    const end = addParameter(range.end);
    conditions.push(`driving_log.start_date >= ${start} AND driving_log.start_date < ${end}`);
  }
  if (filters.status) {
    if (!drivingLogStatuses.includes(filters.status)) throw new Error("Invalid driving log status");
    conditions.push(`driving_log.status = ${addParameter(filters.status)}`);
  }
  if (filters.counterpartyId) {
    conditions.push(`driving_log.counterparty_id = ${addParameter(filters.counterpartyId)}`);
  }
  if (filters.caseId) conditions.push(`driving_log.case_id = ${addParameter(filters.caseId)}`);
  if (filters.query?.trim()) {
    const query = addParameter(`%${filters.query.trim()}%`);
    conditions.push(`(
      driving_log.number ILIKE ${query}
      OR driving_log.departure ILIKE ${query}
      OR driving_log.destination ILIKE ${query}
      OR driving_log.purpose ILIKE ${query}
      OR driving_log.vehicle_name ILIKE ${query}
    )`);
  }
  const limit = filters.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Driving log list limit must be between 1 and 200");
  }
  const limitParameter = addParameter(limit);
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<DrivingLogRow>(
      `${drivingLogSelect}
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY driving_log.start_date DESC, driving_log.created_at DESC, driving_log.id DESC
       LIMIT ${limitParameter}`,
      parameters,
    );
    return result.rows;
  });
}

export function getDrivingLog(session: SessionContext, drivingLogId: string) {
  assertPermission(session.role, "trips:read");
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<DrivingLogRow>(
      `${drivingLogSelect} WHERE driving_log.id = $1`,
      [drivingLogId],
    );
    return result.rows[0] ?? null;
  });
}

export function getDrivingLogMonthSummary(session: SessionContext, month: string) {
  assertPermission(session.role, "trips:read");
  const range = monthRange(month);
  return withCompany(session.companyId, async (tx) => {
    const result = await tx.query<Omit<DrivingLogMonthSummary, "month">>(
      `SELECT COUNT(*)::integer AS entry_count,
              COUNT(*) FILTER (WHERE status = 'draft')::integer AS draft_count,
              COUNT(*) FILTER (WHERE status = 'submitted')::integer AS submitted_count,
              COUNT(*) FILTER (WHERE status = 'approved')::integer AS approved_count,
              COUNT(*) FILTER (WHERE status = 'void')::integer AS void_count,
              COALESCE(SUM(distance_km) FILTER (WHERE status <> 'void'), 0)::text AS distance_km,
              COALESCE(SUM(total_amount) FILTER (WHERE status <> 'void'), 0)::text AS claimed_total_amount,
              COALESCE(SUM(total_amount) FILTER (WHERE status = 'submitted'), 0)::text AS pending_total_amount,
              COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved'), 0)::text AS approved_total_amount
       FROM driving_logs
       WHERE start_date >= $1 AND start_date < $2`,
      [range.start, range.end],
    );
    const summary = result.rows[0];
    if (!summary) throw new Error("Driving log month summary failed");
    return { month, ...summary };
  });
}
