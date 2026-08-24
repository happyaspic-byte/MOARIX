"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { ServiceCaseStatus } from "@/lib/domain/service-case-state";
import { transitionServiceCaseAction } from "./actions";

const labels: Record<ServiceCaseStatus, string> = {
  open: "접수",
  in_progress: "처리 시작",
  waiting: "대기 전환",
  resolved: "해결 처리",
  closed: "종료",
};

export function ServiceTransitionForm({ caseId, nextStatus }: { caseId: string; nextStatus: ServiceCaseStatus }) {
  const [state, action] = useActionState(transitionServiceCaseAction, initialFormState);
  return <form action={action} className="case-transition-form">
    <input type="hidden" name="caseId" value={caseId} />
    <input type="hidden" name="nextStatus" value={nextStatus} />
    {nextStatus === "waiting" ? <><label><span>대기 사유 *</span><textarea name="waitingReason" maxLength={1000} required placeholder="고객 일정 조율, 지원사 회신 대기 등" /></label><label><span>다음 확인 시각</span><input name="nextActionAt" type="datetime-local" /></label></> : null}
    {nextStatus === "in_progress" ? <label><span>다음 조치 시각</span><input name="nextActionAt" type="datetime-local" /></label> : null}
    {nextStatus === "resolved" ? <label><span>해결 내용 *</span><textarea name="resolutionSummary" maxLength={20000} required rows={6} placeholder="원인, 조치, 재발 방지 권고를 기록하세요." /></label> : null}
    <SubmitButton className={nextStatus === "closed" ? "button small danger" : "button small"}>{labels[nextStatus]}</SubmitButton>
    <FormMessage state={state} />
  </form>;
}
