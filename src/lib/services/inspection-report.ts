import { serializeCsv } from "../csv/csv-engine";

export interface InspectionReportCheck {
  category: string;
  label: string;
  result: string;
  observed_value?: string | null;
}

export interface InspectionReportData {
  number: string;
  customer_name: string;
  site_name: string;
  asset_tag: string;
  product_name: string;
  inspection_type: string;
  scheduled_date: string;
  completed_at?: string | null;
  engineer_name: string;
  system_health: string;
  protection_status: string;
  sync_status: string;
  service_status: string;
  cpu_percent: string | null;
  memory_percent: string | null;
  disk_percent: string | null;
  findings: string | null;
  action_items: string | null;
  customer_confirmed_by: string | null;
  customer_confirmed_at: string | null;
  checks: InspectionReportCheck[];
}

const typeLabels: Record<string, string> = {
  installation: "설치점검",
  preventive: "예방점검",
  quarterly: "분기점검",
  incident: "장애후점검",
  upgrade: "업그레이드점검",
};

const healthLabels: Record<string, string> = {
  healthy: "정상",
  warning: "주의",
  critical: "위험",
  unknown: "미확인",
};

const resultLabels: Record<string, string> = {
  pass: "합격",
  warning: "경고",
  fail: "실패",
  na: "해당없음",
};

export function generateInspectionHtmlReport(data: InspectionReportData): string {
  const typeLabel = typeLabels[data.inspection_type] ?? data.inspection_type;
  const healthLabel = healthLabels[data.system_health] ?? data.system_health;
  const confirmed = data.customer_confirmed_by
    ? `${data.customer_confirmed_by} (${data.customer_confirmed_at ?? ""})`
    : "미확인";

  const checkRows = data.checks
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.label)}</td><td>${escapeHtml(resultLabels[c.result] ?? c.result)}</td><td>${escapeHtml(c.observed_value ?? "-")}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>정기점검 보고서 ${escapeHtml(data.number)}</title>
<style>
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #111; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 32px; background: #f4f4f4; padding: 8px 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #eee; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 14px; }
  .meta dt { font-weight: 700; color: #555; }
  .meta dd { margin: 0; }
  .signoff { margin-top: 40px; border: 1px dashed #888; padding: 16px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>정기점검 보고서</h1>
  <p>문서번호: <strong>${escapeHtml(data.number)}</strong> · ${escapeHtml(typeLabel)}</p>
  <dl class="meta">
    <div><dt>고객사</dt><dd>${escapeHtml(data.customer_name)}</dd></div>
    <div><dt>사업장</dt><dd>${escapeHtml(data.site_name)}</dd></div>
    <div><dt>자산태그</dt><dd>${escapeHtml(data.asset_tag)}</dd></div>
    <div><dt>제품</dt><dd>${escapeHtml(data.product_name)}</dd></div>
    <div><dt>점검일</dt><dd>${escapeHtml(data.scheduled_date)}</dd></div>
    <div><dt>엔지니어</dt><dd>${escapeHtml(data.engineer_name)}</dd></div>
    <div><dt>시스템 건강도</dt><dd>${escapeHtml(healthLabel)}</dd></div>
    <div><dt>완료시각</dt><dd>${escapeHtml(data.completed_at ?? "-")}</dd></div>
  </dl>

  <h2>점검 체크리스트</h2>
  <table>
    <thead><tr><th>분류</th><th>항목</th><th>결과</th><th>측정값</th></tr></thead>
    <tbody>${checkRows}</tbody>
  </table>

  <h2>자원 사용률</h2>
  <table>
    <tr><th>CPU</th><td>${escapeHtml(data.cpu_percent ?? "-")}%</td><th>메모리</th><td>${escapeHtml(data.memory_percent ?? "-")}%</td><th>디스크</th><td>${escapeHtml(data.disk_percent ?? "-")}%</td></tr>
  </table>

  <h2>점검 소견</h2>
  <p>${escapeHtml(data.findings ?? "특이사항 없음")}</p>
  <h2>조치 사항</h2>
  <p>${escapeHtml(data.action_items ?? "없음")}</p>

  <div class="signoff">
    <h2>고객 확인</h2>
    <p>확인자: <strong>${escapeHtml(confirmed)}</strong></p>
    <p>본 점검 결과를 확인하고 이상 없음을 확인합니다.</p>
  </div>
</body>
</html>`;
}

export function generateInspectionCsvReport(data: InspectionReportData): string {
  const rows = [
    { section: "메타", item: "점검번호", result: data.number, value: "" },
    { section: "메타", item: "고객사", result: data.customer_name, value: data.site_name },
    { section: "메타", item: "자산", result: data.asset_tag, value: data.product_name },
    { section: "메타", item: "점검일", result: data.scheduled_date, value: data.engineer_name },
    { section: "건강도", item: "시스템", result: data.system_health, value: "" },
    ...data.checks.map((c) => ({
      section: c.category,
      item: c.label,
      result: c.result,
      value: c.observed_value ?? "",
    })),
    { section: "소견", item: "점검소견", result: "", value: data.findings ?? "" },
    { section: "소견", item: "조치사항", result: "", value: data.action_items ?? "" },
    { section: "확인", item: "고객확인자", result: data.customer_confirmed_by ?? "미확인", value: data.customer_confirmed_at ?? "" },
  ];

  return serializeCsv(
    [
      { key: "section", label: "분류" },
      { key: "item", label: "항목" },
      { key: "result", label: "결과" },
      { key: "value", label: "측정값/내용" },
    ],
    rows
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
