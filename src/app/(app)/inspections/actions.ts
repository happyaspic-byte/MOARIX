"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import {
  createInspection,
  transitionInspection,
  confirmInspectionCustomer,
} from "@/lib/services/operations-service";
import { inspectionSchema, inspectionTransitionSchema } from "@/lib/validation/forms";
import { z } from "zod";

function refreshOperations() {
  revalidatePath("/inspections");
  revalidatePath("/assets");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function createInspectionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = inspectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    const result = await createInspection(session, parsed.data);
    refreshOperations();
    revalidatePath(`/assets/${parsed.data.assetId}`);
    return { status: "success", message: `${result.number} 점검 일정을 등록했습니다.` };
  } catch (error) {
    return { status: "error", message: publicError(error, "점검 일정을 등록하지 못했습니다.") };
  }
}

export async function transitionInspectionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = inspectionTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    const result = await transitionInspection(session, parsed.data);
    refreshOperations();
    revalidatePath(`/assets/${result.assetId}`);
    return { status: "success", message: "점검 상태와 결과를 반영했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "점검 상태를 변경하지 못했습니다.") };
  }
}

const customerConfirmSchema = z.object({
  inspectionId: z.string().uuid(),
  confirmedBy: z.string().trim().min(1, "확인자 이름을 입력하세요.").max(80),
});

export async function confirmInspectionCustomerAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerConfirmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    await confirmInspectionCustomer(session, parsed.data);
    refreshOperations();
    return { status: "success", message: "점검 고객 확인을 완료했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 확인에 실패했습니다.") };
  }
}
