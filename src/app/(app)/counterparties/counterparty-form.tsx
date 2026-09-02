"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import { createCounterpartyAction, deleteCounterpartyAction, updateCounterpartyAction } from "./actions";

export function CounterpartyForm({ initial }: { initial?: CounterpartyRow }) {
  const [state, action] = useActionState(initial ? updateCounterpartyAction : createCounterpartyAction, initialFormState);
  return (
    <form action={action} className="form-grid">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label><span>거래처 코드 *</span><input name="code" maxLength={30} placeholder="CUST-001" required defaultValue={initial?.code ?? ""} /></label>
      <label><span>유형 *</span><select name="kind" defaultValue={initial?.kind ?? "customer"}><option value="customer">고객</option><option value="supplier">공급사</option><option value="both">고객 + 공급사</option></select></label>
      <label className="full"><span>거래처명 *</span><input name="name" maxLength={120} placeholder="회사명" required defaultValue={initial?.name ?? ""} /></label>
      <label><span>사업자번호</span><input name="businessNumber" maxLength={20} placeholder="123-45-67890" defaultValue={initial?.business_number ?? ""} /></label>
      <label><span>대표자</span><input name="representativeName" maxLength={80} defaultValue={initial?.representative_name ?? ""} /></label>
      <label><span>이메일</span><input name="email" type="email" maxLength={254} defaultValue={initial?.email ?? ""} /></label>
      <label><span>전화번호</span><input name="phone" maxLength={30} defaultValue={initial?.phone ?? ""} /></label>
      <label className="full"><span>주소</span><input name="address" maxLength={300} defaultValue={initial?.address ?? ""} /></label>
      <label><span>결제 조건(일)</span><input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={initial?.payment_terms_days ?? 30} required /></label>
      <label><span>신용 한도</span><input name="creditLimit" inputMode="decimal" defaultValue={initial?.credit_limit ?? "0"} required /></label>
      <div className="full"><FormMessage state={state} /></div>
      <div className="form-actions"><SubmitButton>{initial ? "거래처 저장" : "거래처 등록"}</SubmitButton></div>
    </form>
  );
}

export function DeleteCounterpartyForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteCounterpartyAction, initialFormState);
  return (
    <form action={action} className="inline-action-form" onSubmit={(event) => {
      if (!window.confirm(`${name} 거래처를 삭제할까요? 연결된 사업장·자산이 있으면 삭제되지 않습니다.`)) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="button small danger" aria-label={`${name} 거래처 삭제`}>삭제</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
