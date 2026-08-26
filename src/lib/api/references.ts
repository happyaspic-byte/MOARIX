import { ApiError } from "./errors";

export function resolveExactReference<T extends { id: string }>(
  rows: readonly T[],
  reference: string,
  fields: readonly (keyof T)[],
  label: string,
) {
  const normalized = reference.trim().toLocaleLowerCase("en-US");
  const matches = rows.filter((row) => fields.some((field) => {
    const value = row[field];
    return typeof value === "string" && value.toLocaleLowerCase("en-US") === normalized;
  }));
  if (matches.length === 0) throw new ApiError("NOT_FOUND", 404, `${label} 참조 '${reference}'를 찾을 수 없습니다.`);
  if (matches.length > 1) throw new ApiError("AMBIGUOUS_REFERENCE", 409, `${label} 참조 '${reference}'가 여러 항목과 일치합니다. UUID를 사용하세요.`);
  return matches[0]!;
}

export function filterAndLimit<T>(
  rows: readonly T[],
  input: { query?: string; status?: string; limit?: number },
  searchFields: readonly (keyof T)[],
) {
  const query = input.query?.trim().toLocaleLowerCase("en-US");
  const status = input.status?.trim().toLocaleLowerCase("en-US");
  return rows
    .filter((row) => !status || Object.entries(row as Record<string, unknown>).some(
      ([key, value]) => key === "status" && typeof value === "string" && value.toLocaleLowerCase("en-US") === status,
    ))
    .filter((row) => !query || searchFields.some((field) => {
      const value = row[field];
      return typeof value === "string" && value.toLocaleLowerCase("en-US").includes(query);
    }))
    .slice(0, input.limit ?? 100);
}
