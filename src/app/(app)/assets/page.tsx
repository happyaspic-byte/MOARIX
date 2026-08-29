import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, CalendarClock, Plus, ShieldAlert, Siren } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { dateInTimeZone } from "@/lib/domain/company-date";
import {
  assetSupportRiskLabels,
  formatAssetSupportRisk,
  getAssetSupportRisk,
  type AssetSupportRiskState,
} from "@/lib/domain/asset-support-risk";
import { hasPermission } from "@/lib/security/permissions";
import { listAssets } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { listCustomerSites } from "@/lib/services/operations-service";
import { AssetForm } from "./asset-form";
import { AssetImportPanel } from "./asset-import-panel";

export const metadata: Metadata = { title: "Stratus 자산 운영" };
export const dynamic = "force-dynamic";

type AssetSearchParams = {
  q?: string | string[];
  customer?: string | string[];
  site?: string | string[];
  product?: string | string[];
  protection?: string | string[];
  support?: string | string[];
  inspection?: string | string[];
  status?: string | string[];
  sort?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const productLabels = {
  everrun: "everRun Enterprise",
  ztc_endurance: "ztC Endurance",
  ztc_edge: "ztC Edge",
  ftserver: "ftServer",
  other: "기타",
} as const;

const supportPriority: Record<AssetSupportRiskState, number> = {
  vendor_gap: 0,
  not_contracted: 1,
  expired: 2,
  expires_today: 3,
  renewal_30: 4,
  renewal_60: 5,
  renewal_90: 6,
  vendor_unverified: 7,
  unknown: 8,
  covered: 9,
  retired: 10,
};

function nextInspectionLabel(value: string | null, today: string) {
  if (!value) return "미정";
  const days = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "오늘";
  return `D-${days}`;
}

function effectiveSupportDate(customerEndsOn: string | null, vendorEndsOn: string | null) {
  return [customerEndsOn, vendorEndsOn].filter((value): value is string => Boolean(value)).sort()[0] ?? "9999";
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<AssetSearchParams> }) {
  const session = await requirePermission("assets:read");
  const [assets, counterparties, sites, rawFilters] = await Promise.all([
    listAssets(session.companyId),
    listCounterparties(session.companyId),
    listCustomerSites(session.companyId),
    searchParams,
  ]);
  const filters = {
    q: first(rawFilters.q),
    customer: first(rawFilters.customer),
    site: first(rawFilters.site),
    product: first(rawFilters.product),
    protection: first(rawFilters.protection),
    support: first(rawFilters.support),
    inspection: first(rawFilters.inspection),
    status: first(rawFilters.status),
    sort: first(rawFilters.sort),
  };
  const today = dateInTimeZone(session.companyTimezone);
  const query = filters.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const rows = assets.map((asset) => ({
    asset,
    risk: getAssetSupportRisk({
      assetStatus: asset.status,
      customerStatus: asset.contract_status,
      customerEndsOn: asset.support_until,
      vendorStatus: asset.vendor_contract_status,
      vendorEndsOn: asset.vendor_support_until,
    }, today),
  }));

  const visibleRows = rows.filter(({ asset, risk }) => {
    const searchText = [asset.vendor_asset_id, asset.asset_tag, asset.product_name, asset.counterparty_name, asset.site, asset.management_ip]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    const supportMatches = !filters.support
      || risk.state === filters.support
      || (filters.support === "uncovered" && ["not_contracted", "expired", "vendor_gap"].includes(risk.state))
      || (filters.support === "expiring" && ["renewal_90", "renewal_60", "renewal_30", "expires_today"].includes(risk.state));
    const statusMatches = !filters.status
      || asset.status === filters.status
      || (filters.status === "operational" && asset.status !== "retired");
    const inspectionMatches = !filters.inspection
      || (filters.inspection === "due" && asset.due_inspection_count > 0);
    return (!query || searchText.includes(query))
      && (!filters.customer || asset.counterparty_id === filters.customer)
      && (!filters.site || asset.site_id === filters.site)
      && (!filters.product || asset.product_family === filters.product)
      && (!filters.protection || asset.protection_mode === filters.protection)
      && statusMatches
      && inspectionMatches
      && supportMatches;
  }).sort((left, right) => {
    if (filters.sort === "support") return effectiveSupportDate(left.asset.support_until, left.asset.vendor_support_until)
      .localeCompare(effectiveSupportDate(right.asset.support_until, right.asset.vendor_support_until));
    if (filters.sort === "inspection") return (left.asset.next_inspection_date ?? "9999").localeCompare(right.asset.next_inspection_date ?? "9999");
    if (filters.sort === "customer") return left.asset.counterparty_name.localeCompare(right.asset.counterparty_name, "ko");
    return supportPriority[left.risk.state] - supportPriority[right.risk.state]
      || effectiveSupportDate(left.asset.support_until, left.asset.vendor_support_until)
        .localeCompare(effectiveSupportDate(right.asset.support_until, right.asset.vendor_support_until));
  });

  const activeCount = rows.filter(({ asset }) => asset.status !== "retired").length;
  const renewalCount = rows.filter(({ risk }) => ["renewal_90", "renewal_60", "renewal_30", "expires_today"].includes(risk.state)).length;
  const uncoveredCount = rows.filter(({ risk }) => ["not_contracted", "expired", "vendor_gap"].includes(risk.state)).length;
  const inspectionDueCount = rows.filter(({ asset }) => asset.due_inspection_count > 0).length;
  const hasFilters = Object.values(filters).some(Boolean);
  const activeCustomers = counterparties.filter((row) => row.is_active && row.kind !== "supplier");

  return <>
    <PageHeader
      eyebrow="STRATUS ASSET OPERATIONS"
      title="Stratus 자산 운영"
      description="고객·사업장별 Stratus 구성, 고객 지원 의무, 벤더 백계약, 라이선스, 점검과 케이스를 한 흐름에서 관리합니다."
      actions={<>{hasPermission(session.role, "assets:write") ? <>
        <details className="create-panel"><summary className="button primary"><Plus size={17} />자산 등록</summary><div className="create-drawer"><div className="drawer-head"><div><h2>고객 자산 등록</h2><p>기본 자산을 만든 뒤 상세 화면에서 Node, 네트워크, VM과 계약 체인을 완성합니다.</p></div><DrawerCloseButton /></div><AssetForm counterparties={activeCustomers} sites={sites} /></div></details>
        <details className="create-panel"><summary className="button">CSV 가져오기</summary><div className="create-drawer"><div className="drawer-head"><div><h2>자산·계약 일괄 가져오기</h2><p>UTF-8 CSV로 자산과 지원 계약을 등록하거나 기존 자산태그를 갱신합니다. Excel은 CSV UTF-8로 저장하세요.</p></div><DrawerCloseButton /></div><AssetImportPanel existingAssetKeys={assets.flatMap((asset) => [asset.asset_tag, asset.vendor_asset_id].filter((value): value is string => Boolean(value)))} /></div></details>
      </> : null}<a className="button" href="/api/v1/assets/export">CSV 내보내기</a><Link className="button" href="/sites">사업장 관리</Link></>}
    />

    <section className="metric-grid" aria-label="자산 운영 지표">
      <Link className="metric-link" href="/assets?status=operational"><MetricCard label="운영 자산" value={`${activeCount}대`} helper="점검·유지보수 포함" icon={Boxes} /></Link>
      <Link className="metric-link" href="/assets?support=expiring"><MetricCard label="90일 내 갱신" value={`${renewalCount}대`} helper="D-90 · D-60 · D-30 · D-0" icon={CalendarClock} tone="amber" /></Link>
      <Link className="metric-link" href="/assets?support=uncovered"><MetricCard label="지원 공백·만료" value={`${uncoveredCount}대`} helper="고객 의무와 벤더 계약 분리" icon={ShieldAlert} tone="coral" /></Link>
      <Link className="metric-link" href="/assets?inspection=due&sort=inspection"><MetricCard label="30일 내 점검" value={`${inspectionDueCount}대`} helper="예정·진행·조치 필요" icon={Siren} tone="blue" /></Link>
    </section>

    <section className="card asset-filter-card" aria-labelledby="asset-filter-title">
      <header className="card-header"><div><h2 id="asset-filter-title">운영 조건 검색</h2><p>Asset ID, 내부 태그, 제품, 고객, 사업장, 관리 주소를 빠르게 찾습니다.</p></div>{hasFilters ? <Link className="button small" href="/assets">조건 초기화</Link> : null}</header>
      <form className="asset-filter-form" method="get">
        <label className="asset-search-field"><span>통합 검색</span><input type="search" name="q" defaultValue={filters.q} placeholder="Asset ID · 고객 · IP · 제품" /></label>
        <label><span>고객</span><select name="customer" defaultValue={filters.customer ?? ""}><option value="">전체 고객</option>{activeCustomers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label><span>사업장</span><select name="site" defaultValue={filters.site ?? ""}><option value="">전체 사업장</option>{sites.filter((site) => !filters.customer || site.counterparty_id === filters.customer).map((site) => <option key={site.id} value={site.id}>{site.counterparty_name} · {site.name}</option>)}</select></label>
        <label><span>제품군</span><select name="product" defaultValue={filters.product ?? ""}><option value="">전체 제품</option>{Object.entries(productLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>보호</span><select name="protection" defaultValue={filters.protection ?? ""}><option value="">전체 보호</option><option value="ft">FT</option><option value="ha">HA</option><option value="mixed">HA + FT</option><option value="none">없음</option><option value="other">기타</option></select></label>
        <label><span>지원</span><select name="support" defaultValue={filters.support ?? ""}><option value="">전체 지원</option><option value="uncovered">지원 공백·만료</option><option value="not_contracted">고객 미계약</option><option value="vendor_gap">벤더 지원 공백</option><option value="expired">고객 지원 만료</option><option value="expiring">90일 내 갱신</option><option value="vendor_unverified">벤더 계약 미확인</option><option value="covered">지원 정상</option><option value="unknown">기한 미등록</option></select></label>
        <label><span>자산 상태</span><select name="status" defaultValue={filters.status ?? ""}><option value="">전체 상태</option><option value="operational">운영·점검</option><option value="active">운영 중</option><option value="maintenance">점검 중</option><option value="retired">퇴역</option></select></label>
        <label><span>정렬</span><select name="sort" defaultValue={filters.sort ?? "risk"}><option value="risk">위험 우선</option><option value="support">지원 만료일</option><option value="inspection">다음 점검일</option><option value="customer">고객명</option></select></label>
        <button className="button primary" type="submit">검색 적용</button>
      </form>
    </section>

    <section className="card asset-list-card"><header className="card-header"><div><h2>설치 자산 지원 현황</h2><p>{visibleRows.length}개 표시 · 전체 {assets.length}개 · {filters.sort && filters.sort !== "risk" ? "선택 정렬" : "지원 위험 우선"}</p></div></header>{visibleRows.length === 0 ? <EmptyState title={assets.length === 0 ? "등록된 고객 자산이 없습니다." : "조건에 맞는 자산이 없습니다."} description={assets.length === 0 ? "사업장을 먼저 등록한 뒤 Stratus 자산을 연결하세요." : "검색어나 운영 조건을 조정하세요."} /> : <>
      <div className="table-wrap asset-desktop-table"><table className="data-table"><caption className="sr-only">Stratus 설치 자산과 실효 지원 현황</caption><thead><tr><th>Asset ID·제품</th><th>고객·사업장</th><th>구성</th><th>실효 지원</th><th>계약 기한</th><th>점검</th><th>진행 케이스</th><th>자산 상태</th></tr></thead><tbody>{visibleRows.map(({ asset, risk }) => <tr key={asset.id} className={`support-row support-${risk.state}`}><td><div className="table-title"><Link className="table-link" href={`/assets/${asset.id}`}><strong>{asset.vendor_asset_id ?? asset.asset_tag}</strong></Link><small>{asset.product_name} · 내부 {asset.asset_tag}</small></div></td><td><div className="table-title"><strong>{asset.counterparty_name}</strong><small>{asset.site ?? "사업장 미지정"}</small></div></td><td><div className="table-title"><strong>{productLabels[asset.product_family]} · {asset.protection_mode.toUpperCase()}</strong><small>{asset.node_count} Nodes · {asset.vm_count} VMs · {asset.software_version ?? "버전 미등록"}</small></div></td><td><div className="table-title"><StatusBadge status={risk.state} /><small>{assetSupportRiskLabels[risk.state]}</small></div></td><td><div className="table-title"><strong>{formatAssetSupportRisk(risk)}</strong><small>고객 {asset.support_until ?? "미등록"} · 벤더 {asset.vendor_support_until ?? "미확인"}</small></div></td><td><div className="table-title"><strong>{nextInspectionLabel(asset.next_inspection_date, today)}</strong><small>{asset.next_inspection_date ?? "예약 없음"}{asset.due_inspection_count > 0 ? ` · 진행 ${asset.due_inspection_count}건` : ""}</small></div></td><td><Link className="table-link" href={`/assets/${asset.id}?tab=cases`}><strong>{asset.open_case_count}건</strong></Link></td><td><StatusBadge status={asset.status} /></td></tr>)}</tbody></table></div>
      <div className="asset-mobile-list">{visibleRows.map(({ asset, risk }) => <article key={asset.id} className={`asset-mobile-card support-${risk.state}`}><header><div><Link href={`/assets/${asset.id}`}><strong>{asset.vendor_asset_id ?? asset.asset_tag}</strong></Link><small>{asset.product_name} · {asset.counterparty_name}</small></div><StatusBadge status={risk.state} /></header><dl><div><dt>사업장</dt><dd>{asset.site ?? "미지정"}</dd></div><div><dt>구성</dt><dd>{asset.protection_mode.toUpperCase()} · {asset.node_count} Nodes · {asset.vm_count} VMs</dd></div><div><dt>지원</dt><dd>{formatAssetSupportRisk(risk)} · 고객 {asset.support_until ?? "미등록"}</dd></div><div><dt>점검·케이스</dt><dd>{nextInspectionLabel(asset.next_inspection_date, today)} · {asset.open_case_count}건</dd></div></dl><Link className="button small wide" href={`/assets/${asset.id}`}>자산 워크스페이스 열기</Link></article>)}</div>
    </>}</section>
  </>;
}
