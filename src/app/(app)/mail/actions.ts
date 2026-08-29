"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { enqueueOutboundMessage } from "@/lib/services/outbound-mail";

const schema = z.object({
  toAddress: z.string().email(),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
});

export async function enqueueMailAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    await enqueueOutboundMessage(session, parsed.data);
    revalidatePath("/mail");
    return { status: "success", message: "메일을 발송 큐에 넣었습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "메일 큐 등록에 실패했습니다.") };
  }
}
