"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { addServiceCaseActivityAction } from "./actions";

export function CaseActivityForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(addServiceCaseActivityAction, initialFormState);
  const [kind, setKind] = useState("comment");
  const formRef = useRef<HTMLFormElement>(null);
  const external = kind === "vendor_reply" || kind === "customer_reply";
  useEffect(() => {
    if (state.status === "success") formRef.current?.closest("details")?.removeAttribute("open");
  }, [state]);

  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="caseId" value={caseId} />
    <label><span>활동 유형 *</span><select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="comment">담당자 댓글</option><option value="internal_note">내부 작업 메모</option><option value="vendor_reply">지원사 회신</option><option value="customer_reply">고객 회신</option></select></label>
    {external ? <label><span>외부 작성자 *</span><input name="authorName" maxLength={120} required placeholder="이름 또는 지원팀" /></label> : <div />}
    <label className="full"><span>내용 *</span><textarea name="body" maxLength={20000} rows={8} required placeholder="기술 분석, 확인 내용, 명령어와 권고사항을 줄바꿈 그대로 기록하세요." /></label>
    <label><span>실제 발생 시각</span><input name="occurredAt" type="datetime-local" /><small className="helper-text">과거 외부 회신을 옮길 때만 지정합니다.</small></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>활동 기록</SubmitButton></div>
  </form>;
}
