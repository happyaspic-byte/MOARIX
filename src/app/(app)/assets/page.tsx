import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { formatSupportHealth, getSupportHealth } from "@/lib/domain/support-health";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { listAssetsAndCases } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { listCustomerSites } from "@/lib/services/operations-service";
import { AssetForm } from "./asset-form";

export const metadata: Metadata = { title: "자산·지원 계약" };
export const dynamic = "force-dynamic";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ support?: string }> }) {
  const session = await requirePermission("assets:read");
  const [{ assets }, counterparties, sites] = await Promise.all([listAssetsAndCases(session.companyId), listCounterparties(session.companyId), listCustomerSites(session.companyId)]);
  const today = dateInTimeZone(session.companyTimezone);
  const { support } = await searchParams;
  const rows = assets.map((asset) => ({ asset, health: getSupportHealth({ contractStatus: asset.contract_status, supportUntil: asset.support_until, assetStatus: asset.status }, today) }));
  const visibleRows = support ? rows.filter((row) => row.health.state === support) : rows;
  return <>
    <PageHeader eyebrow="STRATUS ASSET OPERATIONS" title="자산·지원 계약" description="고객 사업장별 Stratus 자산, 제품 버전, HA·FT 구성과 지원 만료·미계약 위험을 함께 관리합니다." actions={<>{hasPermission(session.role, "assets:write") ? <details className="create-panel"><summary className="button primary"><Plus size={17} />자산 등록</summary><div className="create-drawer"><div className="drawer-head"><div><h2>고객 자산 등록</h2><p>사업장과 지원 계약 정보를 연결해 등록합니다.</p></div><DrawerCloseButton /></div><AssetForm counterparties={counterparties} sites={sites} /></div></details> : null}<Link className="button" href="/sites">사업장 관리</Link></>} />
    <nav className="filter-bar" aria-label="지원 상태 필터"><Link className={`button small ${!support ? "primary" : ""}`} href="/assets">전체</Link>{(["expiring", "expired", "not_contracted", "covered", "unknown"] as const).map((state) => <Link key={state} className={`button small ${support === state ? "primary" : ""}`} href={`/assets?support=${state}`}>{state === "expiring" ? "90일 내 만료" : state === "expired" ? "지원 만료" : state === "not_contracted" ? "미계약" : state === "covered" ? "지원 정상" : "만료일 미등록"}</Link>)}</nav>
    <section className="card"><header className="card-header"><div><h2>설치 자산 지원 현황</h2><p>{support ? `${visibleRows.length}개 필터 결과 · 전체 ${assets.length}개` : `총 ${assets.length}개`} · 지원 만료일 순</p></div></header>{visibleRows.length === 0 ? <EmptyState title={assets.length === 0 ? "등록된 고객 자산이 없습니다." : "조건에 맞는 자산이 없습니다."} description={assets.length === 0 ? "사업장을 먼저 등록한 뒤 자산을 연결하세요." : "다른 지원 상태 필터를 선택하세요."} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Asset ID·제품</th><th>고객·사업장</th><th>제품군·버전</th><th>보호</th><th>지원 계약</th><th>지원 만료</th><th>다음 점검</th><th>자산 상태</th></tr></thead><tbody>{visibleRows.map(({ asset: row, health }) => {
      return <tr key={row.id} className={`support-row support-${health.state}`}><td><div className="table-title"><strong>{row.vendor_asset_id ?? row.asset_tag}</strong><small>{row.product_name} · 내부 {row.asset_tag}</small></div></td><td><div className="table-title"><strong>{row.counterparty_name}</strong><small>{row.site ?? "사업장 미지정"}</small></div></td><td><div className="table-title"><strong>{row.product_family.replaceAll("_", " ")}</strong><small>{row.software_version ?? row.product_model ?? "버전 미등록"}</small></div></td><td>{row.protection_mode.toUpperCase()}</td><td><div className="table-title"><StatusBadge status={health.state} /><small>{row.contract_number ?? row.support_provider ?? "계약 정보 없음"}</small></div></td><td><div className="table-title"><strong>{formatSupportHealth(health)}</strong><small>{row.support_until ?? "만료일 미등록"}</small></div></td><td>{row.next_inspection_date ?? "—"}</td><td><StatusBadge status={row.status} /></td></tr>;
    })}</tbody></table></div>}</section>
  </>;
}
