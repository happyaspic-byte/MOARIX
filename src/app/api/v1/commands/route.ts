import { z } from "zod";
import { assertApiCommandAccess } from "@/lib/api/access";
import {
  assertCommandInputAccess,
  executeCommand,
  getCommandDefinition,
  parseCommandInput,
} from "@/lib/api/command-registry";
import {
  completeCommand,
  releaseCommand,
  reserveCommand,
  validateIdempotencyKey,
} from "@/lib/api/idempotency";
import {
  apiErrorResponse,
  apiResponse,
  authenticateApiRequest,
  readJsonBody,
  requestId,
} from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  operation: z.string().trim().min(3).max(100).regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
  input: z.record(z.string(), z.unknown()).default({}),
  dryRun: z.boolean().default(false),
}).strict();

export async function POST(request: Request) {
  const currentRequestId = requestId();
  try {
    const actor = await authenticateApiRequest(request);
    const commandRequest = requestSchema.parse(await readJsonBody(request));
    const definition = getCommandDefinition(commandRequest.operation);
    assertApiCommandAccess(actor, definition);
    const input = parseCommandInput(definition, commandRequest.input);
    assertCommandInputAccess(definition, actor, input);

    if (commandRequest.dryRun) {
      return apiResponse(
        {
          operation: definition.operation,
          mode: definition.mode,
          normalizedInput: input,
          executable: true,
          applied: false,
          validation: ["authentication", "token_scope", "role_permission", "json_schema"],
          note: "실제 반영 시 현재 DB 상태에 대한 업무 규칙을 다시 검사합니다.",
        },
        { requestId: currentRequestId, dryRun: true, replayed: false },
      );
    }

    if (definition.mode === "read") {
      const data = await executeCommand(definition, actor, input);
      return apiResponse(data, { requestId: currentRequestId, dryRun: false, replayed: false });
    }

    const idempotencyKey = validateIdempotencyKey(request.headers.get("idempotency-key"));
    const reservation = await reserveCommand({
      companyId: actor.companyId,
      apiTokenId: actor.apiTokenId,
      idempotencyKey,
      operation: definition.operation,
      commandInput: input,
    });
    if (reservation.state === "replayed") {
      return apiResponse(reservation.responseData, {
        requestId: currentRequestId,
        dryRun: false,
        replayed: true,
        idempotencyKey,
      });
    }

    let commandCompleted = false;
    try {
      const data = await executeCommand(definition, actor, input);
      commandCompleted = true;
      await completeCommand(actor.companyId, reservation.storageKey, reservation.requestHash, data);
      return apiResponse(data, {
        requestId: currentRequestId,
        dryRun: false,
        replayed: false,
        idempotencyKey,
      });
    } catch (error) {
      if (!commandCompleted) {
        await releaseCommand(actor.companyId, reservation.storageKey, reservation.requestHash).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error, currentRequestId);
  }
}
