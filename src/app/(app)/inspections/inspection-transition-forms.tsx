"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { InspectionStatus } from "@/lib/domain/inspection-state";
import { transitionInspectionAction } from "./actions";

export function QuickInspectionAction({ inspectionId, nextStatus, label }: { inspectionId: string; nextStatus: InspectionStatus; label: string }) {
  const [state, action] = useActionState(transitionInspectionAction, initialFormState);
  return <form action={action} className="inline-action-form"><input type="hidden" name="inspectionId" value={inspectionId} /><input type="hidden" name="nextStatus" value={nextStatus} /><SubmitButton className="button small">{label}</SubmitButton><FormMessage state={state} /></form>;
}

export function InspectionResultForm({ inspectionId }: { inspectionId: string }) {
  const [state, action] = useActionState(transitionInspectionAction, initialFormState);
  return <form action={action} className="form-grid">
    <input type="hidden" name="inspectionId" value={inspectionId} />
    <label><span>결과 상태 *</span><select name="nextStatus" defaultValue="completed"><option value="completed">완료</option><option value="issue_found">조치 필요</option></select></label>
    <label><span>시스템 건전성 *</span><select name="systemHealth" defaultValue="healthy"><option value="healthy">정상</option><option value="warning">주의</option><option value="critical">위험</option></select></label>
    <label><span>Protection *</span><select name="protectionStatus" defaultValue="pass"><option value="pass">PASS</option><option value="warning">주의</option><option value="fail">FAIL</option><option value="na">해당 없음</option></select></label>
    <label><span>Sync *</span><select name="syncStatus" defaultValue="pass"><option value="pass">PASS</option><option value="warning">주의</option><option value="fail">FAIL</option><option value="na">해당 없음</option></select></label>
    <label><span>Service *</span><select name="serviceStatus" defaultValue="pass"><option value="pass">PASS</option><option value="warning">주의</option><option value="fail">FAIL</option><option value="na">해당 없음</option></select></label>
    <label><span>CPU 사용률 (%)</span><input name="cpuPercent" type="number" min="0" max="100" step="0.01" /></label>
    <label><span>메모리 사용률 (%)</span><input name="memoryPercent" type="number" min="0" max="100" step="0.01" /></label>
    <label><span>디스크 사용률 (%)</span><input name="diskPercent" type="number" min="0" max="100" step="0.01" /></label>
    <label><span>다음 점검일</span><input name="nextInspectionDate" type="date" /></label>
    <label className="full"><span>발견 사항</span><textarea name="findings" maxLength={5000} placeholder="조치 필요 상태에서는 필수입니다." /></label>
    <label className="full"><span>조치 내용·후속 작업</span><textarea name="actionItems" maxLength={5000} /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>점검 결과 저장</SubmitButton></div>
  </form>;
}
