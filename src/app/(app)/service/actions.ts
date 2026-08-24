"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createServiceCase } from "@/lib/services/assets-service";
import { serviceCaseSchema } from "@/lib/validation/forms";

export async function createServiceCaseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    const result = await createServiceCase(session, parsed.data);
    revalidatePath("/service");
    revalidatePath("/dashboard");
    return { status: "success", message: `${result.number} 서비스 케이스를 접수했습니다.` };
  } catch (error) {
    return { status: "error", message: publicError(error, "서비스 케이스를 접수하지 못했습니다.") };
  }
}
