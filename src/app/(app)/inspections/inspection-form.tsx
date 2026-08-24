"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { AssetRow } from "@/lib/services/assets-service";
import { createInspectionAction } from "./actions";

export function InspectionForm({ assets }: { assets: AssetRow[] }) {
  const [state, action] = useActionState(createInspectionAction, initialFormState);
  return <form action={action} className="form-grid">
    <label className="full"><span>점검 자산 *</span><select name="assetId" required defaultValue=""><option value="" disabled>고객·사업장·자산 선택</option>{assets.filter((asset) => asset.site_id && asset.status !== "retired").map((asset) => <option key={asset.id} value={asset.id}>{asset.counterparty_name} · {asset.site} · {asset.vendor_asset_id ?? asset.asset_tag}</option>)}</select></label>
    <label><span>점검 유형 *</span><select name="inspectionType" defaultValue="quarterly"><option value="installation">설치 점검</option><option value="preventive">예방 점검</option><option value="quarterly">정기 점검</option><option value="incident">장애 점검</option><option value="upgrade">업그레이드</option></select></label>
    <label><span>예정일 *</span><input name="scheduledDate" type="date" required /></label>
    <label className="full"><span>보고서 참조</span><input name="reportReference" maxLength={300} placeholder="고객 양식명 또는 문서 저장 위치" /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>점검 일정 등록</SubmitButton></div>
  </form>;
}
