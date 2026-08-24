import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { documentKindLabels, type DocumentKind } from "@/lib/services/documents";
import { getStandardReports } from "@/lib/services/reports";

export const metadata: Metadata = { title: "표준 보고서" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requirePermission("reports:read");
  const { documentSummary, counterpartySummary, stockValue } = await getStandardReports(session.companyId);
  const stockTotal = stockValue.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  return <>
    <PageHeader eyebrow="STANDARD REPORTS" title="표준 보고서" description="올해의 문서 실적, 거래처별 거래액과 현재 재고 평가액을 조회합니다. 금액은 업무 원장의 확정 상태를 기준으로 합니다." />
    <section className="metric-grid" aria-label="보고서 요약">
      <div className="metric-card"><div><p>올해 업무 문서</p><strong>{documentSummary.reduce((sum, row) => sum + Number(row.document_count), 0).toLocaleString("ko-KR")}건</strong><span>모든 상태 포함</span></div></div>
      <div className="metric-card"><div><p>재고 추정 평가액</p><strong>{formatMoney(stockTotal)}</strong><span>가용 수량 × 구매 기준가</span></div></div>
      <div className="metric-card"><div><p>거래 실적 거래처</p><strong>{counterpartySummary.length}개</strong><span>올해 문서 기준</span></div></div>
    </section>
    <section className="section-grid">
      <article className="card span-6"><header className="card-header"><div><h2>문서 유형·상태별 집계</h2><p>올해 발행일 기준</p></div></header>{documentSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>문서</th><th>상태</th><th className="numeric">건수</th><th className="numeric">금액</th></tr></thead><tbody>{documentSummary.map((row) => <tr key={`${row.kind}-${row.status}`}><td><strong>{documentKindLabels[row.kind as DocumentKind] ?? row.kind}</strong></td><td><StatusBadge status={row.status} /></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.total_amount)}</td></tr>)}</tbody></table></div>}</article>
      <article className="card span-6"><header className="card-header"><div><h2>거래처별 실적</h2><p>확정 매출·매입 청구 기준</p></div></header>{counterpartySummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>거래처</th><th className="numeric">문서</th><th className="numeric">매출</th><th className="numeric">매입</th></tr></thead><tbody>{counterpartySummary.map((row) => <tr key={row.counterparty_name}><td><strong>{row.counterparty_name}</strong></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.invoice_total)}</td><td className="numeric">{formatMoney(row.bill_total)}</td></tr>)}</tbody></table></div>}</article>
      <article className="card span-12"><header className="card-header"><div><h2>재고 평가</h2><p>가용 수량과 품목 구매 기준가로 산정한 참고 금액</p></div></header>{stockValue.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>창고</th><th>품목</th><th className="numeric">가용</th><th className="numeric">재주문점</th><th className="numeric">추정 평가액</th></tr></thead><tbody>{stockValue.map((row) => <tr key={`${row.warehouse_name}-${row.sku}`}><td>{row.warehouse_name}</td><td><div className="table-title"><strong>{row.item_name}</strong><small>{row.sku}</small></div></td><td className="numeric">{row.available}</td><td className="numeric">{row.reorder_point}</td><td className="numeric"><strong>{formatMoney(row.estimated_value)}</strong></td></tr>)}</tbody></table></div>}</article>
    </section>
  </>;
}
