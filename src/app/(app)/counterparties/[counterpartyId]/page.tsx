import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LifeBuoy, MapPinned, Server, ShieldAlert } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { assetSupportRiskLabels, formatAssetSupportRisk, getAssetSupportRisk } from "@/lib/domain/asset-support-risk";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { getCustomer360 } from "@/lib/services/customer-360";
import { listCounterparties } from "@/lib/services/master-data";
import { CounterpartyForm, DeleteCounterpartyForm } from "../counterparty-form";
import { DeleteSiteForm, SiteForm } from "../../sites/site-form";

export const metadata: Metadata = { title: "고객 360" };
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kindLabels = { customer: "고객", supplier: "공급사", both: "고객·공급사" } as const;
const productLabels = { everrun: "everRun Enterprise", ztc_endurance: "ztC Endurance", ztc_edge: "ztC Edge", ftserver: "ftServer", other: "기타" } as const;
const inspectionTypeLabels = { installation: "설치", preventive: "예방", quarterly: "정기", incident: "장애", upgrade: "업그레이드" } as const;

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(value));
}

export default async function Customer360Page({ params }: { params: Promise<{ counterpartyId: string }> }) {
  const session = await requirePermission("assets:read");
  const { counterpartyId } = await params;
  if (!uuidPattern.test(counterpartyId)) notFound();
  const workspace = await getCustomer360(session.companyId, counterpartyId);
  if (!workspace) notFound();

  const { customer, sites, assets, cases, inspections } = workspace;
  const canEditCustomer = hasPermission(session.role, "master:write");
  const canEditSite = hasPermission(session.role, "assets:write");
  const counterparties = canEditSite ? await listCounterparties(session.companyId) : [];
  const today = dateInTimeZone(session.companyTimezone);
  const assetsWithRisk = assets.map((asset) => ({
    asset,
    risk: getAssetSupportRisk({
      assetStatus: asset.status,
      customerStatus: asset.contract_status,
      customerEndsOn: asset.support_until,
      vendorStatus: asset.vendor_contract_status,
      vendorEndsOn: asset.vendor_support_until,
    }, today),
  }));
  const activeAssets = assets.filter((asset) => asset.status !== "retired");
  const supportAttention = assetsWithRisk.filter(({ risk }) => !["covered", "retired"].includes(risk.state));

  return <>
    <PageHeader
      eyebrow={`CUSTOMER 360 · ${customer.code}`}
      title={customer.name}
      description={`${kindLabels[customer.kind]} · 사업장, Stratus 자산, 지원 위험, 서비스 케이스와 점검을 한 화면에서 확인합니다.`}
      actions={<><Link className="button" href="/counterparties"><ArrowLeft size={17} />거래처 목록</Link><Link className="button" href="/sites">사업장 디렉터리</Link><Link className="button primary" href="/assets">자산 운영 큐</Link>{canEditCustomer ? <details className="create-panel"><summary className="button">고객 수정</summary><div className="create-drawer"><div className="drawer-head"><div><h2>{customer.name} 수정</h2><p>고객사 코드, 담당자, 연락처를 갱신합니다. 비활성 고객을 저장하면 다시 활성화됩니다.</p></div><DrawerCloseButton /></div><CounterpartyForm initial={{ ...customer, address: customer.address }} /></div></details> : null}{canEditCustomer && customer.is_active ? <DeleteCounterpartyForm id={customer.id} name={customer.name} /> : null}</>}
    />

    <section className="metric-grid" aria-label="고객 운영 요약">
      <MetricCard label="사업장" value={`${sites.filter((site) => site.is_active).length}곳`} helper={`전체 ${sites.length}곳`} icon={MapPinned} tone="blue" />
      <MetricCard label="운영 Stratus 자산" value={`${activeAssets.length}대`} helper={`전체 ${assets.length}대`} icon={Server} />
      <MetricCard label="지원 확인 필요" value={`${supportAttention.length}대`} helper="갱신·미계약·벤더 공백" icon={ShieldAlert} tone={supportAttention.length > 0 ? "coral" : "blue"} />
      <MetricCard label="진행 케이스" value={`${cases.length}건`} helper="접수·처리·대기" icon={LifeBuoy} tone={cases.length > 0 ? "coral" : "teal"} />
    </section>

    <div className="section-grid">
      <section className="card span-8">
        <header className="card-header"><div><h2>고객 기본정보</h2><p>계약·지원 업무에서 사용하는 거래처 기준정보</p></div><div className="row-actions"><StatusBadge status={customer.is_active ? "active" : "retired"} /></div></header>
        <dl className="asset-fact-grid">
          <div><dt>고객 코드·유형</dt><dd>{customer.code}<small>{kindLabels[customer.kind]}</small></dd></div>
          <div><dt>사업자번호</dt><dd>{customer.business_number ?? "—"}<small>대표 {customer.representative_name ?? "미등록"}</small></dd></div>
          <div><dt>연락처</dt><dd>{customer.phone ?? "—"}<small>{customer.email ?? "이메일 미등록"}</small></dd></div>
          <div><dt>주소</dt><dd>{customer.address ?? "—"}</dd></div>
          <div><dt>결제 조건</dt><dd>{customer.payment_terms_days}일</dd></div>
          <div><dt>신용 한도</dt><dd>{formatMoney(customer.credit_limit)}</dd></div>
        </dl>
      </section>
      <aside className="card span-4">
        <header className="card-header"><div><h2>지원 주의 자산</h2><p>고객 의무와 벤더 에스컬레이션 기준</p></div></header>
        <div className="card-body attention-list">{supportAttention.length === 0 ? <EmptyState title="지원 위험 자산이 없습니다." /> : supportAttention.slice(0, 6).map(({ asset, risk }) => <Link key={asset.id} className="attention-item" href={`/assets/${asset.id}?tab=contracts`}><div><strong>{asset.vendor_asset_id ?? asset.asset_tag}</strong><span>{asset.product_name}</span></div><StatusBadge status={risk.state} /></Link>)}</div>
      </aside>
    </div>

    <section className="card case-section">
      <header className="card-header"><div><h2>사업장</h2><p>{sites.length}곳 · 자산과 진행 케이스 연결 현황</p></div></header>
      {sites.length === 0 ? <EmptyState title="등록된 사업장이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">고객 사업장</caption><thead><tr><th>사업장·코드</th><th>주소</th><th>고객 담당자</th><th>시간대</th><th>운영 자산</th><th>진행 케이스</th>{canEditSite ? <th>관리</th> : null}</tr></thead><tbody>{sites.map((site) => <tr key={site.id}><td><div className="table-title"><strong>{site.name}</strong><small>{site.code} · {site.is_active ? "운영" : "비활성"}</small></div></td><td>{site.address ?? "—"}</td><td><div className="table-title"><strong>{site.contact_name ?? "—"}</strong><small>{site.contact_phone ?? site.contact_email ?? "연락처 미등록"}</small></div></td><td>{site.timezone}</td><td>{site.asset_count}대</td><td>{site.open_case_count}건</td>{canEditSite ? <td><div className="row-actions"><details className="create-panel"><summary className="button small">수정</summary><div className="create-drawer"><div className="drawer-head"><div><h2>{site.name} 수정</h2><p>사업장 위치와 고객 담당자를 갱신합니다.</p></div><DrawerCloseButton /></div><SiteForm counterparties={counterparties} initial={{ id: site.id, counterparty_id: customer.id, counterparty_name: customer.name, code: site.code, name: site.name, address: site.address, contact_name: site.contact_name, contact_phone: site.contact_phone, contact_email: site.contact_email, timezone: site.timezone, asset_count: String(site.asset_count), open_case_count: String(site.open_case_count) }} /></div></details>{site.is_active ? <DeleteSiteForm id={site.id} name={site.name} /> : null}</div></td> : null}</tr>)}</tbody></table></div>}
    </section>

    <section className="card case-section">
      <header className="card-header"><div><h2>Stratus 자산·지원 위험</h2><p>{assets.length}대 · 고객 계약과 Stratus/Penguin 상위 지원을 함께 판정</p></div><Link className="button small" href="/assets">전체 자산 큐</Link></header>
      {assetsWithRisk.length === 0 ? <EmptyState title="연결된 Stratus 자산이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">고객 Stratus 자산</caption><thead><tr><th>Asset ID·제품</th><th>사업장</th><th>보호·상태</th><th>실효 지원</th><th>고객 / 벤더 만료</th><th>구성</th><th>진행 케이스</th></tr></thead><tbody>{assetsWithRisk.map(({ asset, risk }) => <tr key={asset.id}><td><div className="table-title"><Link className="table-link" href={`/assets/${asset.id}`}><strong>{asset.vendor_asset_id ?? asset.asset_tag}</strong></Link><small>{productLabels[asset.product_family]} · {asset.product_model ?? asset.product_name} {asset.software_version ?? ""}</small></div></td><td>{asset.site_name ?? "—"}</td><td><StatusBadge status={asset.protection_mode} /> <StatusBadge status={asset.status} /></td><td><div className="table-title"><StatusBadge status={risk.state} /><small>{formatAssetSupportRisk(risk)} · {assetSupportRiskLabels[risk.state]}</small></div></td><td><div className="table-title"><strong>{asset.support_until ?? "미등록"}</strong><small>벤더 {asset.vendor_support_until ?? "미확인"}</small></div></td><td>{asset.node_count} Nodes · {asset.vm_count} VMs</td><td>{asset.open_case_count}건</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card case-section">
      <header className="card-header"><div><h2>진행 서비스 케이스</h2><p>{cases.length}건 · 심각도와 처리 기한 우선</p></div><Link className="button small" href="/service">서비스 업무 큐</Link></header>
      {cases.length === 0 ? <EmptyState title="진행 중인 서비스 케이스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">고객 진행 서비스 케이스</caption><thead><tr><th>케이스·제목</th><th>자산·사업장</th><th>심각도</th><th>상태</th><th>처리 기한</th><th>다음 조치</th><th>업데이트</th></tr></thead><tbody>{cases.map((serviceCase) => <tr key={serviceCase.id}><td><div className="table-title"><Link className="table-link" href={`/service/${serviceCase.id}`}><strong>{serviceCase.title}</strong></Link><small>{serviceCase.number}</small></div></td><td>{serviceCase.asset_id ? <div className="table-title"><Link className="table-link" href={`/assets/${serviceCase.asset_id}`}>{serviceCase.asset_tag ?? "자산 상세"}</Link><small>{serviceCase.site_name ?? "사업장 미지정"}</small></div> : "자산 미지정"}</td><td><StatusBadge status={serviceCase.severity} /></td><td><StatusBadge status={serviceCase.status} /></td><td>{formatDateTime(serviceCase.due_at, session.companyTimezone)}</td><td>{formatDateTime(serviceCase.next_action_at, session.companyTimezone)}</td><td>{formatDateTime(serviceCase.updated_at, session.companyTimezone)}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card case-section">
      <header className="card-header"><div><h2>점검 일정·이력</h2><p>최근 30건 · 조치 필요와 진행 중 우선</p></div><Link className="button small" href="/inspections">점검 업무 큐</Link></header>
      {inspections.length === 0 ? <EmptyState title="등록된 점검이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">고객 점검 일정과 이력</caption><thead><tr><th>점검·자산</th><th>제품·사업장</th><th>유형</th><th>예정일</th><th>상태·건전성</th><th>점검자</th><th>완료</th></tr></thead><tbody>{inspections.map((inspection) => <tr key={inspection.id}><td><div className="table-title"><Link className="table-link" href={`/assets/${inspection.asset_id}?tab=inspections`}><strong>{inspection.asset_tag}</strong></Link><small>{inspection.number}</small></div></td><td><div className="table-title"><strong>{inspection.product_name}</strong><small>{inspection.site_name}</small></div></td><td>{inspectionTypeLabels[inspection.inspection_type]}</td><td>{inspection.scheduled_date}</td><td><StatusBadge status={inspection.status} /> <StatusBadge status={inspection.system_health} /></td><td>{inspection.engineer_name}</td><td>{formatDateTime(inspection.completed_at, session.companyTimezone)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
