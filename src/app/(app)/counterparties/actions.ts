"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createCounterparty, deleteCounterparty, updateCounterparty } from "@/lib/services/master-data";
import { counterpartyDeleteSchema, counterpartySchema, counterpartyUpdateSchema } from "@/lib/validation/forms";

function refreshMaster(counterpartyId?: string) {
  revalidatePath("/counterparties");
  revalidatePath("/sites");
  revalidatePath("/assets");
  revalidatePath("/dashboard");
  if (counterpartyId) revalidatePath(`/counterparties/${counterpartyId}`);
}

export async function createCounterpartyAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("master:write");
    await createCounterparty(session, parsed.data);
    refreshMaster();
    return { status: "success", message: "거래처를 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "거래처를 등록하지 못했습니다.") };
  }
}

export async function updateCounterpartyAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = counterpartyUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("master:write");
    const { id, ...input } = parsed.data;
    await updateCounterparty(session, id, input);
    refreshMaster(id);
    return { status: "success", message: "거래처를 수정했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "거래처를 수정하지 못했습니다.") };
  }
}

export async function deleteCounterpartyAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = counterpartyDeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("master:write");
    await deleteCounterparty(session, parsed.data.id);
    refreshMaster(parsed.data.id);
    return { status: "success", message: "거래처를 삭제했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "거래처를 삭제하지 못했습니다.") };
  }
}
