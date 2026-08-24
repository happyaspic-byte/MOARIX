import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { listAssetsAndCases } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { ServiceCaseForm } from "./service-case-form";

export const metadata: Metadata = { title: "서비스 케이스" };
export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const session = await requirePermission("service:read");
  const [{ assets, cases }, counterparties] = await Promise.all([listAssetsAndCases(session.companyId), listCounterparties(session.companyId)]);
  return <>
    <PageHeader eyebrow="SERVICE OPERATIONS" title="서비스 케이스" description="고객 문의와 장애를 자산에 연결하고 심각도와 처리 기한으로 우선순위를 관리합니다." actions={hasPermission(session.role, "service:write") ? <details className="create-panel"><summary className="button primary"><Plus size={17} />케이스 접수</summary><div className="create-drawer"><div className="drawer-head"><div><h2>서비스 케이스 접수</h2><p>담당자는 접수자에게 자동 배정됩니다.</p></div><DrawerCloseButton /></div><ServiceCaseForm counterparties={counterparties} assets={assets} /></div></details> : undefined} />
    <section className="card"><header className="card-header"><div><h2>서비스 업무 큐</h2><p>총 {cases.length}건 · 심각도 우선 정렬</p></div></header>{cases.length === 0 ? <EmptyState title="접수된 서비스 케이스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>번호·제목</th><th>고객사</th><th>자산</th><th>심각도</th><th>상태</th><th>담당자</th><th>접수 일시</th><th>처리 기한</th></tr></thead><tbody>{cases.map((row) => <tr key={row.id}><td><div className="table-title"><strong>{row.title}</strong><small>{row.number}</small></div></td><td>{row.counterparty_name}</td><td>{row.asset_tag ?? "—"}</td><td><StatusBadge status={row.severity} /></td><td><StatusBadge status={row.status} /></td><td>{row.assigned_to_name ?? "미배정"}</td><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.opened_at))}</td><td>{row.due_at ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.due_at)) : "—"}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
