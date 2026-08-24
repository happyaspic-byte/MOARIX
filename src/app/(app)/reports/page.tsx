import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { documentKindLabels, type DocumentKind } from "@/lib/services/documents";
import { getStandardReports } from "@/lib/services/reports";

export const metadata: Metadata = { title: "표준·운영 보고서" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requirePermission("reports:read");
  const { documentSummary, counterpartySummary, stockValue, supportSummary, supportQueue, inspectionSummary } = await getStandardReports(session.companyId);
  const stockTotal = stockValue.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  const supportRiskTotal = supportSummary.filter((row) => row.support_state !== "covered").reduce((sum, row) => sum + Number(row.asset_count), 0);
  const activeInspectionTotal = inspectionSummary.filter((row) => ["scheduled", "in_progress", "issue_found"].includes(row.status)).reduce((sum, row) => sum + Number(row.inspection_count), 0);
  return <>
    <PageHeader eyebrow="FINANCE & OPERATIONS REPORTS" title="표준·운영 보고서" description="재무·재고 실적과 함께 지원 계약 위험, 갱신 대상과 정기점검 이행 현황을 조회합니다." />
    <section className="metric-grid" aria-label="보고서 요약">
      <div className="metric-card"><div><p>올해 업무 문서</p><strong>{documentSummary.reduce((sum, row) => sum + Number(row.document_count), 0).toLocaleString("ko-KR")}건</strong><span>모든 상태 포함</span></div></div>
      <div className="metric-card"><div><p>재고 추정 평가액</p><strong>{formatMoney(stockTotal)}</strong><span>가용 수량 × 구매 기준가</span></div></div>
      <div className="metric-card"><div><p>거래 실적 거래처</p><strong>{counterpartySummary.length}개</strong><span>올해 문서 기준</span></div></div>
      <div className="metric-card"><div><p>지원 확인 필요</p><strong>{supportRiskTotal}대</strong><span>만료·90일·미계약·미등록</span></div></div>
      <div className="metric-card"><div><p>진행 점검</p><strong>{activeInspectionTotal}건</strong><span>예정·진행·조치 필요</span></div></div>
    </section>
    <section className="section-grid">
      <article className="card span-6"><header className="card-header"><div><h2>문서 유형·상태별 집계</h2><p>올해 발행일 기준</p></div></header>{documentSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>문서</th><th>상태</th><th className="numeric">건수</th><th className="numeric">금액</th></tr></thead><tbody>{documentSummary.map((row) => <tr key={`${row.kind}-${row.status}`}><td><strong>{documentKindLabels[row.kind as DocumentKind] ?? row.kind}</strong></td><td><StatusBadge status={row.status} /></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.total_amount)}</td></tr>)}</tbody></table></div>}</article>
      <article className="card span-6"><header className="card-header"><div><h2>거래처별 실적</h2><p>확정 매출·매입 청구 기준</p></div></header>{counterpartySummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>거래처</th><th className="numeric">문서</th><th className="numeric">매출</th><th className="numeric">매입</th></tr></thead><tbody>{counterpartySummary.map((row) => <tr key={row.counterparty_name}><td><strong>{row.counterparty_name}</strong></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.invoice_total)}</td><td className="numeric">{formatMoney(row.bill_total)}</td></tr>)}</tbody></table></div>}</article>
      <article className="card span-12"><header className="card-header"><div><h2>재고 평가</h2><p>가용 수량과 품목 구매 기준가로 산정한 참고 금액</p></div></header>{stockValue.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>창고</th><th>품목</th><th className="numeric">가용</th><th className="numeric">재주문점</th><th className="numeric">추정 평가액</th></tr></thead><tbody>{stockValue.map((row) => <tr key={`${row.warehouse_name}-${row.sku}`}><td>{row.warehouse_name}</td><td><div className="table-title"><strong>{row.item_name}</strong><small>{row.sku}</small></div></td><td className="numeric">{row.available}</td><td className="numeric">{row.reorder_point}</td><td className="numeric"><strong>{formatMoney(row.estimated_value)}</strong></td></tr>)}</tbody></table></div>}</article>
      <article className="card span-5"><header className="card-header"><div><h2>지원 계약 적용 현황</h2><p>퇴역 자산 제외</p></div></header>{supportSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>지원 상태</th><th className="numeric">자산</th></tr></thead><tbody>{supportSummary.map((row) => <tr key={row.support_state}><td><StatusBadge status={row.support_state} /></td><td className="numeric"><strong>{row.asset_count}</strong></td></tr>)}</tbody></table></div>}</article>
      <article className="card span-7"><header className="card-header"><div><h2>올해 점검 현황</h2><p>예정일 기준 상태별 집계</p></div></header>{inspectionSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>점검 상태</th><th className="numeric">건수</th></tr></thead><tbody>{inspectionSummary.map((row) => <tr key={row.status}><td><StatusBadge status={row.status} /></td><td className="numeric"><strong>{row.inspection_count}</strong></td></tr>)}</tbody></table></div>}</article>
      <article className="card span-12"><header className="card-header"><div><h2>지원 갱신·공백 업무 큐</h2><p>만료, 미계약, 90일 내 만료와 만료일 미등록 자산</p></div></header>{supportQueue.length === 0 ? <EmptyState title="지원 확인이 필요한 자산이 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Asset ID·제품</th><th>고객·사업장</th><th>지원 상태</th><th>지원 만료</th><th>다음 점검</th></tr></thead><tbody>{supportQueue.map((row) => <tr key={row.asset_tag}><td><div className="table-title"><strong>{row.vendor_asset_id ?? row.asset_tag}</strong><small>{row.product_name}</small></div></td><td><div className="table-title"><strong>{row.customer_name}</strong><small>{row.site_name ?? "사업장 미지정"}</small></div></td><td><StatusBadge status={row.support_state} /></td><td>{row.support_until ?? "미등록"}</td><td>{row.next_inspection_date ?? "—"}</td></tr>)}</tbody></table></div>}</article>
    </section>
  </>;
}
