"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { convertDocument, createDocument, transitionDocument, updateDraftDocument } from "@/lib/services/documents";
import { parseDocumentFormData } from "@/lib/validation/document-form-data";
import { documentConvertSchema, documentSchema, documentTransitionSchema, documentUpdateSchema } from "@/lib/validation/forms";

function refreshDocuments(kind: string) {
  revalidatePath(`/documents/${kind}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
}

export async function createDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentSchema.safeParse(parseDocumentFormData(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    const created = await createDocument(session, parsed.data);
    refreshDocuments(parsed.data.kind);
    return { status: "success", message: `${created.number} 문서를 작성했습니다.` };
  } catch (error) { return { status: "error", message: publicError(error, "문서를 작성하지 못했습니다.") }; }
}

export async function updateDraftDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentUpdateSchema.safeParse(parseDocumentFormData(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    const updated = await updateDraftDocument(session, parsed.data);
    refreshDocuments(parsed.data.kind);
    return { status: "success", message: `${updated.number} 초안을 수정했습니다.` };
  } catch (error) { return { status: "error", message: publicError(error, "초안을 수정하지 못했습니다.") }; }
}

export async function transitionDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  try {
    const session = await requirePermission("documents:write");
    await transitionDocument(
      session,
      parsed.data.documentId,
      parsed.data.nextStatus,
      parsed.data.expectedVersion,
      parsed.data.warehouseId,
    );
    refreshDocuments(parsed.data.kind);
    return { status: "success", message: "문서 상태를 변경했습니다." };
  } catch (error) {
    return { status: "error", message: publicError(error, "문서 상태를 변경하지 못했습니다.") };
  }
}

export async function convertDocumentAction(formData: FormData) {
  const parsed = documentConvertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid document conversion request");
  const session = await requirePermission("documents:write");
  const converted = await convertDocument(session, parsed.data.documentId);
  revalidatePath(`/documents/${parsed.data.kind}`);
  revalidatePath(`/documents/${converted.kind}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
}
