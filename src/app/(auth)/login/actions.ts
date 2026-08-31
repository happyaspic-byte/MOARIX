"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { writeSessionCookie } from "@/lib/auth/cookies";
import { hasSessionCookieTransportMismatch } from "@/lib/auth/current";
import { authenticate } from "@/lib/auth/repository";
import { safeInternalRedirect } from "@/lib/security/internal-redirect";
import { hashSessionToken } from "@/lib/security/session-token";
import { loginSchema } from "@/lib/validation/forms";

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
    if (hasSessionCookieTransportMismatch(requestHeaders)) {
      return {
        status: "error",
        message: "현재 HTTP 주소에서는 보안 세션 쿠키를 유지할 수 없습니다. HTTPS로 접속하거나 서버의 HTTP 쿠키 허용 설정을 확인해 주세요.",
      };
    }
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientIp = forwardedFor || requestHeaders.get("x-real-ip")?.trim();
    const result = await authenticate(parsed.data.email, parsed.data.password, {
      userAgent: requestHeaders.get("user-agent") ?? undefined,
      ipHash: clientIp ? hashSessionToken(`client-ip:${clientIp}`) : undefined,
    });
    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { status: "error", message: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    await writeSessionCookie(result.token, result.expiresAt);
  } catch (error) {
    console.error("[auth.login] unexpected authentication failure", error);
    return { status: "error", message: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  }

  redirect(safeInternalRedirect(formData.get("next")));
}
