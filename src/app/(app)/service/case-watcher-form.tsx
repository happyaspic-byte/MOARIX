"use client";

import { useActionState, useEffect, useRef } from "react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { addServiceCaseWatcherAction } from "./actions";

export function CaseWatcherForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(addServiceCaseWatcherAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    formRef.current?.closest("details")?.removeAttribute("open");
  }, [state]);

  return <form ref={formRef} action={action} className="form-grid">
    <div className="popover-head full"><strong>Task Watch List 수신자</strong><DrawerCloseButton /></div>
    <input type="hidden" name="caseId" value={caseId} />
    <label><span>이름·목록명</span><input name="displayName" maxLength={120} placeholder="예: 고객 운영팀" /></label>
    <label><span>구분 *</span><select name="source" defaultValue="manual"><option value="manual">개별 수신자</option><option value="customer">고객</option><option value="vendor">지원사</option><option value="distribution_list">배포 목록</option></select></label>
    <label className="full"><span>이메일 *</span><input name="email" type="email" maxLength={254} required placeholder="operations@example.invalid" /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>Watch List 추가</SubmitButton></div>
  </form>;
}
