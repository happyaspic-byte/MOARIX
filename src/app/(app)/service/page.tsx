import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Clock3, MessageSquareText, Plus, Siren } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatServiceCaseSla, getServiceCaseSlaHealth } from "@/lib/domain/service-case-sla";
import { hasPermission } from "@/lib/security/permissions";
import { listAssets } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { listServiceCases } from "@/lib/services/service-cases";
import { ServiceCaseForm } from "./service-case-form";

export const metadata: Metadata = { title: "서비스 케이스" };
export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
type SearchParams = Promise<{ q?: SearchValue; status?: SearchValue; severity?: SearchValue; sla?: SearchValue; assetId?: SearchValue; create?: SearchValue }>;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(value));
}

export default async function ServicePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission("service:read");
  const [assets, allCases, counterparties, filters] = await Promise.all([
    listAssets(session.companyId),
    listServiceCases(session.companyId),
    listCounterparties(session.companyId),
    searchParams,
  ]);
  const canWrite = hasPermission(session.role, "service:write");
  const queue = allCases.map((row) => ({ row, sla: getServiceCaseSlaHealth(row.status, row.due_at) }));
  const search = first(filters.q) ?? "";
  const status = first(filters.status) ?? "";
  const severity = first(filters.severity) ?? "";
  const slaFilter = first(filters.sla) ?? "";
  const requestedAssetId = first(filters.assetId) ?? "";
  const selectedAsset = assets.find((asset) => asset.id === requestedAssetId && asset.status !== "retired");
  const shouldOpenCreate = first(filters.create) === "1" && Boolean(selectedAsset);
  const query = search.trim().toLocaleLowerCase("ko-KR");
  const cases = queue.filter(({ row, sla }) => {
    if (selectedAsset && row.asset_id !== selectedAsset.id) return false;
    if (status && row.status !== status) return false;
    if (severity && row.severity !== severity) return false;
    if (slaFilter && sla.state !== slaFilter) return false;
    if (!query) return true;
    return [row.number, row.external_case_number, row.title, row.counterparty_name, row.asset_tag]
      .some((value) => value?.toLocaleLowerCase("ko-KR").includes(query));
  });
  const activeCount = queue.filter(({ row }) => ["open", "in_progress", "waiting"].includes(row.status)).length;
  const overdueCount = queue.filter(({ sla }) => sla.state === "overdue").length;
  const atRiskCount = queue.filter(({ sla }) => sla.state === "at_risk").length;
  const criticalCount = queue.filter(({ row }) => row.severity === "critical" && !["resolved", "closed"].includes(row.status)).length;

  return <>
    <PageHeader eyebrow="SERVICE OPERATIONS" title="서비스 케이스" description={selectedAsset ? `${selectedAsset.vendor_asset_id ?? selectedAsset.asset_tag} 자산의 케이스를 조회하고 새 장애를 접수합니다.` : "고객 문의와 장애를 자산에 연결하고 심각도, SLA 처리 기한, 다음 조치일로 우선순위를 관리합니다."} actions={canWrite ? <details className="create-panel" open={shouldOpenCreate}><summary className="button primary"><Plus size={17} />케이스 접수</summary><div className="create-drawer"><div className="drawer-head"><div><h2>서비스 케이스 접수</h2><p>선택한 고객의 운영 자산, 연락처, 지원 권한과 외부 케이스를 함께 연결합니다.</p></div><DrawerCloseButton /></div><ServiceCaseForm counterparties={counterparties} assets={assets} defaultAssetId={selectedAsset?.id} /></div></details> : undefined} />

    <section className="metric-grid" aria-label="서비스 케이스 요약">
      <MetricCard label="진행 케이스" value={`${activeCount}건`} helper="접수·처리·대기" icon={MessageSquareText} tone="blue" />
      <MetricCard label="기한 초과" value={`${overdueCount}건`} helper="즉시 우선 처리" icon={AlertTriangle} tone="coral" />
      <MetricCard label="24시간 이내" value={`${atRiskCount}건`} helper="SLA 임박" icon={Clock3} tone="amber" />
      <MetricCard label="긴급 미종료" value={`${criticalCount}건`} helper="1 · 긴급" icon={Siren} tone="coral" />
    </section>

    <form className="filter-bar" action="/service" method="get" aria-label="서비스 케이스 필터">
      {selectedAsset ? <input type="hidden" name="assetId" value={selectedAsset.id} /> : null}
      <input name="q" defaultValue={search} aria-label="케이스 검색" placeholder="번호, 제목, 고객, 자산 검색" />
      <select name="status" defaultValue={status} aria-label="상태 필터"><option value="">모든 상태</option><option value="open">접수</option><option value="in_progress">처리 중</option><option value="waiting">대기</option><option value="resolved">해결</option><option value="closed">종료</option></select>
      <select name="severity" defaultValue={severity} aria-label="심각도 필터"><option value="">모든 심각도</option><option value="critical">1 · 긴급</option><option value="high">2 · 높음</option><option value="normal">3 · 보통</option><option value="low">4 · 낮음</option></select>
      <select name="sla" defaultValue={slaFilter} aria-label="SLA 필터"><option value="">모든 SLA</option><option value="overdue">기한 초과</option><option value="at_risk">기한 임박</option><option value="on_track">기한 정상</option><option value="none">기한 없음</option><option value="stopped">SLA 종료</option></select>
      <button className="button" type="submit">적용</button>
      {(search || status || severity || slaFilter) ? <Link className="button" href={selectedAsset ? `/service?assetId=${selectedAsset.id}` : "/service"}>초기화</Link> : null}
      {selectedAsset ? <><Link className="button" href={`/assets/${selectedAsset.id}`}>자산 상세</Link><Link className="button" href="/service">자산 필터 해제</Link></> : null}
    </form>

    <section className="card"><header className="card-header"><div><h2>서비스 업무 큐</h2><p>검색 결과 {cases.length}건 / 전체 {allCases.length}건 · 진행 → 연체 → 심각도 → 처리 기한 순</p></div></header>{cases.length === 0 ? <EmptyState title="조건에 맞는 서비스 케이스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>번호·제목</th><th>고객사·자산</th><th>심각도</th><th>상태</th><th>SLA·다음 조치</th><th>담당자·활동</th><th>접수·업데이트</th></tr></thead><tbody>{cases.map(({ row, sla }) => <tr key={row.id} className={`sla-row sla-${sla.state}`}><td><div className="table-title"><Link className="table-link" href={`/service/${row.id}`}><strong>{row.title}</strong></Link><small>{row.number}{row.external_case_number ? ` · ${row.external_provider ?? "외부"} ${row.external_case_number}` : ""}</small></div></td><td><div className="table-title"><strong>{row.counterparty_name}</strong><small>{row.asset_tag ?? "자산 미지정"}</small></div></td><td><div className="table-title"><StatusBadge status={row.severity} />{row.max_severity !== row.severity ? <small>최대 <StatusBadge status={row.max_severity} /></small> : null}</div></td><td><div className="table-title"><StatusBadge status={row.status} /><small>{row.status === "waiting" ? row.waiting_reason ?? "대기 사유 미등록" : (["resolved", "closed"].includes(row.status) ? row.resolution_summary ?? "해결 내용 미등록" : "진행 중")}</small></div></td><td><div className="table-title"><StatusBadge status={sla.state} /><small>{formatServiceCaseSla(sla)}</small><small>{row.next_action_at ? `다음 ${formatDateTime(row.next_action_at, session.companyTimezone)}` : "다음 조치 미지정"}</small></div></td><td><div className="table-title"><strong>{row.assigned_to_name ?? "미배정"}</strong><small>활동 {row.activity_count} · 첨부 {row.attachment_count}</small></div></td><td><div className="table-title"><strong>{formatDateTime(row.opened_at, session.companyTimezone)}</strong><small>수정 {formatDateTime(row.updated_at, session.companyTimezone)}</small></div></td></tr>)}</tbody></table></div>}</section>
  </>;
}
