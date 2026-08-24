"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createAsset } from "@/lib/services/assets-service";
import { assetSchema } from "@/lib/validation/forms";

export async function createAssetAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("assets:write");
    await createAsset(session, parsed.data);
    revalidatePath("/assets");
    revalidatePath("/service");
    revalidatePath("/dashboard");
    return { status: "success", message: "고객 자산을 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 자산을 등록하지 못했습니다.") };
  }
}
