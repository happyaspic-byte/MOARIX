"use client";

import { useActionState, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { AssetRow } from "@/lib/services/assets-service";
import type { CounterpartyRow } from "@/lib/services/master-data";
import { createServiceCaseAction } from "./actions";

export function ServiceCaseForm({ counterparties, assets }: { counterparties: CounterpartyRow[]; assets: AssetRow[] }) {
  const [state, action] = useActionState(createServiceCaseAction, initialFormState);
  const [counterpartyId, setCounterpartyId] = useState("");
  const availableAssets = assets.filter((asset) => asset.counterparty_id === counterpartyId && asset.status !== "retired");
  return <form action={action} className="form-grid">
    <label className="full"><span>고객사 *</span><select name="counterpartyId" required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier").map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>관련 자산</span><select name="assetId" defaultValue="" key={counterpartyId} disabled={!counterpartyId}><option value="">자산 미지정</option>{availableAssets.map((row) => <option key={row.id} value={row.id}>{row.vendor_asset_id ?? row.asset_tag} · {row.site} · {row.product_name}</option>)}</select></label>
    <label><span>심각도 *</span><select name="severity" defaultValue="normal"><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option><option value="critical">긴급</option></select></label>
    <label className="full"><span>제목 *</span><input name="title" maxLength={200} required /></label>
    <label className="full"><span>상세 내용</span><textarea name="description" maxLength={5000} /></label>
    <label className="full"><span>처리 기한</span><input name="dueAt" type="datetime-local" /></label>
    <label><span>외부 지원사</span><input name="externalProvider" maxLength={80} placeholder="예: Stratus" /></label>
    <label><span>외부 케이스 번호</span><input name="externalCaseNumber" maxLength={120} placeholder="예: CS0303776" /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>케이스 접수</SubmitButton></div>
  </form>;
}
