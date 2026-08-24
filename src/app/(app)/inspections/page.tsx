import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { listAssets } from "@/lib/services/assets-service";
import { listInspections } from "@/lib/services/operations-service";
import { InspectionForm } from "./inspection-form";
import { InspectionResultForm, QuickInspectionAction } from "./inspection-transition-forms";

export const metadata: Metadata = { title: "정기점검" };
export const dynamic = "force-dynamic";

const inspectionTypeLabels = { installation: "설치", preventive: "예방", quarterly: "정기", incident: "장애", upgrade: "업그레이드" } as const;

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const session = await requirePermission("service:read");
  const [inspections, assets] = await Promise.all([listInspections(session.companyId), listAssets(session.companyId)]);
  const { queue } = await searchParams;
  const horizon = new Date(`${dateInTimeZone(session.companyTimezone)}T12:00:00.000Z`);
  horizon.setDate(horizon.getDate() + 30);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const visibleInspections = queue === "due" ? inspections.filter((row) => ["scheduled", "in_progress", "issue_found"].includes(row.status) && row.scheduled_date <= horizonDate) : inspections;
  const canWrite = hasPermission(session.role, "service:write");
  return <>
    <PageHeader eyebrow="MAINTENANCE INSPECTIONS" title="정기점검" description="Protection·Sync·Service와 CPU·메모리·디스크 상태를 자산별로 기록하고 다음 점검 일정을 이어갑니다." actions={canWrite ? <details className="create-panel"><summary className="button primary"><Plus size={17} />점검 예약</summary><div className="create-drawer"><div className="drawer-head"><div><h2>점검 일정 등록</h2><p>담당 엔지니어는 현재 사용자로 자동 지정됩니다.</p></div><DrawerCloseButton /></div><InspectionForm assets={assets} /></div></details> : undefined} />
    <nav className="filter-bar" aria-label="점검 업무 필터"><Link className={`button small ${!queue ? "primary" : ""}`} href="/inspections">전체</Link><Link className={`button small ${queue === "due" ? "primary" : ""}`} href="/inspections?queue=due">30일 내 점검</Link></nav>
    <section className="card"><header className="card-header"><div><h2>점검 업무 큐</h2><p>{queue === "due" ? `${visibleInspections.length}건 필터 결과 · 전체 ${inspections.length}건` : `총 ${inspections.length}건`} · 조치 필요와 진행 중 우선</p></div><ClipboardCheck size={18} aria-hidden="true" /></header>{visibleInspections.length === 0 ? <EmptyState title={inspections.length === 0 ? "등록된 점검 일정이 없습니다." : "30일 내 처리할 점검이 없습니다."} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>번호·자산</th><th>고객·사업장</th><th>유형·예정일</th><th>상태</th><th>점검자</th><th>핵심 점검</th><th>자원 사용률</th>{canWrite ? <th>처리</th> : null}</tr></thead><tbody>{visibleInspections.map((row) => <tr key={row.id}><td><div className="table-title"><strong>{row.asset_tag}</strong><small>{row.number} · {row.product_name}</small></div></td><td><div className="table-title"><strong>{row.customer_name}</strong><small>{row.site_name}</small></div></td><td><div className="table-title"><strong>{inspectionTypeLabels[row.inspection_type]}</strong><small>{row.scheduled_date}</small></div></td><td><div className="table-title"><StatusBadge status={row.status} />{row.system_health !== "unknown" ? <small>건전성: {row.system_health}</small> : null}</div></td><td>{row.engineer_name}</td><td><div className="check-summary"><StatusBadge status={row.protection_status} /><StatusBadge status={row.sync_status} /><StatusBadge status={row.service_status} /></div></td><td>{row.cpu_percent ? `CPU ${row.cpu_percent}%` : "—"}{row.memory_percent ? ` · MEM ${row.memory_percent}%` : ""}{row.disk_percent ? ` · DISK ${row.disk_percent}%` : ""}</td>{canWrite ? <td><div className="row-actions">{row.status === "scheduled" ? <><QuickInspectionAction inspectionId={row.id} nextStatus="in_progress" label="점검 시작" /><QuickInspectionAction inspectionId={row.id} nextStatus="cancelled" label="취소" /></> : null}{row.status === "issue_found" ? <QuickInspectionAction inspectionId={row.id} nextStatus="in_progress" label="재점검" /> : null}{row.status === "in_progress" ? <details className="create-panel"><summary className="button small primary">결과 입력</summary><div className="create-drawer"><div className="drawer-head"><div><h2>{row.number} 점검 결과</h2><p>{row.customer_name} · {row.site_name} · {row.asset_tag}</p></div><DrawerCloseButton /></div><InspectionResultForm inspectionId={row.id} /></div></details> : null}</div></td> : null}</tr>)}</tbody></table></div>}</section>
  </>;
}
