"use client";

import { useActionState, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import type { OpenDocumentRow } from "@/lib/services/settlements";
import { createSettlementAction } from "./actions";

export function SettlementForm({
  counterparties,
  invoices,
  bills,
  today,
}: {
  counterparties: CounterpartyRow[];
  invoices: OpenDocumentRow[];
  bills: OpenDocumentRow[];
  today: string;
}) {
  const [state, action] = useActionState(createSettlementAction, initialFormState);
  const [direction, setDirection] = useState<"receipt" | "payment">("receipt");
  const [counterpartyId, setCounterpartyId] = useState("");
  const visible = (direction === "receipt" ? invoices : bills).filter((row) => {
    if (!counterpartyId) return true;
    return counterparties.find((party) => party.id === counterpartyId)?.name === row.counterparty_name;
  });

  return <form action={action} className="form-grid">
    <label><span>구분 *</span><select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as "receipt" | "payment")}><option value="receipt">입금 (미수 배부)</option><option value="payment">지급 (미지급 배부)</option></select></label>
    <label><span>거래처 *</span><select name="counterpartyId" required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="" disabled>거래처 선택</option>{counterparties.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>금액 *</span><input name="amount" inputMode="decimal" required /></label>
    <label><span>일자 *</span><input name="settledOn" type="date" defaultValue={today} required /></label>
    <label><span>방법 *</span><select name="method" defaultValue="bank"><option value="bank">계좌</option><option value="card">카드</option><option value="cash">현금</option><option value="offset">상계</option><option value="other">기타</option></select></label>
    <label><span>참조번호</span><input name="reference" maxLength={80} /></label>
    <fieldset className="full">
      <legend>배부 대상 (만기순 FIFO)</legend>
      {visible.length === 0 ? <p className="muted">선택된 거래처의 미결 문서가 없습니다.</p> : visible.map((row) => (
        <label key={row.id} className="check-row">
          <input type="checkbox" name="documentIds" value={row.id} defaultChecked />
          <span>{row.number} · 미결 {row.open_amount} · {row.aging}</span>
        </label>
      ))}
    </fieldset>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>배부 확정</SubmitButton></div>
  </form>;
}
