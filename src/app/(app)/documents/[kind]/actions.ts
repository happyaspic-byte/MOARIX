"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { createDocument, transitionDocument } from "@/lib/services/documents";
import { documentSchema, documentTransitionSchema } from "@/lib/validation/forms";

export async function createDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    const created = await createDocument(session, parsed.data);
    revalidatePath(`/documents/${parsed.data.kind}`); revalidatePath("/dashboard");
    return { status: "success", message: `${created.number} 문서를 작성했습니다.` };
  } catch (error) { return { status: "error", message: publicError(error, "문서를 작성하지 못했습니다.") }; }
}

export async function transitionDocumentAction(formData: FormData) {
  const parsed = documentTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid document transition request");
  const session = await requirePermission("documents:write");
  await transitionDocument(session, parsed.data.documentId, parsed.data.nextStatus);
  revalidatePath(`/documents/${parsed.data.kind}`); revalidatePath("/dashboard");
}
