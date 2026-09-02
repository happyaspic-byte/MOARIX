"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createCustomerSite, deleteCustomerSite, updateCustomerSite } from "@/lib/services/operations-service";
import { customerSiteDeleteSchema, customerSiteSchema, customerSiteUpdateSchema } from "@/lib/validation/forms";

function refreshSites(counterpartyId?: string) {
  revalidatePath("/sites");
  revalidatePath("/assets");
  revalidatePath("/counterparties");
  revalidatePath("/dashboard");
  if (counterpartyId) revalidatePath(`/counterparties/${counterpartyId}`);
}

export async function createCustomerSiteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerSiteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("assets:write");
    await createCustomerSite(session, parsed.data);
    refreshSites(parsed.data.counterpartyId);
    return { status: "success", message: "고객 사업장을 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 사업장을 등록하지 못했습니다.") };
  }
}

export async function updateCustomerSiteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerSiteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("assets:write");
    const { id, ...input } = parsed.data;
    const updated = await updateCustomerSite(session, id, input);
    refreshSites(input.counterpartyId);
    if (updated.previousCounterpartyId !== input.counterpartyId) refreshSites(updated.previousCounterpartyId);
    return { status: "success", message: "고객 사업장을 수정했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 사업장을 수정하지 못했습니다.") };
  }
}

export async function deleteCustomerSiteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerSiteDeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("assets:write");
    await deleteCustomerSite(session, parsed.data.id);
    refreshSites();
    return { status: "success", message: "고객 사업장을 삭제했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "고객 사업장을 삭제하지 못했습니다.") };
  }
}
