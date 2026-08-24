"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { writeSessionCookie } from "@/lib/auth/cookies";
import { authenticate } from "@/lib/auth/repository";
import { loginSchema } from "@/lib/validation/forms";

function safeNext(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: "이메일과 비밀번호를 확인해 주세요." };
  }

  try {
    const requestHeaders = await headers();
    const result = await authenticate(parsed.data.email, parsed.data.password, {
      userAgent: requestHeaders.get("user-agent") ?? undefined,
    });
    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { status: "error", message: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    await writeSessionCookie(result.token, result.expiresAt);
  } catch {
    return { status: "error", message: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  }

  redirect(safeNext(formData.get("next")));
}
