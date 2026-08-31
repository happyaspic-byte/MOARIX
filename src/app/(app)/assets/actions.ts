"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { parseCsv, matchHeaderAlias } from "@/lib/csv/csv-engine";
import {
  ASSET_HEADER_ALIASES,
  CONTRACT_HEADER_ALIASES,
  validateAssetImportRow,
  validateContractImportRow,
  bulkImportAssets,
  bulkImportContracts,
  AssetImportValidationError,
  type BulkImportAssetItem,
  type BulkImportContractItem,
} from "@/lib/services/asset-import-service";
import { createAsset } from "@/lib/services/assets-service";
import { assetSchema } from "@/lib/validation/forms";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;

export async function createAssetAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("assets:write");
    await createAsset(session, parsed.data);
    revalidatePath("/assets");
    revalidatePath("/service");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/inspections");
    return { status: "success", message: "고객 자산을 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 자산을 등록하지 못했습니다.") };
  }
}

export async function importAssetsCsvAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await requirePermission("assets:write");
    const file = formData.get("csvFile") as File | null;
    if (!file || file.size === 0) {
      return { status: "error", message: "가져올 CSV 파일을 선택하세요." };
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return { status: "error", message: "CSV 파일은 5 MiB 이하만 가져올 수 있습니다." };
    }

    const text = await file.text();
    const { headers, rawRows } = parseCsv(text);
    if (rawRows.length === 0) {
      return { status: "error", message: "CSV 파일에 데이터 행이 없습니다." };
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return { status: "error", message: "CSV 파일은 10,000개 행 이하만 가져올 수 있습니다." };
    }

    const aliasMapping = matchHeaderAlias(headers, ASSET_HEADER_ALIASES);
    const mappedHeaders = Object.values(aliasMapping).filter((value): value is string => Boolean(value));
    const duplicateHeaders = [...new Set(mappedHeaders.filter((value, index) => mappedHeaders.indexOf(value) !== index))];
    if (duplicateHeaders.length > 0) {
      return { status: "error", message: `CSV 열이 중복 매핑되었습니다: ${duplicateHeaders.join(", ")}` };
    }
    const validItems: BulkImportAssetItem[] = [];
    const validationErrors: string[] = [];

    for (const row of rawRows) {
      const canonicalData: Record<string, unknown> = {};
      row.rawValues.forEach((val, idx) => {
        const canonicalKey = aliasMapping[idx];
        if (canonicalKey) {
          canonicalData[canonicalKey] = val;
        }
      });

      const validation = validateAssetImportRow(canonicalData, row.lineNumber);
      if (validation.isValid && validation.data) {
        validItems.push({ ...validation.data, lineNumber: row.lineNumber });
      } else {
        const errDesc = validation.errors.map((e) => `${e.field}: ${e.message}`).join(", ");
        validationErrors.push(`${row.lineNumber}행: ${errDesc}`);
      }
    }

    if (validationErrors.length > 0) {
      return {
        status: "error",
        message: `자산 CSV를 반영하지 않았습니다. 오류를 수정한 뒤 다시 시도하세요.\n${validationErrors.slice(0, 8).join("\n")}${validationErrors.length > 8 ? `\n외 ${validationErrors.length - 8}건` : ""}`,
      };
    }
    if (validItems.length === 0) return { status: "error", message: "CSV 파일에 유효한 데이터 행이 없습니다." };

    const result = await bulkImportAssets(session, validItems);
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return {
      status: "success",
      message: `자산 ${result.totalCount}건 처리 완료: 신규 ${result.insertedCount}건, 갱신 ${result.updatedCount}건`,
    };
  } catch (error) {
    if (error instanceof AssetImportValidationError) {
      const details = error.errors
        .slice(0, 8)
        .map((entry) => `${entry.lineNumber}행 ${entry.field}: ${entry.message}`)
        .join("\n");
      const suffix = error.errors.length > 8 ? `\n외 ${error.errors.length - 8}건` : "";
      return { status: "error", message: `자산 CSV를 반영하지 않았습니다. 오류를 수정한 뒤 다시 시도하세요.\n${details}${suffix}` };
    }
    return { status: "error", message: publicError(error, "자산 CSV 가져오기에 실패했습니다.") };
  }
}

export async function importContractsCsvAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await requirePermission("assets:write");
    const file = formData.get("csvFile") as File | null;
    if (!file || file.size === 0) {
      return { status: "error", message: "가져올 CSV 파일을 선택하세요." };
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return { status: "error", message: "CSV 파일은 5 MiB 이하만 가져올 수 있습니다." };
    }

    const text = await file.text();
    const { headers, rawRows } = parseCsv(text);
    if (rawRows.length === 0) {
      return { status: "error", message: "CSV 파일에 데이터 행이 없습니다." };
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return { status: "error", message: "CSV 파일은 10,000개 행 이하만 가져올 수 있습니다." };
    }

    const aliasMapping = matchHeaderAlias(headers, CONTRACT_HEADER_ALIASES);
    const mappedHeaders = Object.values(aliasMapping).filter((value): value is string => Boolean(value));
    const duplicateHeaders = [...new Set(mappedHeaders.filter((value, index) => mappedHeaders.indexOf(value) !== index))];
    if (duplicateHeaders.length > 0) {
      return { status: "error", message: `CSV 열이 중복 매핑되었습니다: ${duplicateHeaders.join(", ")}` };
    }
    const validItems: BulkImportContractItem[] = [];
    const validationErrors: string[] = [];

    for (const row of rawRows) {
      const canonicalData: Record<string, unknown> = {};
      row.rawValues.forEach((val, idx) => {
        const canonicalKey = aliasMapping[idx];
        if (canonicalKey) {
          canonicalData[canonicalKey] = val;
        }
      });

      const validation = validateContractImportRow(canonicalData, row.lineNumber);
      if (validation.isValid && validation.data) {
        validItems.push({ ...validation.data, lineNumber: row.lineNumber });
      } else {
        const errDesc = validation.errors.map((e) => `${e.field}: ${e.message}`).join(", ");
        validationErrors.push(`${row.lineNumber}행: ${errDesc}`);
      }
    }

    if (validationErrors.length > 0) {
      return {
        status: "error",
        message: `계약 CSV를 반영하지 않았습니다. 오류를 수정한 뒤 다시 시도하세요.\n${validationErrors.slice(0, 8).join("\n")}${validationErrors.length > 8 ? `\n외 ${validationErrors.length - 8}건` : ""}`,
      };
    }
    if (validItems.length === 0) return { status: "error", message: "CSV 파일에 유효한 데이터 행이 없습니다." };

    const result = await bulkImportContracts(session, validItems);
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return {
      status: "success",
      message: `계약 ${result.insertedCount}건 등록 완료 (대상 자산 미일치 ${result.skippedCount}건)`,
    };
  } catch (error) {
    if (error instanceof AssetImportValidationError) {
      const details = error.errors
        .slice(0, 8)
        .map((entry) => `${entry.lineNumber}행 ${entry.field}: ${entry.message}`)
        .join("\n");
      const suffix = error.errors.length > 8 ? `\n외 ${error.errors.length - 8}건` : "";
      return { status: "error", message: `계약 CSV를 반영하지 않았습니다. 오류를 수정한 뒤 다시 시도하세요.\n${details}${suffix}` };
    }
    return { status: "error", message: publicError(error, "계약 CSV 가져오기에 실패했습니다.") };
  }
}
