import { ZodError } from "zod";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "UNKNOWN_OPERATION"
  | "NOT_FOUND"
  | "AMBIGUOUS_REFERENCE"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "BUSINESS_RULE_VIOLATION"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function businessErrorMessage(error: Error) {
  if (error.message.startsWith("Permission denied")) return "이 작업을 수행할 권한이 없습니다.";
  if (/not found/i.test(error.message)) return "요청한 업무 데이터를 찾을 수 없습니다.";
  if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) return "이미 사용 중인 코드 또는 번호입니다.";
  if (error.message.includes("Invalid service case transition")) return "현재 상태에서 요청한 케이스 상태로 변경할 수 없습니다.";
  if (error.message.includes("Invalid inspection transition")) return "현재 상태에서 요청한 점검 상태로 변경할 수 없습니다.";
  if (error.message.includes("Invalid document transition")) return "현재 상태에서 요청한 문서 상태로 변경할 수 없습니다.";
  if (error.message.includes("Invalid driving log transition")) return "현재 상태에서 요청한 운행일지 상태로 변경할 수 없습니다.";
  if (error.message.includes("self-approve") || error.message.includes("Self approval")) return "작성자는 자신의 운행일지를 승인할 수 없습니다.";
  if (error.message.includes("Waiting reason is required")) return "대기 상태로 변경하려면 대기 사유가 필요합니다.";
  if (error.message.includes("Resolution summary is required")) return "해결 처리하려면 해결 내용을 입력하세요.";
  if (error.message.includes("Inspection result is incomplete")) return "점검 결과의 필수 항목을 모두 입력하세요.";
  if (error.message.includes("Inspection findings are required")) return "조치 필요 상태에서는 발견 사항을 입력하세요.";
  return "업무 규칙에 맞지 않아 요청을 처리하지 못했습니다.";
}

const businessRulePatterns = [
  /mismatch/i,
  /not active/i,
  /required/i,
  /cannot/i,
  /only .* can be edited/i,
  /version conflict/i,
  /invalid .* transition/i,
  /invalid driving log status/i,
  /must be/i,
  /must use/i,
  /outside the supported range/i,
  /duplicate key/i,
  /unique constraint/i,
  /negative stock/i,
  /reserved stock/i,
  /self approval/i,
  /self-approve/i,
  /퇴역/i,
  /진행 중/i,
];

export function toApiError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(
      "INVALID_REQUEST",
      422,
      "입력값을 확인해 주세요.",
      error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    );
  }
  if (error instanceof SyntaxError) return new ApiError("INVALID_REQUEST", 400, "올바른 JSON 요청이 아닙니다.");
  if (error instanceof Error) {
    if (error.message.startsWith("Permission denied")) return new ApiError("FORBIDDEN", 403, businessErrorMessage(error));
    if (/not found/i.test(error.message)) return new ApiError("NOT_FOUND", 404, businessErrorMessage(error));
    if (businessRulePatterns.some((pattern) => pattern.test(error.message))) {
      return new ApiError("BUSINESS_RULE_VIOLATION", 409, businessErrorMessage(error));
    }
    return new ApiError("INTERNAL_ERROR", 500, "요청을 처리하지 못했습니다.");
  }
  return new ApiError("INTERNAL_ERROR", 500, "요청을 처리하지 못했습니다.");
}

export function apiErrorBody(error: ApiError, requestId: string) {
  return {
    apiVersion: "moarix/v1",
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    meta: { requestId },
  };
}
