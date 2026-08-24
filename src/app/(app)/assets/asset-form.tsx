"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import { createAssetAction } from "./actions";

export function AssetForm({ counterparties }: { counterparties: CounterpartyRow[] }) {
  const [state, action] = useActionState(createAssetAction, initialFormState);
  return <form action={action} className="form-grid">
    <label className="full"><span>고객사 *</span><select name="counterpartyId" required defaultValue=""><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier").map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>자산 태그 *</span><input name="assetTag" maxLength={50} placeholder="AST-001" required /></label>
    <label><span>제품명 *</span><input name="productName" maxLength={160} required /></label>
    <label><span>일련번호</span><input name="serialNumber" maxLength={120} /></label>
    <label><span>설치 위치</span><input name="site" maxLength={200} /></label>
    <label><span>설치일</span><input name="installedAt" type="date" /></label>
    <label><span>보증 만료일</span><input name="warrantyUntil" type="date" /></label>
    <label><span>지원 만료일</span><input name="supportUntil" type="date" /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>자산 등록</SubmitButton></div>
  </form>;
}
