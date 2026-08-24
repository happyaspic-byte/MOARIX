"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createCounterpartyAction } from "./actions";

export function CounterpartyForm() {
  const [state, action] = useActionState(createCounterpartyAction, initialFormState);
  return (
    <form action={action} className="form-grid">
      <label><span>거래처 코드 *</span><input name="code" maxLength={30} placeholder="CUST-001" required /></label>
      <label><span>유형 *</span><select name="kind" defaultValue="customer"><option value="customer">고객</option><option value="supplier">공급사</option><option value="both">고객 + 공급사</option></select></label>
      <label className="full"><span>거래처명 *</span><input name="name" maxLength={120} placeholder="회사명" required /></label>
      <label><span>사업자번호</span><input name="businessNumber" maxLength={20} placeholder="123-45-67890" /></label>
      <label><span>대표자</span><input name="representativeName" maxLength={80} /></label>
      <label><span>이메일</span><input name="email" type="email" maxLength={254} /></label>
      <label><span>전화번호</span><input name="phone" maxLength={30} /></label>
      <label className="full"><span>주소</span><input name="address" maxLength={300} /></label>
      <label><span>결제 조건(일)</span><input name="paymentTermsDays" type="number" min="0" max="365" defaultValue="30" required /></label>
      <label><span>신용 한도</span><input name="creditLimit" inputMode="decimal" defaultValue="0" required /></label>
      <div className="full"><FormMessage state={state} /></div>
      <div className="form-actions"><SubmitButton>거래처 등록</SubmitButton></div>
    </form>
  );
}
