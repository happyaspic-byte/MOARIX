import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarCheck2, CircleGauge, LifeBuoy, Plus, Server, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { assetSupportRiskLabels, formatAssetSupportRisk, getAssetSupportRisk, getLicenseHealth } from "@/lib/domain/asset-support-risk";
import { hasPermission } from "@/lib/security/permissions";
import { getAssetWorkspace, listAssetAssignableMembers } from "@/lib/services/assets-service";
import {
  AssetContractForm,
  AssetLicenseForm,
  AssetNetworkForm,
  AssetNodeForm,
  AssetProfileForm,
  AssetVmForm,
} from "./asset-operation-forms";
import { StratusTopology } from "@/components/stratus-topology";

export const metadata: Metadata = { title: "Stratus 자산 상세" };
export const dynamic = "force-dynamic";

const tabs = [
  ["overview", "개요"],
  ["infrastructure", "노드·네트워크"],
  ["vms", "가상 머신"],
  ["contracts", "계약·라이선스"],
  ["inspections", "점검"],
  ["cases", "케이스"],
] as const;
type AssetTab = (typeof tabs)[number][0];

const productLabels = { everrun: "everRun Enterprise", ztc_endurance: "ztC Endurance", ztc_edge: "ztC Edge", ftserver: "ftServer", other: "기타" } as const;
const contractScopeLabels = { customer_support: "1단계 · 고객 ↔ 우리 회사", partner_support: "2단계 · 우리 회사 ↔ 파트너", vendor_support: "3단계 · 파트너/우리 회사 ↔ Stratus" } as const;

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function EntryPanel({ label, children }: { label: string; children: ReactNode }) {
  return <details className="case-entry-panel"><summary className="button small"><Plus size={15} />{label}</summary><div className="case-entry-popover asset-entry-popover"><div className="drawer-head"><div><h2>{label}</h2><p>저장하면 변경 내용이 감사 이력에 기록됩니다.</p></div><DrawerCloseButton /></div>{children}</div></details>;
}

