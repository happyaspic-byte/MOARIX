import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { allowedServiceCaseTransitions } from "@/lib/domain/service-case-state";
import { listAssetsAndCases } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { ServiceCaseForm } from "./service-case-form";
import { ServiceTransitionForm } from "./service-transition-form";

export const metadata: Metadata = { title: "장애·지원 케이스" };
export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const session = await requirePermission("service:read");
  const [{ assets, cases }, counterparties] = await Promise.all([listAssetsAndCases(session.companyId), listCounterparties(session.companyId)]);
  const canWrite = hasPermission(session.role, "service:write");
  return <>
    <PageHeader eyebrow="STRATUS SERVICE OPERATIONS" title="장애·지원 케이스" description="고객과 자산이 일치하는 케이스만 연결하고 내부 번호와 Stratus 외부 CS 번호, 대기·해결·종료 흐름을 관리합니다." actions={canWrite ? <details className="create-panel"><summary className="button primary"><Plus size={17} />케이스 접수</summary><div className="create-drawer"><div className="drawer-head"><div><h2>서비스 케이스 접수</h2><p>선택한 고객에 속한 자산만 연결할 수 있습니다.</p></div><DrawerCloseButton /></div><ServiceCaseForm counterparties={counterparties} assets={assets} /></div></details> : undefined} />
    <section className="card"><header className="card-header"><div><h2>서비스 업무 큐</h2><p>총 {cases.length}건 · 진행 상태와 심각도 우선</p></div></header>{cases.length === 0 ? <EmptyState title="접수된 서비스 케이스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>번호·제목</th><th>고객사·자산</th><th>심각도</th><th>상태·메모</th><th>담당자</th><th>접수·기한</th>{canWrite ? <th>상태 처리</th> : null}</tr></thead><tbody>{cases.map((row) => <tr key={row.id}><td><div className="table-title"><strong>{row.title}</strong><small>{row.number}{row.external_case_number ? ` · ${row.external_provider ?? "외부"} ${row.external_case_number}` : ""}</small></div></td><td><div className="table-title"><strong>{row.counterparty_name}</strong><small>{row.asset_tag ?? "자산 미지정"}</small></div></td><td><StatusBadge status={row.severity} /></td><td><div className="table-title"><StatusBadge status={row.status} /><small>{row.waiting_reason ?? row.resolution_summary ?? "—"}</small></div></td><td>{row.assigned_to_name ?? "미배정"}</td><td><div className="table-title"><strong>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.opened_at))}</strong><small>{row.due_at ? `기한 ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.due_at))}` : "기한 미지정"}</small></div></td>{canWrite ? <td><div className="case-transitions">{allowedServiceCaseTransitions(row.status).map((nextStatus) => <ServiceTransitionForm key={nextStatus} caseId={row.id} nextStatus={nextStatus} />)}</div></td> : null}</tr>)}</tbody></table></div>}</section>
  </>;
}
