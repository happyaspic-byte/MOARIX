"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { postInventoryMovement } from "@/lib/services/inventory-service";
import { inventoryMovementSchema } from "@/lib/validation/forms";

export async function postInventoryMovementAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = inventoryMovementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  try {
    const session = await requirePermission("inventory:write");
    await postInventoryMovement(session, parsed.data);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { status: "success", message: "재고 변동을 원장에 반영했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "재고 변동을 반영하지 못했습니다.") };
  }
}