function EditDrawer({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <details className="create-panel"><summary className="button small">편집</summary><div className="create-drawer"><div className="drawer-head"><div><h2>{title}</h2><p>{description}</p></div><DrawerCloseButton /></div>{children}</div></details>;
}

export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ assetId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePermission("assets:read");
  const { assetId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) notFound();
  const [workspace, members] = await Promise.all([
    getAssetWorkspace(session.companyId, assetId),
    listAssetAssignableMembers(session.companyId),
  ]);
  if (!workspace) notFound();
  const { tab: requestedTab } = await searchParams;
  const tab = tabs.some(([value]) => value === requestedTab) ? requestedTab as AssetTab : "overview";
  const { asset, nodes, networks, virtualMachines, contracts, licenses, inspections, cases, checks } = workspace;
  const today = dateInTimeZone(session.companyTimezone);
  const risk = getAssetSupportRisk({
    assetStatus: asset.status,
    customerStatus: asset.contract_status,
    customerEndsOn: asset.support_until,
    vendorStatus: asset.vendor_contract_status,
    vendorEndsOn: asset.vendor_support_until,
  }, today);
  const canWrite = hasPermission(session.role, "assets:write");
  const openCases = cases.filter((row) => ["open", "in_progress", "waiting"].includes(row.status));
  const nextInspection = [...inspections]
    .filter((row) => ["scheduled", "in_progress", "issue_found"].includes(row.status))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
  const latestInspection = inspections.find((row) => ["completed", "issue_found"].includes(row.status));

  return <>
    <PageHeader
      eyebrow={`STRATUS ASSET · ${asset.vendor_asset_id ?? asset.asset_tag}`}
      title={asset.product_name}
      description={`${asset.counterparty_name} · ${asset.site ?? "사업장 미지정"} · ${productLabels[asset.product_family]} ${asset.software_version ?? ""}`.trim()}
      actions={<><Link className="button" href="/assets"><ArrowLeft size={17} />자산 운영 큐</Link><Link className="button" href={`/inspections?assetId=${asset.id}&create=1`}>점검 예약</Link><Link className="button primary" href={`/service?assetId=${asset.id}&create=1`}>케이스 접수</Link></>}
    />

    <section className="asset-hero card" aria-label="자산 운영 요약">
      <div className="asset-hero-main"><div className="case-summary-badges"><StatusBadge status={asset.status} /><StatusBadge status={asset.protection_mode} /><StatusBadge status={risk.state} /></div><strong>{asset.vendor_asset_id ?? "Stratus Asset ID 미등록"}</strong><p>내부 태그 {asset.asset_tag} · {asset.business_system ?? "업무 시스템 미등록"} · 담당 {asset.assigned_engineer_name ?? "미지정"}</p></div>
      <div className={`asset-risk-callout risk-${risk.state}`}><span>실효 지원 상태</span><strong>{assetSupportRiskLabels[risk.state]}</strong><small>{formatAssetSupportRisk(risk)} · 고객 계약 {asset.support_until ?? "기한 미등록"} · 벤더 계약 {asset.vendor_support_until ?? "미확인"}</small></div>
    </section>

    <section className="metric-grid compact" aria-label="자산 핵심 지표">
      <MetricCard label="실효 지원" value={formatAssetSupportRisk(risk)} helper={assetSupportRiskLabels[risk.state]} icon={ShieldCheck} tone={risk.state === "covered" ? "blue" : "coral"} />
      <MetricCard label="다음 점검" value={nextInspection?.scheduled_date ?? asset.next_inspection_date ?? "미정"} helper={nextInspection ? nextInspection.number : "예약된 점검 없음"} icon={CalendarCheck2} tone="amber" />
      <MetricCard label="진행 케이스" value={`${openCases.length}건`} helper={openCases.some((row) => row.severity === "critical") ? "긴급 케이스 포함" : "접수·처리·대기"} icon={LifeBuoy} tone="coral" />
      <MetricCard label="구성 규모" value={`${nodes.length} Nodes · ${virtualMachines.length} VMs`} helper={`${networks.length}개 네트워크 인터페이스`} icon={Server} />
    </section>

    <nav className="detail-tabs" aria-label="자산 상세 메뉴">{tabs.map(([value, label]) => <Link key={value} href={`/assets/${asset.id}?tab=${value}`} aria-current={tab === value ? "page" : undefined} className={tab === value ? "active" : undefined}>{label}</Link>)}</nav>

    {tab === "overview" ? <div className="section-grid">
      <section className="card span-8"><header className="card-header"><div><h2>자산 개요</h2><p>고객 위치, 플랫폼 구성과 운영 책임</p></div>{canWrite ? <EntryPanel label="운영 정보 수정"><AssetProfileForm asset={asset} members={members} companyTimezone={session.companyTimezone} /></EntryPanel> : null}</header><dl className="asset-fact-grid">
        <div><dt>고객·사업장</dt><dd>{asset.counterparty_name}<small>{asset.site ?? "—"}</small></dd></div>
        <div><dt>Asset ID</dt><dd>{asset.vendor_asset_id ?? "—"}<small>{asset.asset_tag}</small></dd></div>
        <div><dt>제품·버전</dt><dd>{productLabels[asset.product_family]}<small>{asset.product_model ?? "모델 미등록"} · {asset.software_version ?? "버전 미등록"}</small></dd></div>
        <div><dt>보호·OS</dt><dd>{asset.protection_mode.toUpperCase()}<small>{asset.operating_system ?? "OS 미등록"}</small></dd></div>
        <div><dt>플랫폼</dt><dd>{asset.hardware_vendor ?? "제조사 미등록"}<small>{asset.hypervisor ?? "하이퍼바이저 미등록"} · {asset.rack_location ?? "랙 위치 미등록"}</small></dd></div>
        <div><dt>관리 주소</dt><dd>{asset.management_ip ?? "—"}<small>운영 DB에서만 실제 주소를 관리하세요.</small></dd></div>
        <div><dt>설치·보증</dt><dd>{asset.installed_at ?? "설치일 미등록"}<small>보증 {asset.warranty_until ?? "미등록"}</small></dd></div>
        <div><dt>구성 검증</dt><dd>{formatDateTime(asset.configuration_checked_at, session.companyTimezone)}<small>출처: {asset.configuration_source}</small></dd></div>
      </dl></section>
      <aside className="card span-4"><header className="card-header"><div><h2>최근 운영 신호</h2><p>점검·케이스 기준</p></div><CircleGauge size={18} /></header><div className="card-body attention-list">
        <Link className="attention-item" href={`/assets/${asset.id}?tab=inspections`}><div><strong>최근 점검 건전성</strong><span>{latestInspection?.number ?? "완료 점검 없음"}</span></div><StatusBadge status={latestInspection?.system_health ?? "unknown"} /></Link>
        <Link className="attention-item" href={`/assets/${asset.id}?tab=cases`}><div><strong>진행 케이스</strong><span>긴급·SLA 순 확인</span></div><span className="attention-number">{openCases.length}</span></Link>
        <Link className="attention-item" href={`/assets/${asset.id}?tab=contracts`}><div><strong>벤더 지원</strong><span>Stratus/Penguin 에스컬레이션</span></div><StatusBadge status={asset.vendor_contract_status ?? "unknown"} /></Link>
      </div></aside>
    </div> : null}

    {tab === "infrastructure" ? <div className="section-grid">
      <section className="card span-12"><header className="card-header"><div><h2>이중화 토폴로지</h2><p>Node0/Node1 또는 CMA/CMB, A-Link, BMC, VM FT/HA 배치</p></div></header><StratusTopology asset={asset} nodes={nodes} networks={networks} virtualMachines={virtualMachines} /></section>
      <section className="card span-12"><header className="card-header"><div><h2>Node·Compute Module</h2><p>everRun Node0/Node1 또는 Endurance CMA/CMB</p></div>{canWrite ? <EntryPanel label="노드 등록"><AssetNodeForm assetId={asset.id} productFamily={asset.product_family} companyTimezone={session.companyTimezone} /></EntryPanel> : null}</header>{nodes.length === 0 ? <EmptyState title="등록된 노드 구성이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">노드 구성</caption><thead><tr><th>노드</th><th>상태</th><th>모델·시리얼</th><th>관리·BMC</th><th>자원</th><th>마지막 확인</th>{canWrite ? <th>편집</th> : null}</tr></thead><tbody>{nodes.map((node) => <tr key={node.id}><td><div className="table-title"><strong>{node.name}</strong><small>{node.role.toUpperCase()} · {node.operating_system ?? "OS 미등록"}</small></div></td><td><StatusBadge status={node.status} /></td><td>{node.hardware_model ?? "—"}<br /><small>{node.serial_number ?? ""}</small></td><td><div className="table-title"><strong>{node.management_address ?? "—"}</strong><small>BMC {node.bmc_address ?? "—"}</small></div></td><td>{node.cpu_cores ? `${node.cpu_cores} Core` : "—"}{node.memory_gb ? ` · ${node.memory_gb} GB` : ""}</td><td>{formatDateTime(node.last_verified_at, session.companyTimezone)}<br /><small>{node.source}</small></td>{canWrite ? <td><EditDrawer title={`${node.name} 노드 편집`} description="상태와 구성 정보를 교정하고 감사 이력을 남깁니다."><AssetNodeForm assetId={asset.id} productFamily={asset.product_family} initial={node} companyTimezone={session.companyTimezone} /></EditDrawer></td> : null}</tr>)}</tbody></table></div>}</section>
      <section className="card span-12"><header className="card-header"><div><h2>네트워크·A-Link</h2><p>관리, 업무, Private, A-Link, BMC 연결</p></div>{canWrite ? <EntryPanel label="네트워크 등록"><AssetNetworkForm assetId={asset.id} nodes={nodes} companyTimezone={session.companyTimezone} /></EntryPanel> : null}</header>{networks.length === 0 ? <EmptyState title="등록된 네트워크 구성이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">네트워크 구성</caption><thead><tr><th>인터페이스</th><th>용도·상태</th><th>주소·상대</th><th>VLAN·속도</th><th>스위치·그룹</th><th>확인</th>{canWrite ? <th>편집</th> : null}</tr></thead><tbody>{networks.map((network) => <tr key={network.id}><td><div className="table-title"><strong>{network.label}</strong><small>{network.node_name ?? "공용"}</small></div></td><td><StatusBadge status={network.status} /> <small>{network.purpose.replaceAll("_", "-")}</small></td><td><div className="table-title"><strong>{network.address ?? "—"}</strong><small>{network.peer_address ? `Peer ${network.peer_address}` : network.mac_address ?? ""}</small></div></td><td>{network.vlan_id ? `VLAN ${network.vlan_id}` : "—"}{network.speed_mbps ? ` · ${network.speed_mbps} Mbps` : ""}</td><td>{network.switch_port ?? "—"}<br /><small>{network.redundancy_group ?? ""}</small></td><td>{formatDateTime(network.last_verified_at, session.companyTimezone)}</td>{canWrite ? <td><EditDrawer title={`${network.label} 네트워크 편집`} description="노드 연결, A-Link 상태와 주소 정보를 교정합니다."><AssetNetworkForm assetId={asset.id} nodes={nodes} initial={network} companyTimezone={session.companyTimezone} /></EditDrawer></td> : null}</tr>)}</tbody></table></div>}</section>
    </div> : null}

    {tab === "vms" ? <section className="card"><header className="card-header"><div><h2>가상 머신 구성</h2><p>HA·FT 보호, 자원, 업무 역할과 운영 상태</p></div>{canWrite ? <EntryPanel label="VM 등록"><AssetVmForm assetId={asset.id} nodes={nodes} companyTimezone={session.companyTimezone} /></EntryPanel> : null}</header>{virtualMachines.length === 0 ? <EmptyState title="등록된 VM이 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">가상 머신 구성</caption><thead><tr><th>VM·업무</th><th>보호·상태</th><th>OS·주소</th><th>자원</th><th>선호 노드</th><th>확인</th>{canWrite ? <th>편집</th> : null}</tr></thead><tbody>{virtualMachines.map((vm) => <tr key={vm.id}><td><div className="table-title"><strong>{vm.name}</strong><small>{vm.business_role ?? "업무 역할 미등록"}</small></div></td><td><StatusBadge status={vm.protection_mode} /> <StatusBadge status={vm.status} />{vm.protection_mode === "ft" && (vm.vcpu ?? 0) > 8 ? <small className="inline-warning">FT vCPU 정책 확인 필요</small> : null}</td><td><div className="table-title"><strong>{vm.operating_system ?? "—"}</strong><small>{vm.ip_addresses ?? "주소 미등록"}</small></div></td><td>{vm.vcpu ? `${vm.vcpu} vCPU` : "—"}{vm.memory_gb ? ` · ${vm.memory_gb} GB` : ""}{vm.storage_gb ? ` · ${vm.storage_gb} GB` : ""}</td><td>{vm.preferred_node_name ?? "—"}</td><td>{formatDateTime(vm.last_verified_at, session.companyTimezone)}</td>{canWrite ? <td><EditDrawer title={`${vm.name} VM 편집`} description="보호 방식, 실행 상태와 자원 구성을 교정합니다."><AssetVmForm assetId={asset.id} nodes={nodes} initial={vm} companyTimezone={session.companyTimezone} /></EditDrawer></td> : null}</tr>)}</tbody></table></div>}</section> : null}

    {tab === "contracts" ? <div className="section-grid">
      <section className="card span-12"><header className="card-header"><div><h2>지원 계약 체인</h2><p>고객 → 파트너 → 우리 회사 → Stratus/Penguin 지원 범위를 분리합니다.</p></div>{canWrite ? <EntryPanel label="계약 개정"><AssetContractForm assetId={asset.id} members={members} /></EntryPanel> : null}</header>{risk.state === "vendor_gap" ? <div className="card-body"><div className="case-callout warning"><strong>벤더 지원 공백</strong><p>고객 지원 의무는 존재하지만 Stratus/Penguin 상위 계약이 없거나 만료되었습니다. 에스컬레이션 가능 범위를 먼저 확인하세요.</p></div></div> : null}{contracts.length === 0 ? <EmptyState title="정규화된 계약 이력이 없습니다." description="기존 자산 계약 정보는 개요에 유지되며, 다음 갱신부터 고객 계약과 벤더 계약을 나눠 등록하세요." /> : <div className="contract-chain">{contracts.map((contract) => <article key={contract.id} className={`contract-card ${contract.is_current ? "current" : "history"}`}><header><div><strong>{contractScopeLabels[contract.scope]}</strong><small>{contract.contract_number ?? "계약번호 없음"}</small></div><StatusBadge status={contract.status} /></header><p>{contract.provider_name}{contract.intermediary_name ? ` → ${contract.intermediary_name}` : ""}{contract.recipient_name ? ` → ${contract.recipient_name}` : ""}</p><dl><div><dt>기간</dt><dd>{contract.starts_on ?? "—"} ~ {contract.ends_on ?? "—"}</dd></div><div><dt>등급·방식</dt><dd>{contract.support_level ?? "—"} · {contract.service_method}</dd></div><div><dt>범위</dt><dd>{contract.coverage_summary ?? "—"}</dd></div><div><dt>제외</dt><dd>{contract.exclusions ?? "—"}</dd></div></dl><small>개정 #{contract.revision_number} · {contract.is_current ? "현재 계약" : "과거 이력"} · 갱신 담당 {contract.renewal_owner_name ?? "미지정"}</small></article>)}</div>}</section>
      <section className="card span-12"><header className="card-header"><div><h2>라이선스·Entitlement</h2><p>지원 계약 만료와 라이선스 만료를 별도로 관리합니다.</p></div>{canWrite ? <EntryPanel label="라이선스 등록"><AssetLicenseForm assetId={asset.id} contracts={contracts} /></EntryPanel> : null}</header>{licenses.length === 0 ? <EmptyState title="등록된 라이선스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">라이선스 현황</caption><thead><tr><th>제품</th><th>유형·상태</th><th>참조·계약·키 힌트</th><th>수량</th><th>발급·만료</th><th>만료 위험</th>{canWrite ? <th>편집</th> : null}</tr></thead><tbody>{licenses.map((license) => { const health = getLicenseHealth({ status: license.status, licenseType: license.license_type, expiresOn: license.expires_on }, today); return <tr key={license.id}><td><div className="table-title"><strong>{license.product_name}</strong><small>{license.version ?? "버전 미등록"}</small></div></td><td><StatusBadge status={license.license_type} /> <StatusBadge status={license.status} /></td><td>{license.entitlement_reference ?? "—"}<br /><small>{license.support_contract_number ? `계약 ${license.support_contract_number}` : "계약 미연결"}</small><br /><small>{license.license_key_hint ? `키 …${license.license_key_hint}` : "키 미저장"}</small></td><td>{license.quantity}</td><td>{license.issued_on ?? "—"} ~ {license.expires_on ?? "영구/미등록"}</td><td><StatusBadge status={health.state} /></td>{canWrite ? <td><EditDrawer title={`${license.product_name} 라이선스 편집`} description="상태, 수량과 유효기간을 교정합니다."><AssetLicenseForm assetId={asset.id} contracts={contracts} initial={license} /></EditDrawer></td> : null}</tr>; })}</tbody></table></div>}</section>
    </div> : null}

    {tab === "inspections" ? <section className="card"><header className="card-header"><div><h2>점검 일정·결과</h2><p>Protection·Sync·Service와 자원 체크리스트</p></div><Link className="button small" href={`/inspections?assetId=${asset.id}&create=1`}>점검 예약</Link></header>{inspections.length === 0 ? <EmptyState title="등록된 점검이 없습니다." /> : <div className="inspection-stack">{inspections.map((inspection) => { const inspectionChecks = checks.filter((check) => check.inspection_id === inspection.id); return <article key={inspection.id} className="inspection-card"><header><div><strong>{inspection.number}</strong><small>{inspection.inspection_type} · {inspection.scheduled_date} · {inspection.engineer_name}</small></div><StatusBadge status={inspection.status} /></header><div className="check-summary"><StatusBadge status={inspection.system_health} /><StatusBadge status={inspection.protection_status} /><StatusBadge status={inspection.sync_status} /><StatusBadge status={inspection.service_status} /></div>{inspectionChecks.length > 0 ? <ul className="checklist-inline">{inspectionChecks.map((check) => <li key={check.id}><span>{check.label}</span><StatusBadge status={check.result} /><small>{check.observed_value ?? ""}</small></li>)}</ul> : null}{inspection.findings ? <p><strong>발견:</strong> {inspection.findings}</p> : null}{inspection.action_items ? <p><strong>조치:</strong> {inspection.action_items}</p> : null}</article>; })}</div>}</section> : null}

    {tab === "cases" ? <section className="card"><header className="card-header"><div><h2>연결 서비스 케이스</h2><p>진행 건과 높은 심각도를 우선 표시합니다.</p></div><Link className="button small primary" href={`/service?assetId=${asset.id}&create=1`}>케이스 접수</Link></header>{cases.length === 0 ? <EmptyState title="연결된 서비스 케이스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">자산 서비스 케이스</caption><thead><tr><th>케이스</th><th>심각도</th><th>상태</th><th>처리 기한</th><th>다음 조치</th><th>외부 번호</th></tr></thead><tbody>{cases.map((serviceCase) => <tr key={serviceCase.id}><td><div className="table-title"><Link href={`/service/${serviceCase.id}`}><strong>{serviceCase.title}</strong></Link><small>{serviceCase.number}</small></div></td><td><StatusBadge status={serviceCase.severity} /></td><td><StatusBadge status={serviceCase.status} /></td><td>{formatDateTime(serviceCase.due_at, session.companyTimezone)}</td><td>{formatDateTime(serviceCase.next_action_at, session.companyTimezone)}</td><td>{serviceCase.external_case_number ?? "—"}</td></tr>)}</tbody></table></div>}</section> : null}
  </>;
}
