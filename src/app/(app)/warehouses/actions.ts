"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createWarehouse } from "@/lib/services/master-data";
import { warehouseSchema } from "@/lib/validation/forms";

export async function createWarehouseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = warehouseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try { const session = await requirePermission("master:write"); await createWarehouse(session, parsed.data); revalidatePath("/warehouses"); return { status: "success", message: "창고를 등록했습니다." }; }
  catch (error) { return { status: "error", message: publicError(error, "창고를 등록하지 못했습니다.") }; }
}
