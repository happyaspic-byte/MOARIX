import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { listMembers } from "@/lib/services/admin";
import { MemberForm, MemberSettingsForm } from "./member-form";

export const metadata: Metadata = { title: "사용자·역할" };
export const dynamic = "force-dynamic";

const roleLabels = { owner: "소유자", admin: "관리자", manager: "매니저", member: "실무자", viewer: "조회자" };

export default async function UsersPage() {
  const session = await requirePermission("users:read");
  const members = await listMembers(session.companyId);
  const canManage = hasPermission(session.role, "users:manage");
  const canAssignOwner = session.role === "owner";
  const createPanel = canManage ? (
    <details className="create-panel">
      <summary className="button primary"><Plus size={17} />사용자 추가</summary>
      <div className="create-drawer"><div className="drawer-head"><div><h2>새 사용자</h2><p>회사에 로그인할 계정과 최초 역할을 등록합니다.</p></div><DrawerCloseButton /></div><MemberForm canAssignOwner={canAssignOwner} /></div>
    </details>
  ) : undefined;

  return <>
    <PageHeader eyebrow="ACCESS CONTROL" title="사용자·역할" description="회사 구성원과 역할 기반 접근 권한을 관리합니다. 역할이나 활성 상태를 바꾸면 해당 사용자의 기존 세션은 폐기됩니다." actions={createPanel} />
    <section className="card"><header className="card-header"><div><h2>회사 구성원</h2><p>총 {members.length}명</p></div></header><div className="table-wrap"><table className="data-table"><thead><tr><th>이름·이메일</th><th>역할</th><th>상태</th><th>최근 로그인</th>{canManage ? <th>관리</th> : null}</tr></thead><tbody>{members.map((row) => <tr key={row.user_id}><td><div className="table-title"><strong>{row.name}</strong><small>{row.email}</small></div></td><td>{roleLabels[row.role]}</td><td><StatusBadge status={row.is_active ? "active" : "retired"} /></td><td>{row.last_login_at ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.last_login_at)) : "로그인 기록 없음"}</td>{canManage ? <td><MemberSettingsForm member={row} canAssignOwner={canAssignOwner} disabled={session.role !== "owner" && row.role === "owner"} /></td> : null}</tr>)}</tbody></table></div></section>
  </>;
}
