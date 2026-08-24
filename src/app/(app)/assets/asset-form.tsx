"use client";

import { useActionState, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import type { CustomerSiteRow } from "@/lib/services/operations-service";
import { createAssetAction } from "./actions";

export function AssetForm({ counterparties, sites }: { counterparties: CounterpartyRow[]; sites: CustomerSiteRow[] }) {
  const [state, action] = useActionState(createAssetAction, initialFormState);
  const [counterpartyId, setCounterpartyId] = useState("");
  const availableSites = sites.filter((site) => site.counterparty_id === counterpartyId);
  return <form action={action} className="form-grid">
    <label><span>고객사 *</span><select name="counterpartyId" required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="" disabled>고객사 선택</option>{counterparties.filter((row) => row.kind !== "supplier").map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>사업장 *</span><select name="siteId" required defaultValue="" key={counterpartyId} disabled={!counterpartyId}><option value="" disabled>{counterpartyId ? "사업장 선택" : "고객사를 먼저 선택"}</option>{availableSites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select></label>
    <label><span>내부 자산 태그 *</span><input name="assetTag" maxLength={50} placeholder="AST-001" required /></label>
    <label><span>Stratus Asset ID</span><input name="vendorAssetId" maxLength={120} placeholder="ee-00000 / zen00000" /></label>
    <label><span>제품명 *</span><input name="productName" maxLength={160} required /></label>
    <label><span>제품군 *</span><select name="productFamily" defaultValue="everrun"><option value="everrun">everRun Enterprise</option><option value="ztc_endurance">ztC Endurance</option><option value="ztc_edge">ztC Edge</option><option value="ftserver">ftServer</option><option value="other">기타</option></select></label>
    <label><span>모델</span><input name="productModel" maxLength={120} /></label>
    <label><span>버전·빌드</span><input name="softwareVersion" maxLength={120} /></label>
    <label><span>보호 모드 *</span><select name="protectionMode" defaultValue="ha"><option value="ha">HA</option><option value="ft">FT</option><option value="mixed">HA + FT</option><option value="none">없음</option><option value="other">기타</option></select></label>
    <label><span>운영체제</span><input name="operatingSystem" maxLength={160} /></label>
    <label><span>관리 IP·호스트</span><input name="managementIp" maxLength={200} placeholder="민감정보 입력 정책 확인" /></label>
    <label><span>일련번호</span><input name="serialNumber" maxLength={120} /></label>
    <label><span>지원 방식 *</span><select name="serviceMethod" defaultValue="hybrid"><option value="remote">원격</option><option value="visit">방문</option><option value="hybrid">원격 + 방문</option></select></label>
    <label><span>계약 상태 *</span><select name="contractStatus" defaultValue="active"><option value="active">계약중</option><option value="pending_renewal">갱신협의</option><option value="not_contracted">미계약</option><option value="expired">만료</option></select></label>
    <label><span>계약번호</span><input name="contractNumber" maxLength={120} /></label>
    <label><span>채널 파트너</span><input name="channelPartner" maxLength={160} /></label>
    <label><span>지원 공급자</span><input name="supportProvider" maxLength={160} placeholder="예: Stratus" /></label>
    <label><span>지원 등급</span><input name="supportLevel" maxLength={80} /></label>
    <label><span>설치일</span><input name="installedAt" type="date" /></label>
    <label><span>보증 만료일</span><input name="warrantyUntil" type="date" /></label>
    <label><span>지원 시작일</span><input name="supportStartedAt" type="date" /></label>
    <label><span>지원 만료일</span><input name="supportUntil" type="date" /></label>
    <label><span>다음 점검일</span><input name="nextInspectionDate" type="date" /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>자산 등록</SubmitButton></div>
  </form>;
}
