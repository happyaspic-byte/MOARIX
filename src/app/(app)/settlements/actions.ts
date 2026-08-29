"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createSettlement } from "@/lib/services/settlements";
import { settlementSchema } from "@/lib/validation/forms";

export async function createSettlementAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = settlementSchema.safeParse({
    ...Object.fromEntries(formData),
    documentIds: formData.getAll("documentIds"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    await createSettlement(session, parsed.data);
    revalidatePath("/settlements");
    revalidatePath("/documents/invoice");
    revalidatePath("/documents/bill");
    revalidatePath("/dashboard");
    return { status: "success", message: "입출금을 미결 문서에 배부했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "입출금을 배부하지 못했습니다.") };
  }
}
