import { createHash } from "node:crypto";
import { withCompany } from "@/lib/db/client";
import { ApiError } from "./errors";

const IDEMPOTENCY_TTL_HOURS = 24;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function commandRequestHash(operation: string, input: unknown) {
  return createHash("sha256").update(canonicalJson({ operation, input })).digest("hex");
}

export function validateIdempotencyKey(value: string | null) {
  if (!value) throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", 428, "쓰기 명령에는 Idempotency-Key 헤더가 필요합니다.");
  if (!KEY_PATTERN.test(value)) {
    throw new ApiError(
      "INVALID_REQUEST",
      400,
      "Idempotency-Key는 8~128자의 영문, 숫자, 점, 밑줄, 콜론 또는 하이픈이어야 합니다.",
    );
  }
  return value;
}

type Reservation =
  | { state: "reserved"; storageKey: string; requestHash: string }
  | { state: "replayed"; responseData: unknown };

export async function reserveCommand(input: {
  companyId: string;
  apiTokenId: string;
  idempotencyKey: string;
  operation: string;
  commandInput: unknown;
}): Promise<Reservation> {
  const requestHash = commandRequestHash(input.operation, input.commandInput);
  const storageKey = `${input.apiTokenId}:${input.idempotencyKey}`;

  return withCompany(input.companyId, async (tx) => {
    await tx.query("DELETE FROM idempotency_records WHERE expires_at < now()");
    const inserted = await tx.query(
      `INSERT INTO idempotency_records
         (company_id, key, operation, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5::integer))
       ON CONFLICT (company_id, key) DO NOTHING`,
      [input.companyId, storageKey, input.operation, requestHash, IDEMPOTENCY_TTL_HOURS],
    );
    if (inserted.rowCount === 1) return { state: "reserved", storageKey, requestHash };

    const existing = await tx.query<{
      operation: string;
      request_hash: string;
      response_data: unknown | null;
    }>(
      `SELECT operation, request_hash, response_data
       FROM idempotency_records
       WHERE company_id = $1 AND key = $2
       FOR UPDATE`,
      [input.companyId, storageKey],
    );
    const record = existing.rows[0];
    if (!record) throw new ApiError("IDEMPOTENCY_IN_PROGRESS", 409, "동일 명령의 처리 상태를 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
    if (record.operation !== input.operation || record.request_hash !== requestHash) {
      throw new ApiError("IDEMPOTENCY_CONFLICT", 409, "같은 Idempotency-Key가 다른 요청에 이미 사용되었습니다.");
    }
    if (record.response_data !== null) return { state: "replayed", responseData: record.response_data };
    throw new ApiError("IDEMPOTENCY_IN_PROGRESS", 409, "동일한 쓰기 명령이 이미 처리 중입니다.");
  });
}

export function completeCommand(companyId: string, storageKey: string, requestHash: string, responseData: unknown) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query(
      `UPDATE idempotency_records
       SET response_data = $4::jsonb
       WHERE company_id = $1 AND key = $2 AND request_hash = $3 AND response_data IS NULL`,
      [companyId, storageKey, requestHash, JSON.stringify(responseData)],
    );
    if (result.rowCount !== 1) throw new ApiError("IDEMPOTENCY_CONFLICT", 409, "명령 결과의 멱등성 기록을 완료하지 못했습니다.");
  });
}

export function releaseCommand(companyId: string, storageKey: string, requestHash: string) {
  return withCompany(companyId, (tx) => tx.query(
    `DELETE FROM idempotency_records
     WHERE company_id = $1 AND key = $2 AND request_hash = $3 AND response_data IS NULL`,
    [companyId, storageKey, requestHash],
  ));
}
