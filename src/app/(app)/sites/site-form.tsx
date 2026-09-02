"use client";

import { useActionState, useId } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import type { CustomerSiteRow } from "@/lib/services/operations-service";
import { createCustomerSiteAction, deleteCustomerSiteAction, updateCustomerSiteAction } from "./actions";

export function SiteForm({ counterparties, initial }: { counterparties: CounterpartyRow[]; initial?: CustomerSiteRow }) {
  const [state, action] = useActionState(initial ? updateCustomerSiteAction : createCustomerSiteAction, initialFormState);
  const customerContactHintId = useId();
  const siContactHintId = useId();
  return <form action={action} className="form-grid">
    {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
    <label className="full"><span>고객사 *</span><select name="counterpartyId" required defaultValue={initial?.counterparty_id ?? ""}><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier" && (row.is_active || row.id === initial?.counterparty_id)).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}{row.is_active ? "" : " · 비활성"}</option>)}</select></label>
    <label><span>사업장 코드 *</span><input name="code" maxLength={30} placeholder="PLANT-01" required defaultValue={initial?.code ?? ""} /></label>
    <label><span>사업장명 *</span><input name="name" maxLength={120} placeholder="창원 1공장" required defaultValue={initial?.name ?? ""} /></label>
    <label className="full"><span>주소</span><input name="address" maxLength={300} defaultValue={initial?.address ?? ""} /></label>

    <fieldset className="contact-fieldset full" aria-describedby={customerContactHintId}>
      <legend>고객 담당자</legend>
      <p id={customerContactHintId}>고객사 현장에서 연락할 담당자입니다.</p>
      <div className="contact-fields">
        <label><span>이름</span><input name="contactName" maxLength={80} autoComplete="section-customer name" defaultValue={initial?.contact_name ?? ""} /></label>
        <label><span>연락처</span><input name="contactPhone" type="tel" maxLength={30} autoComplete="section-customer tel" defaultValue={initial?.contact_phone ?? ""} /></label>
        <label className="full"><span>이메일</span><input name="contactEmail" type="email" maxLength={254} autoComplete="section-customer email" defaultValue={initial?.contact_email ?? ""} /></label>
      </div>
    </fieldset>

    <fieldset className="contact-fieldset full" aria-describedby={siContactHintId}>
      <legend>SI업체 담당자</legend>
      <p id={siContactHintId}>설치·유지보수·장애 대응을 함께할 SI업체 담당자입니다.</p>
      <div className="contact-fields">
        <label><span>이름</span><input name="siContactName" maxLength={80} autoComplete="section-si name" defaultValue={initial?.si_contact_name ?? ""} /></label>
        <label><span>연락처</span><input name="siContactPhone" type="tel" maxLength={30} autoComplete="section-si tel" defaultValue={initial?.si_contact_phone ?? ""} /></label>
        <label className="full"><span>이메일</span><input name="siContactEmail" type="email" maxLength={254} autoComplete="section-si email" defaultValue={initial?.si_contact_email ?? ""} /></label>
      </div>
    </fieldset>

    <label className="full"><span>시간대 *</span><select name="timezone" defaultValue={initial?.timezone ?? "Asia/Seoul"}><option value="Asia/Seoul">대한민국 (Asia/Seoul)</option><option value="Europe/Prague">체코 (Europe/Prague)</option><option value="UTC">UTC</option></select></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>{initial ? "사업장 저장" : "사업장 등록"}</SubmitButton></div>
  </form>;
}

export function DeleteSiteForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteCustomerSiteAction, initialFormState);
  return (
    <form action={action} className="inline-action-form" onSubmit={(event) => {
      if (!window.confirm(`${name} 사업장을 삭제할까요? 연결된 자산이 있으면 삭제되지 않습니다.`)) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="button small danger" aria-label={`${name} 사업장 삭제`}>삭제</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
