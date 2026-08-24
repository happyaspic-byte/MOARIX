import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { listAuditLogs } from "@/lib/services/admin";

export const metadata: Metadata = { title: "감사 로그" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await requirePermission("audit:read");
  const logs = await listAuditLogs(session.companyId);
  return <>
    <PageHeader eyebrow="AUDIT TRAIL" title="감사 로그" description="업무 데이터의 생성과 상태 변경을 행위자·대상·시간과 함께 추적합니다. 감사 로그는 일반 화면에서 수정할 수 없습니다." />
    <section className="card"><header className="card-header"><div><h2>최근 변경 이력</h2><p>최근 {logs.length}건 · 최대 200건</p></div></header>{logs.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>일시</th><th>행위자</th><th>동작</th><th>대상</th><th>요약</th></tr></thead><tbody>{logs.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.created_at))}</td><td>{row.actor_name ?? "시스템"}</td><td><strong>{row.action}</strong></td><td>{row.entity_type}</td><td>{row.summary}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
