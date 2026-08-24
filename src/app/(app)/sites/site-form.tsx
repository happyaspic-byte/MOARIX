"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import { createCustomerSiteAction } from "./actions";

export function SiteForm({ counterparties }: { counterparties: CounterpartyRow[] }) {
  const [state, action] = useActionState(createCustomerSiteAction, initialFormState);
  return <form action={action} className="form-grid">
    <label className="full"><span>고객사 *</span><select name="counterpartyId" required defaultValue=""><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier").map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>사업장 코드 *</span><input name="code" maxLength={30} placeholder="PLANT-01" required /></label>
    <label><span>사업장명 *</span><input name="name" maxLength={120} placeholder="창원 1공장" required /></label>
    <label className="full"><span>주소</span><input name="address" maxLength={300} /></label>
    <label><span>고객 담당자</span><input name="contactName" maxLength={80} /></label>
    <label><span>담당자 연락처</span><input name="contactPhone" maxLength={30} /></label>
    <label><span>담당자 이메일</span><input name="contactEmail" type="email" maxLength={254} /></label>
    <label><span>시간대 *</span><select name="timezone" defaultValue="Asia/Seoul"><option value="Asia/Seoul">대한민국 (Asia/Seoul)</option><option value="Europe/Prague">체코 (Europe/Prague)</option><option value="UTC">UTC</option></select></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>사업장 등록</SubmitButton></div>
  </form>;
}
