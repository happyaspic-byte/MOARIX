import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import type { DocumentStatus } from "@/lib/domain/document-state";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { documentKindLabels, documentKinds, listDocuments, type DocumentKind } from "@/lib/services/documents";
import { listCounterparties, listItems } from "@/lib/services/master-data";
import { conversionLabel, nextDocumentKind } from "@/lib/domain/document-conversion";
import { DocumentForm } from "./document-form";
import { convertDocumentAction, transitionDocumentAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: documentKindLabels[kind as DocumentKind] ?? "업무 문서" };
}

function isKind(value: string): value is DocumentKind {
  return documentKinds.includes(value as DocumentKind);
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const descriptions: Record<DocumentKind, string> = {
  quote: "고객 제안 금액과 조건을 작성하고 승인 후 수주로 이어지는 시작점입니다.",
  sales_order: "고객 주문을 출고로 전환하고 매출 청구까지 연결합니다.",
  shipment: "수주 품목의 출고를 확정하고 매출 청구로 전환합니다.",
  purchase_order: "공급사 발주를 입고로 전환하고 매입 청구까지 연결합니다.",
  receipt: "발주 품목의 입고를 확정하고 매입 청구로 전환합니다.",
  invoice: "매출 청구와 미수금의 근거 문서를 관리합니다.",
  bill: "매입 청구와 지급 예정 금액을 관리합니다.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { kind: rawKind } = await params;
  if (!isKind(rawKind)) notFound();
  const kind = rawKind;
  const query = await searchParams;
  const q = first(query.q);
  const status = first(query.status);
  const from = first(query.from);
  const to = first(query.to);
  const page = Math.max(Number(first(query.page) || "1"), 1);
  const session = await requirePermission("documents:read");
  const [documents, counterparties, items] = await Promise.all([
    listDocuments(session.companyId, kind, { query: q, status, from, to, limit: 50, offset: (page - 1) * 50 }),
    listCounterparties(session.companyId),
    listItems(session.companyId),
  ]);
  const canWrite = hasPermission(session.role, "documents:write");
  const canApprove = hasPermission(session.role, "documents:approve");
  const filteredCounterparties = kind === "purchase_order" || kind === "bill"
    ? counterparties.filter((row) => row.kind !== "customer")
    : counterparties.filter((row) => row.kind !== "supplier");
  const createPanel = canWrite ? (
    <details className="create-panel">
      <summary className="button primary"><Plus size={17} />{documentKindLabels[kind]} 작성</summary>
      <div className="create-drawer">
        <div className="drawer-head"><div><h2>새 {documentKindLabels[kind]}</h2><p>여러 품목을 한 문서에 등록하고, 확정 후 다음 문서로 전환합니다.</p></div><DrawerCloseButton /></div>
        <DocumentForm kind={kind} counterparties={filteredCounterparties} items={items.filter((row) => row.is_active)} today={todayInSeoul()} />
      </div>
    </details>
  ) : undefined;

  return <>
    <PageHeader eyebrow="BUSINESS DOCUMENTS" title={documentKindLabels[kind]} description={descriptions[kind]} actions={createPanel} />
    <section className="card">
      <header className="card-header"><div><h2>{documentKindLabels[kind]} 목록</h2><p>총 {documents.total}건 · 페이지 {page}</p></div></header>
      <form className="filter-bar" method="get">
        <input name="q" defaultValue={q} placeholder="번호·거래처 검색" />
        <select name="status" defaultValue={status}><option value="">전체 상태</option><option value="draft">초안</option><option value="submitted">제출</option><option value="approved">승인</option><option value="posted">확정</option><option value="cancelled">취소</option></select>
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <button className="button small" type="submit">검색</button>
      </form>
      {documents.rows.length === 0 ? <EmptyState title={`등록된 ${documentKindLabels[kind]}이 없습니다.`} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>문서번호</th><th>거래처</th><th>발행일</th><th>예정일</th><th>상태</th><th>작성자</th><th className="numeric">합계</th><th>처리</th></tr></thead>
        <tbody>{documents.rows.map((row) => <tr key={row.id}>
          <td><strong>{row.number}</strong></td><td>{row.counterparty_name}</td><td>{row.issue_date}</td><td>{row.due_date ?? "—"}</td><td><StatusBadge status={row.status} /></td><td>{row.created_by_name}</td><td className="numeric"><strong>{formatMoney(row.grand_total, row.currency)}</strong></td>
          <td><div className="page-actions">
            {row.status === "draft" && canWrite ? <><StatusAction id={row.id} kind={kind} status="submitted" label="제출" /><StatusAction id={row.id} kind={kind} status="cancelled" label="취소" danger /></> : null}
            {row.status === "submitted" ? <>{canApprove ? <StatusAction id={row.id} kind={kind} status="approved" label="승인" /> : null}{canWrite ? <><StatusAction id={row.id} kind={kind} status="draft" label="반려" /><StatusAction id={row.id} kind={kind} status="cancelled" label="취소" danger /></> : null}</> : null}
            {row.status === "approved" && canApprove ? <><StatusAction id={row.id} kind={kind} status="posted" label="확정" /><StatusAction id={row.id} kind={kind} status="cancelled" label="취소" danger /></> : null}
            <a className="button small" href={`/api/v1/documents/${row.id}/print`} target="_blank" rel="noreferrer">PDF/인쇄</a>
            {row.status === "posted" ? <>{canWrite && nextDocumentKind(kind) ? <form action={convertDocumentAction}><input type="hidden" name="documentId" value={row.id} /><input type="hidden" name="kind" value={kind} /><button className="button small primary" type="submit">{conversionLabel(kind)}</button></form> : <span className="muted">처리 완료</span>}</> : null}
            {row.status === "cancelled" ? <span className="muted">처리 완료</span> : null}
            {!canWrite && row.status !== "posted" && row.status !== "cancelled" ? <span className="muted">읽기 전용</span> : null}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}

function StatusAction({ id, kind, status, label, danger = false }: { id: string; kind: DocumentKind; status: DocumentStatus; label: string; danger?: boolean }) {
  return <form action={transitionDocumentAction}><input type="hidden" name="documentId" value={id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="nextStatus" value={status} /><button className={`button small${danger ? " danger" : ""}`} type="submit">{label}</button></form>;
}
