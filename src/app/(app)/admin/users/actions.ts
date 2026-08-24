"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createMember, updateMember } from "@/lib/services/admin";
import { memberSchema, memberUpdateSchema } from "@/lib/validation/forms";

export async function createMemberAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("users:manage");
    await createMember(session, parsed.data);
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    return { status: "success", message: "사용자를 추가했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "사용자를 추가하지 못했습니다.") };
  }
}

export async function updateMemberAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = memberUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("users:manage");
    await updateMember(session, parsed.data);
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    return { status: "success", message: "역할과 상태를 변경했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "사용자 설정을 변경하지 못했습니다.") };
  }
}
