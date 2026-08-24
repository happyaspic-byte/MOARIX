"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow, ItemRow } from "@/lib/services/master-data";
import type { DocumentKind } from "@/lib/services/documents";
import { createDocumentAction } from "./actions";

export function DocumentForm({ kind, counterparties, items, today }: { kind: DocumentKind; counterparties: CounterpartyRow[]; items: ItemRow[]; today: string }) {
  const [state, action] = useActionState(createDocumentAction, initialFormState);
  return <form action={action} className="form-grid">
    <input type="hidden" name="kind" value={kind} />
    <label className="full"><span>거래처 *</span><select name="counterpartyId" required defaultValue=""><option value="" disabled>거래처 선택</option>{counterparties.map((row) => <option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>발행일 *</span><input name="issueDate" type="date" defaultValue={today} required /></label>
    <label><span>납기·지급 예정일</span><input name="dueDate" type="date" /></label>
    <label className="full"><span>품목 *</span><select name="itemId" required defaultValue=""><option value="" disabled>품목 선택</option>{items.map((row) => <option value={row.id} key={row.id}>{row.sku} · {row.name}</option>)}</select></label>
    <label><span>수량 *</span><input name="quantity" inputMode="decimal" defaultValue="1" required /></label>
    <label><span>단가 *</span><input name="unitPrice" inputMode="decimal" defaultValue="0" required /></label>
    <label><span>할인율(%)</span><input name="discountRate" inputMode="decimal" defaultValue="0" required /></label>
    <label><span>부가세율(%)</span><input name="taxRate" inputMode="decimal" defaultValue="10" required /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} placeholder="거래 조건, 설치 범위 등" /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>문서 작성</SubmitButton></div>
  </form>;
}
