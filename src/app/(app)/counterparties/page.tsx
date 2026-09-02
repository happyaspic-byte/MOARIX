import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CounterpartyForm, DeleteCounterpartyForm } from "./counterparty-form";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { listCounterparties } from "@/lib/services/master-data";

export const metadata: Metadata = { title: "거래처" };
export const dynamic = "force-dynamic";

const kindLabel = { customer: "고객", supplier: "공급사", both: "고객·공급사" };

export default async function CounterpartiesPage() {
  const session = await requirePermission("master:read");
  const rows = await listCounterparties(session.companyId);
  const createPanel = hasPermission(session.role, "master:write") ? (
    <details className="create-panel">
      <summary className="button primary"><Plus size={17} />거래처 등록</summary>
      <div className="create-drawer">
        <div className="drawer-head"><div><h2>새 거래처</h2><p>거래 문서에 사용할 기준정보를 등록합니다.</p></div><DrawerCloseButton /></div>
        <CounterpartyForm />
      </div>
    </details>
  ) : undefined;

  return <>
    <PageHeader eyebrow="MASTER DATA" title="거래처" description="고객과 공급사의 기본 정보, 결제 조건과 신용 한도를 한 원장에서 관리합니다." actions={createPanel} />
    <section className="card">
      <header className="card-header"><div><h2>거래처 목록</h2><p>총 {rows.length}개 · 회사별로 격리된 데이터</p></div></header>
      {rows.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>코드·거래처</th><th>유형</th><th>상태</th><th>사업자번호</th><th>담당</th><th>연락처</th><th>결제 조건</th><th className="numeric">신용 한도</th>{hasPermission(session.role, "master:write") ? <th>관리</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-title">{row.kind === "supplier" ? <strong>{row.name}</strong> : <Link className="table-link" href={`/counterparties/${row.id}`}><strong>{row.name}</strong></Link>}<small>{row.code}</small></div></td><td>{kindLabel[row.kind]}</td><td><StatusBadge status={row.is_active ? "active" : "retired"} /></td><td>{row.business_number ?? "—"}</td><td>{row.representative_name ?? "—"}</td><td><div className="table-title"><span>{row.phone ?? "—"}</span><small>{row.email ?? ""}</small></div></td><td>{row.payment_terms_days}일</td><td className="numeric">{formatMoney(row.credit_limit)}</td>{hasPermission(session.role, "master:write") ? <td><div className="row-actions"><details className="create-panel"><summary className="button small">수정</summary><div className="create-drawer"><div className="drawer-head"><div><h2>{row.name} 수정</h2><p>고객사 코드, 담당자, 연락처를 갱신합니다. 비활성 거래처를 저장하면 다시 활성화됩니다.</p></div><DrawerCloseButton /></div><CounterpartyForm initial={row} /></div></details>{row.is_active ? <DeleteCounterpartyForm id={row.id} name={row.name} /> : null}</div></td> : null}</tr>)}</tbody></table></div>}
    </section>
  </>;
}
