"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createCounterparty } from "@/lib/services/master-data";
import { counterpartySchema } from "@/lib/validation/forms";

export async function createCounterpartyAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("master:write");
    await createCounterparty(session, parsed.data);
    revalidatePath("/counterparties");
    revalidatePath("/dashboard");
    return { status: "success", message: "거래처를 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "거래처를 등록하지 못했습니다.") };
  }
}
