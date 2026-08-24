import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { documentKindLabels, type DocumentKind } from "@/lib/services/documents";
import { getStandardReports } from "@/lib/services/reports";

export const metadata: Metadata = { title: "표준·운영 보고서" };
export const dynamic = "force-dynamic";

const licenseRiskStates = ["expired", "expires_today", "renewal_30", "renewal_60", "renewal_90", "unknown"];
const dueStateLabels = { overdue: "기한 초과", due_today: "오늘 점검", due_30: "30일 내" } as const;

function vendorBandStatus(value: string) {
  return value === "unverified" ? "vendor_unverified" : value;
}

export default async function ReportsPage() {
  const session = await requirePermission("reports:read");
  const {
    documentSummary,
    counterpartySummary,
    stockValue,
    supportSummary,
    supportQueue,
    licenseSummary,
    licenseQueue,
    inspectionSummary,
    inspectionDueQueue,
  } = await getStandardReports(session.companyId);
  const stockTotal = stockValue.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  const supportRiskTotal = supportSummary
    .filter((row) => row.support_state !== "covered")
    .reduce((sum, row) => sum + Number(row.asset_count), 0);
  const licenseRiskTotal = licenseSummary
    .filter((row) => licenseRiskStates.includes(row.license_state))
    .reduce((sum, row) => sum + Number(row.license_count), 0);
  const expiredLicenseTotal = Number(licenseSummary.find((row) => row.license_state === "expired")?.license_count ?? 0);

  return <>
    <PageHeader
      eyebrow="FINANCE & STRATUS OPERATIONS REPORTS"
      title="표준·운영 보고서"
      description="재무·재고 실적과 고객 지원 의무, 벤더 백계약, 라이선스 만료 및 정기점검 이행 현황을 함께 조회합니다."
    />

    <section className="metric-grid" aria-label="보고서 요약">
      <div className="metric-card"><div><p>올해 업무 문서</p><strong>{documentSummary.reduce((sum, row) => sum + Number(row.document_count), 0).toLocaleString("ko-KR")}건</strong><span>모든 상태 포함</span></div></div>
      <div className="metric-card"><div><p>재고 추정 평가액</p><strong>{formatMoney(stockTotal)}</strong><span>가용 수량 × 구매 기준가</span></div></div>
      <div className="metric-card"><div><p>거래 실적 거래처</p><strong>{counterpartySummary.length}개</strong><span>올해 문서 기준</span></div></div>
      <div className="metric-card"><div><p>지원 확인 필요</p><strong>{supportRiskTotal}대</strong><span>고객·벤더 실효 지원 기준</span></div></div>
      <div className="metric-card"><div><p>라이선스 확인 필요</p><strong>{licenseRiskTotal}건</strong><span>만료 {expiredLicenseTotal} · 90일/미등록 포함</span></div></div>
      <div className="metric-card"><div><p>30일 내 점검</p><strong>{inspectionDueQueue.length}건</strong><span>기한 초과·오늘·30일 내</span></div></div>
    </section>

    <section className="section-grid">
      <article className="card span-6">
        <header className="card-header"><div><h2>문서 유형·상태별 집계</h2><p>올해 발행일 기준</p></div></header>
        {documentSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>문서</th><th>상태</th><th className="numeric">건수</th><th className="numeric">금액</th></tr></thead><tbody>{documentSummary.map((row) => <tr key={`${row.kind}-${row.status}`}><td><strong>{documentKindLabels[row.kind as DocumentKind] ?? row.kind}</strong></td><td><StatusBadge status={row.status} /></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.total_amount)}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-6">
        <header className="card-header"><div><h2>거래처별 실적</h2><p>확정 매출·매입 청구 기준</p></div></header>
        {counterpartySummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>거래처</th><th className="numeric">문서</th><th className="numeric">매출</th><th className="numeric">매입</th></tr></thead><tbody>{counterpartySummary.map((row) => <tr key={row.counterparty_name}><td><strong>{row.counterparty_name}</strong></td><td className="numeric">{row.document_count}</td><td className="numeric">{formatMoney(row.invoice_total)}</td><td className="numeric">{formatMoney(row.bill_total)}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-12">
        <header className="card-header"><div><h2>재고 평가</h2><p>가용 수량과 품목 구매 기준가로 산정한 참고 금액</p></div></header>
        {stockValue.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>창고</th><th>품목</th><th className="numeric">가용</th><th className="numeric">재주문점</th><th className="numeric">추정 평가액</th></tr></thead><tbody>{stockValue.map((row) => <tr key={`${row.warehouse_name}-${row.sku}`}><td>{row.warehouse_name}</td><td><div className="table-title"><strong>{row.item_name}</strong><small>{row.sku}</small></div></td><td className="numeric">{row.available}</td><td className="numeric">{row.reorder_point}</td><td className="numeric"><strong>{formatMoney(row.estimated_value)}</strong></td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-5">
        <header className="card-header"><div><h2>실효 지원 현황</h2><p>고객 의무와 벤더 백계약을 분리 계산</p></div></header>
        {supportSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>실효 지원 상태</th><th className="numeric">자산</th></tr></thead><tbody>{supportSummary.map((row) => <tr key={row.support_state}><td><StatusBadge status={row.support_state} /></td><td className="numeric"><strong>{row.asset_count}</strong></td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-7">
        <header className="card-header"><div><h2>올해 점검 현황</h2><p>예정일 기준 전체 상태별 집계</p></div></header>
        {inspectionSummary.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>점검 상태</th><th className="numeric">건수</th></tr></thead><tbody>{inspectionSummary.map((row) => <tr key={row.status}><td><StatusBadge status={row.status} /></td><td className="numeric"><strong>{row.inspection_count}</strong></td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-12">
        <header className="card-header"><div><h2>지원 갱신·공백 업무 큐</h2><p>고객/벤더 계약을 분리하고 D-90·60·30·0 중 더 이른 위험을 적용합니다.</p></div></header>
        {supportQueue.length === 0 ? <EmptyState title="지원 확인이 필요한 자산이 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Asset ID·제품</th><th>고객·사업장</th><th>실효 지원</th><th>고객 계약</th><th>벤더 계약</th><th>다음 점검</th></tr></thead><tbody>{supportQueue.map((row) => <tr key={row.asset_id}><td><div className="table-title"><Link className="table-link" href={`/assets/${row.asset_id}`}><strong>{row.vendor_asset_id ?? row.asset_tag}</strong></Link><small>{row.product_name} · 내부 {row.asset_tag}</small></div></td><td><div className="table-title"><strong>{row.customer_name}</strong><small>{row.site_name ?? "사업장 미지정"}</small></div></td><td><StatusBadge status={row.support_state} /></td><td><div className="table-title"><StatusBadge status={row.customer_band} /><small>{row.customer_support_until ?? "기한 미등록"}</small></div></td><td><div className="table-title"><StatusBadge status={vendorBandStatus(row.vendor_band)} /><small>{row.vendor_support_until ?? "계약 미확인"}</small></div></td><td>{row.next_inspection_date ?? "—"}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-5" id="license-expiry">
        <header className="card-header"><div><h2>라이선스 상태</h2><p>지원 계약 기한과 별도 집계</p></div></header>
        {licenseSummary.length === 0 ? <EmptyState title="등록된 라이선스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>라이선스 상태</th><th className="numeric">건수</th></tr></thead><tbody>{licenseSummary.map((row) => <tr key={row.license_state}><td><StatusBadge status={row.license_state} /></td><td className="numeric"><strong>{row.license_count}</strong></td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-7">
        <header className="card-header"><div><h2>30일 내 점검 큐</h2><p>기한 초과·오늘·30일 내 예정</p></div></header>
        {inspectionDueQueue.length === 0 ? <EmptyState title="30일 내 점검이 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>점검·자산</th><th>고객·사업장</th><th>상태</th><th>예정일</th></tr></thead><tbody>{inspectionDueQueue.map((row) => <tr key={row.id}><td><div className="table-title"><Link className="table-link" href={`/assets/${row.asset_id}?tab=inspections`}><strong>{row.number}</strong></Link><small>{row.asset_tag}</small></div></td><td><div className="table-title"><strong>{row.customer_name}</strong><small>{row.site_name}</small></div></td><td><div className="table-title"><StatusBadge status={row.status} /><small>{dueStateLabels[row.due_state]}</small></div></td><td>{row.scheduled_date}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="card span-12">
        <header className="card-header"><div><h2>라이선스 만료 업무 큐</h2><p>만료, D-90·60·30·0 및 기간 미등록 라이선스</p></div></header>
        {licenseQueue.length === 0 ? <EmptyState title="확인이 필요한 라이선스가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Asset ID·제품</th><th>라이선스</th><th>유형</th><th>만료 상태</th><th>만료일</th></tr></thead><tbody>{licenseQueue.map((row) => <tr key={row.license_id}><td><div className="table-title"><Link className="table-link" href={`/assets/${row.asset_id}?tab=contracts`}><strong>{row.vendor_asset_id ?? row.asset_tag}</strong></Link><small>{row.asset_product_name}</small></div></td><td><strong>{row.license_product_name}</strong></td><td><StatusBadge status={row.license_type} /></td><td><StatusBadge status={row.license_state} /></td><td>{row.expires_on ?? "미등록"}</td></tr>)}</tbody></table></div>}
      </article>
    </section>
  </>;
}
