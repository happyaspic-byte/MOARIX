"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { AssetRow } from "@/lib/services/assets-service";
import type { CounterpartyRow } from "@/lib/services/master-data";
import { createServiceCaseAction } from "./actions";

export function ServiceCaseForm({ counterparties, assets, defaultAssetId }: { counterparties: CounterpartyRow[]; assets: AssetRow[]; defaultAssetId?: string }) {
  const [state, action] = useActionState(createServiceCaseAction, initialFormState);
  const initialAsset = assets.find((asset) => asset.id === defaultAssetId && asset.status !== "retired");
  const [counterpartyId, setCounterpartyId] = useState(initialAsset?.counterparty_id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const availableAssets = assets.filter((asset) => asset.counterparty_id === counterpartyId && asset.status !== "retired");
  useEffect(() => {
    if (state.status === "success") formRef.current?.closest("details")?.removeAttribute("open");
  }, [state]);
  return <form ref={formRef} action={action} className="form-grid">
    <label className="full"><span>고객사 *</span><select name="counterpartyId" required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier").map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>관련 자산</span><select name="assetId" defaultValue={initialAsset?.counterparty_id === counterpartyId ? initialAsset.id : ""} key={counterpartyId} disabled={!counterpartyId}><option value="">자산 미지정</option>{availableAssets.map((row) => <option key={row.id} value={row.id}>{row.vendor_asset_id ?? row.asset_tag} · {row.site} · {row.product_name}</option>)}</select></label>
    <label><span>케이스 유형 *</span><select name="caseType" defaultValue="incident"><option value="incident">장애</option><option value="request">서비스 요청</option><option value="question">기술 문의</option><option value="maintenance">유지보수</option></select></label>
    <label><span>심각도 *</span><select name="severity" defaultValue="normal"><option value="critical">1 · 긴급</option><option value="high">2 · 높음</option><option value="normal">3 · 보통</option><option value="low">4 · 낮음</option></select></label>
    <label className="full"><span>제목 *</span><input name="title" maxLength={200} required /></label>
    <label className="full"><span>최초 문의·장애 내용</span><textarea name="description" maxLength={20000} rows={9} placeholder="현상, 영향 범위, 발생 시각, 확인한 로그를 기록하세요." /></label>
    <label><span>처리 기한</span><input name="dueAt" type="datetime-local" /></label>
    <label><span>다음 조치일</span><input name="nextActionAt" type="datetime-local" /></label>
    <label><span>고객 담당자</span><input name="contactName" maxLength={120} /></label>
    <label><span>담당자 이메일</span><input name="contactEmail" type="email" maxLength={254} /></label>
    <label><span>담당자 연락처</span><input name="contactPhone" maxLength={30} /></label>
    <label><span>지원 권한·Entitlement</span><input name="entitlement" maxLength={160} placeholder="예: everRun Support 24x7" /></label>
    <label><span>외부 지원사</span><input name="externalProvider" maxLength={80} placeholder="예: Stratus" /></label>
    <label><span>외부 케이스 번호</span><input name="externalCaseNumber" maxLength={120} placeholder="예: CS-DEMO-EXT-0001" /></label>
    <label><span>외부 상태</span><input name="externalState" maxLength={80} placeholder="예: Closed" /></label>
    <label><span>외부 원문 HTTPS 주소</span><input name="sourceUrl" type="url" maxLength={2048} placeholder="https://support.example.com/case/..." /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>케이스 접수</SubmitButton></div>
  </form>;
}
