import { randomUUID } from "node:crypto";
import { authenticateApiToken, type ApiTokenContext } from "@/lib/auth/api-token";
import { ApiError, apiErrorBody, toApiError } from "./errors";

const MAX_BODY_BYTES = 1024 * 1024;

export function requestId() {
  return randomUUID();
}

export async function authenticateApiRequest(request: Request): Promise<ApiTokenContext> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) throw new ApiError("AUTH_REQUIRED", 401, "Bearer API 토큰이 필요합니다.");
  const actor = await authenticateApiToken(match[1]!);
  if (!actor) throw new ApiError("AUTH_REQUIRED", 401, "API 토큰이 유효하지 않거나 만료 또는 폐기되었습니다.");
  return actor;
}

export async function readJsonBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new ApiError("INVALID_REQUEST", 413, "요청 본문은 1 MiB를 초과할 수 없습니다.");
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_BODY_BYTES) {
          await reader.cancel("MOARIX request body limit exceeded").catch(() => undefined);
          throw new ApiError("INVALID_REQUEST", 413, "요청 본문은 1 MiB를 초과할 수 없습니다.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) throw new ApiError("INVALID_REQUEST", 400, "JSON 요청 본문이 필요합니다.");
  return JSON.parse(text) as unknown;
}

export function apiResponse(data: unknown, meta: Record<string, unknown>, status = 200) {
  return Response.json(
    { apiVersion: "moarix/v1", ok: true, data, meta },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": String(meta.requestId ?? ""),
      },
    },
  );
}

export function apiErrorResponse(error: unknown, currentRequestId: string) {
  const apiError = toApiError(error);
  if (apiError.code === "INTERNAL_ERROR") {
    console.error("MOARIX command API internal error", { requestId: currentRequestId, errorType: error instanceof Error ? error.name : typeof error });
  }
  return Response.json(apiErrorBody(apiError, currentRequestId), {
    status: apiError.status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": currentRequestId },
  });
}
