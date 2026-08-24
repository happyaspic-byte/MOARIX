"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import {
  appendServiceCaseActivity,
  createServiceCase,
  registerServiceCaseAttachment,
  transitionServiceCase,
} from "@/lib/services/service-cases";
import {
  serviceCaseActivitySchema,
  serviceCaseAttachmentSchema,
  serviceCaseSchema,
  serviceCaseTransitionSchema,
} from "@/lib/validation/forms";

export async function createServiceCaseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    const result = await createServiceCase(session, parsed.data);
    revalidatePath("/service");
    revalidatePath("/dashboard");
    revalidatePath("/sites");
    revalidatePath("/reports");
    return { status: "success", message: `${result.number} 서비스 케이스를 접수했습니다.` };
  } catch (error) {
    return { status: "error", message: publicError(error, "서비스 케이스를 접수하지 못했습니다.") };
  }
}

export async function transitionServiceCaseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCaseTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    await transitionServiceCase(session, parsed.data);
    revalidatePath("/service");
    revalidatePath(`/service/${parsed.data.caseId}`);
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    return { status: "success", message: "서비스 케이스 상태를 변경했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "서비스 케이스 상태를 변경하지 못했습니다.") };
  }
}

export async function addServiceCaseActivityAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCaseActivitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    await appendServiceCaseActivity(session, parsed.data);
    revalidatePath("/service");
    revalidatePath(`/service/${parsed.data.caseId}`);
    return { status: "success", message: "케이스 활동을 기록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "케이스 활동을 기록하지 못했습니다.") };
  }
}

export async function registerServiceCaseAttachmentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceCaseAttachmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("service:write");
    await registerServiceCaseAttachment(session, parsed.data);
    revalidatePath("/service");
    revalidatePath(`/service/${parsed.data.caseId}`);
    return { status: "success", message: "첨부 자료 링크를 등록했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "첨부 자료 링크를 등록하지 못했습니다.") };
  }
}
