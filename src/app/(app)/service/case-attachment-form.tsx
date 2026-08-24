"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { registerServiceCaseAttachmentAction } from "./actions";

export function CaseAttachmentForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(registerServiceCaseAttachmentAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.closest("details")?.removeAttribute("open");
  }, [state]);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="caseId" value={caseId} />
    <label className="full"><span>파일명 *</span><input name="fileName" maxLength={255} required placeholder="diagnostic-bundle.zip" /></label>
    <label className="full"><span>HTTPS 다운로드 주소 *</span><input name="sourceUrl" type="url" maxLength={2048} required placeholder="https://storage.example.com/..." /><small className="helper-text">파일 자체가 아니라 권한이 적용된 다운로드 링크와 메타데이터를 저장합니다.</small></label>
    <label><span>MIME 유형</span><input name="contentType" maxLength={120} placeholder="application/zip" /></label>
    <label><span>파일 크기 (MB)</span><input name="sizeMb" type="number" min="0" max="102400" step="0.01" /></label>
    <label className="full"><span>설명</span><textarea name="description" maxLength={500} placeholder="수집 범위, 암호 전달 방식, 보관 기한 등" /></label>
    <label><span>외부 등록 시각</span><input name="occurredAt" type="datetime-local" /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>첨부 링크 등록</SubmitButton></div>
  </form>;
}
