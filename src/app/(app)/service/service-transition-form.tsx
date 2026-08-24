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
  const needsReason = nextStatus === "waiting" || nextStatus === "resolved";
  return <form action={action} className={needsReason ? "transition-form" : "inline-action-form"}>
    <input type="hidden" name="caseId" value={caseId} />
    <input type="hidden" name="nextStatus" value={nextStatus} />
    {nextStatus === "waiting" ? <input name="waitingReason" maxLength={1000} required aria-label="대기 사유" placeholder="대기 사유" /> : null}
    {nextStatus === "resolved" ? <input name="resolutionSummary" maxLength={2000} required aria-label="해결 내용" placeholder="해결 내용" /> : null}
    <SubmitButton className={nextStatus === "closed" ? "button small danger" : "button small"}>{labels[nextStatus]}</SubmitButton>
    <FormMessage state={state} />
  </form>;
}
