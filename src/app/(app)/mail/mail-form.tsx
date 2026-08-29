"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { enqueueMailAction } from "./actions";

export function MailQueueForm() {
  const [state, action] = useActionState(enqueueMailAction, initialFormState);
  return <form action={action} className="form-grid">
    <label><span>수신 이메일 *</span><input name="toAddress" type="email" required /></label>
    <label className="full"><span>제목 *</span><input name="subject" maxLength={160} required /></label>
    <label className="full"><span>본문 *</span><textarea name="body" maxLength={4000} required /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>큐에 넣기</SubmitButton></div>
  </form>;
}
