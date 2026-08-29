"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import { convertDocument, createDocument, transitionDocument } from "@/lib/services/documents";
import { documentConvertSchema, documentSchema, documentTransitionSchema } from "@/lib/validation/forms";

function parseDocumentForm(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const lines: Array<{ itemId: string; quantity: string; unitPrice: string; discountRate: string; taxRate: string }> = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^lines\.(\d+)\.(\w+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2] as "itemId" | "quantity" | "unitPrice" | "discountRate" | "taxRate";
    lines[index] ??= { itemId: "", quantity: "1", unitPrice: "0", discountRate: "0", taxRate: "10" };
    lines[index][field] = String(value);
  }
  return {
    ...raw,
    lines: lines.filter((line) => line && line.itemId),
  };
}

export async function createDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = documentSchema.safeParse(parseDocumentForm(formData));
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

export async function convertDocumentAction(formData: FormData) {
  const parsed = documentConvertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid document conversion request");
  const session = await requirePermission("documents:write");
  const converted = await convertDocument(session, parsed.data.documentId);
  revalidatePath(`/documents/${parsed.data.kind}`);
  revalidatePath(`/documents/${converted.kind}`);
  revalidatePath("/dashboard");
}
