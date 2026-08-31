"use client";

import { useActionState, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { matchHeaderAlias, parseCsv } from "@/lib/csv/csv-engine";
import { importAssetsCsvAction, importContractsCsvAction } from "./actions";

const assetAliases = {
  assetTag: ["asset_tag", "자산태그", "자산번호", "관리번호", "Asset Tag"],
  vendorAssetId: ["vendor_asset_id", "stratus_asset_id", "벤더자산ID", "Stratus Asset ID"],
  productFamily: ["product_family", "제품군", "패밀리", "Product Family"],
  protectionMode: ["protection_mode", "보호모드", "Protection Mode"],
  customerCode: ["customer_code", "고객사코드", "거래처코드", "Customer Code"],
  siteCode: ["site_code", "사업장코드", "설치사업장", "Site Code"],
} satisfies Record<string, string[]>;

const contractAliases = {
  assetTag: ["asset_tag", "자산태그", "자산번호", "Asset Tag"],
  scope: ["scope", "계약구분", "계약종류", "Scope"],
  providerName: ["provider_name", "공급자", "지원사", "Provider"],
  startsOn: ["starts_on", "시작일", "계약시작일", "Start Date"],
  endsOn: ["ends_on", "종료일", "계약종료일", "만료일", "End Date"],
} satisfies Record<string, string[]>;

type PreviewRow = {
  line: number;
  key: string;
  operation: "신규" | "갱신" | "개정" | "오류";
  message: string;
};

type Preview = {
  fileName: string;
  mapped: string[];
  unmapped: string[];
  rows: PreviewRow[];
};

export function AssetImportPanel({ existingAssetKeys }: { existingAssetKeys: string[] }) {
  const [assetState, assetAction] = useActionState(importAssetsCsvAction, initialFormState);
  const [contractState, contractAction] = useActionState(importContractsCsvAction, initialFormState);
  const [mode, setMode] = useState<"asset" | "contract">("asset");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const isAsset = mode === "asset";
  const action = isAsset ? assetAction : contractAction;
  const state = isAsset ? assetState : contractState;
  const keySet = new Set(existingAssetKeys.map((value) => value.toLocaleUpperCase("ko-KR")));

  async function previewFile(file: File | undefined) {
    setConfirmed(false);
    if (!file) {
      setPreview(null);
      return;
    }
    const parsed = parseCsv(await file.text());
    const aliases = isAsset ? assetAliases : contractAliases;
    const mapping = matchHeaderAlias(parsed.headers, aliases);
    const mapped = Object.values(mapping).filter((value): value is string => Boolean(value));
    const unmapped = parsed.headers.filter((_, index) => !mapping[index]);
    const rows = parsed.rawRows.map((row): PreviewRow => {
      const data: Record<string, string> = {};
      row.rawValues.forEach((value, index) => {
        const key = mapping[index];
        if (key) data[key] = value.trim();
      });
      const assetKey = data.assetTag || data.vendorAssetId || "식별자 없음";
      const errors: string[] = [];
      if (!data.assetTag) errors.push("자산태그 필수");
      if (isAsset) {
        if (!data.productFamily) errors.push("제품군 필수");
        if (!data.customerCode) errors.push("고객사코드 필수");
        if (!data.siteCode) errors.push("사업장코드 필수");
        if (data.productFamily && !["everrun", "ztc_endurance", "ztc_edge", "ftserver", "other"].includes(data.productFamily)) errors.push("제품군 값 오류");
        if (data.protectionMode && !["ha", "ft", "mixed", "none", "other"].includes(data.protectionMode)) errors.push("보호모드 값 오류");
      } else {
        if (!data.providerName) errors.push("지원공급자 필수");
        if (!["customer_support", "partner_support", "vendor_support"].includes(data.scope ?? "")) errors.push("계약구분 값 오류");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startsOn ?? "")) errors.push("시작일 형식 오류");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.endsOn ?? "")) errors.push("종료일 형식 오류");
      }
      if (errors.length > 0) return { line: row.lineNumber, key: assetKey, operation: "오류", message: errors.join(" · ") };
      if (!isAsset) return { line: row.lineNumber, key: assetKey, operation: "개정", message: keySet.has(assetKey.toLocaleUpperCase("ko-KR")) ? "현재 계약을 이력으로 보존 후 새 개정 생성" : "대상 자산 미일치 가능" };
      const exists = keySet.has(assetKey.toLocaleUpperCase("ko-KR"));
      return { line: row.lineNumber, key: assetKey, operation: exists ? "갱신" : "신규", message: exists ? "기존 자산과 변경 필드 갱신" : "새 자산 생성" };
    });
    setPreview({ fileName: file.name, mapped, unmapped, rows });
  }

  const errorCount = preview?.rows.filter((row) => row.operation === "오류").length ?? 0;

  return <div className="import-panel">
    <div className="import-mode-toggle">
      <button type="button" className={isAsset ? "active" : ""} onClick={() => { setMode("asset"); setPreview(null); setConfirmed(false); }}>자산 가져오기</button>
      <button type="button" className={!isAsset ? "active" : ""} onClick={() => { setMode("contract"); setPreview(null); setConfirmed(false); }}>계약 가져오기</button>
    </div>

    <div className="import-guide">
      <p>UTF-8 CSV 파일만 지원합니다. Excel(.xlsx)은 <strong>파일 → 다른 이름으로 저장 → CSV UTF-8</strong>로 변환하세요. 파일 선택 후 열 매핑·행 검증·신규/갱신 Diff를 확인해야 실행할 수 있습니다.</p>
      <a className="button small" href={`/api/v1/assets/template?type=${isAsset ? "asset" : "contract"}`} download><Download size={15} />{isAsset ? "자산 템플릿 CSV" : "계약 템플릿 CSV"}</a>
    </div>

    <form action={action} className="import-form">
      <label className="file-drop">
        <FileSpreadsheet size={22} />
        <span>{isAsset ? "자산 CSV 선택" : "계약 CSV 선택"}</span>
        <input type="file" name="csvFile" accept=".csv,text/csv" required onChange={(event) => void previewFile(event.target.files?.[0])} />
      </label>

      {preview ? <section className="import-preview" aria-label="CSV 가져오기 미리보기">
        <header><div><strong>{preview.fileName}</strong><small>{preview.rows.length}개 행 · 매핑 {preview.mapped.length}개 열 · 오류 {errorCount}개</small></div></header>
        <p><strong>매핑:</strong> {preview.mapped.join(", ") || "없음"}{preview.unmapped.length ? ` · 미사용: ${preview.unmapped.join(", ")}` : ""}</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>행</th><th>식별자</th><th>처리</th><th>검증·Diff</th></tr></thead><tbody>{preview.rows.slice(0, 100).map((row) => <tr key={`${row.line}-${row.key}`}><td>{row.line}</td><td>{row.key}</td><td><strong>{row.operation}</strong></td><td>{row.message}</td></tr>)}</tbody></table></div>
        <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={errorCount > 0} />미리보기와 갱신 대상을 확인했습니다.</label>
      </section> : null}

      <FormMessage state={state} />
      <fieldset className="submit-gate" disabled={!preview || !confirmed || errorCount > 0}>
        <SubmitButton><Upload size={16} />{isAsset ? "자산 가져오기 확정" : "계약 가져오기 확정"}</SubmitButton>
      </fieldset>
    </form>
  </div>;
}
