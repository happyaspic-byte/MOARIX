"use client";

import { useActionState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { loginAction } from "./actions";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={nextPath} />
      <label>
        <span>이메일</span>
        <div className="input-with-icon"><Mail size={18} aria-hidden="true" /><input autoComplete="username" inputMode="email" name="email" placeholder="name@company.com" required type="email" /></div>
      </label>
      <label>
        <span>비밀번호</span>
        <div className="input-with-icon"><LockKeyhole size={18} aria-hidden="true" /><input autoComplete="current-password" name="password" placeholder="비밀번호 입력" required type="password" /></div>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="button primary wide">안전하게 로그인</SubmitButton>
    </form>
  );
}
