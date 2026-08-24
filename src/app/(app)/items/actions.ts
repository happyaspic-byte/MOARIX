"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createItem } from "@/lib/services/master-data";
import { itemSchema } from "@/lib/validation/forms";

export async function createItemAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = itemSchema.safeParse({ ...Object.fromEntries(formData), trackInventory: formData.get("trackInventory") === "on" });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("master:write");
    await createItem(session, parsed.data);
    revalidatePath("/items"); revalidatePath("/inventory");
    return { status: "success", message: "품목을 등록했습니다." };
  } catch (error) { return { status: "error", message: publicError(error, "품목을 등록하지 못했습니다.") }; }
}
