import { assertApiCommandAccess } from "@/lib/api/access";
import { executeCommand, getCommandDefinition, parseCommandInput } from "@/lib/api/command-registry";
import { apiErrorResponse, apiResponse, authenticateApiRequest, requestId } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const currentRequestId = requestId();
  try {
    const actor = await authenticateApiRequest(request);
    const definition = getCommandDefinition("capabilities.get");
    assertApiCommandAccess(actor, definition);
    const data = await executeCommand(definition, actor, parseCommandInput(definition, {}));
    return apiResponse(data, { requestId: currentRequestId });
  } catch (error) {
    return apiErrorResponse(error, currentRequestId);
  }
}
