import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, Boxes, CalendarCheck2, CircleOff, ClockAlert, LifeBuoy, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { documentKindLabels, type DocumentKind } from "@/lib/services/documents";
import { getDashboard } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "대시보드" };
export const dynamic = "force-dynamic";

function shortDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}

export default async function DashboardPage() {
  const session = await requirePermission("dashboard:read");
  const { metrics, activities, documents } = await getDashboard(session.companyId);

  return (
    <>
      <PageHeader
        eyebrow="OPERATION OVERVIEW"
        title={`${session.userName}님, 업무 현황입니다.`}
        description="매출·재고와 함께 Stratus 자산의 지원 만료, 미계약, 정기점검과 장애 업무를 한 화면에서 확인하세요."
        actions={<><Link className="button" href="/inventory">재고 원장</Link>{hasPermission(session.role, "documents:write") ? <Link className="button primary" href="/documents/quote">견적 작성</Link> : null}</>}
      />

      <section className="metric-grid" aria-label="핵심 지표">
        <MetricCard label="이번 달 매출" value={formatMoney(metrics.monthSales)} helper="확정 매출 청구 기준" icon={BadgeDollarSign} />
        <MetricCard label="이번 달 매입" value={formatMoney(metrics.monthPurchases)} helper="확정 매입 청구 기준" icon={ShoppingBag} tone="blue" />
        <MetricCard label="재주문 필요" value={`${metrics.lowStockCount}개 품목`} helper="가용재고가 기준 이하" icon={Boxes} tone="amber" />
        <MetricCard label="진행 서비스" value={`${metrics.openCases}건`} helper="접수·처리·대기 상태" icon={LifeBuoy} tone="coral" />
        <MetricCard label="30일 내 점검" value={`${metrics.dueInspections}건`} helper="예정·진행·조치 필요" icon={CalendarCheck2} tone="blue" />
        <MetricCard label="90일 내 지원 만료" value={`${metrics.expiringAssets}대`} helper="고객 안내·갱신 대상" icon={ClockAlert} tone="amber" />
        <MetricCard label="지원 만료" value={`${metrics.expiredAssets}대`} helper="즉시 계약 확인 필요" icon={AlertTriangle} tone="coral" />
        <MetricCard label="미계약 자산" value={`${metrics.uncontractedAssets}대`} helper="활성 자산 중 지원 공백" icon={CircleOff} tone="coral" />
      </section>

      <section className="section-grid">
        <article className="card span-8">
          <header className="card-header"><div><h2>최근 업무 문서</h2><p>최근 작성된 견적·수주·발주·청구</p></div><Link className="button small" href="/documents/quote">전체 보기</Link></header>
          {documents.length === 0 ? <EmptyState /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>문서</th><th>거래처</th><th>발행일</th><th>상태</th><th className="numeric">합계</th></tr></thead>
                <tbody>{documents.map((document) => (
                  <tr key={document.id}>
                    <td><div className="table-title"><strong>{document.number}</strong><small>{documentKindLabels[document.kind as DocumentKind] ?? document.kind}</small></div></td>
                    <td>{document.counterparty_name}</td><td>{document.issue_date}</td><td><StatusBadge status={document.status} /></td>
                    <td className="numeric"><strong>{formatMoney(document.grand_total)}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </article>

        <article className="card span-4">
          <header className="card-header"><div><h2>오늘의 주의 항목</h2><p>즉시 확인이 필요한 운영 신호</p></div><AlertTriangle size={18} color="#a96700" /></header>
          <div className="card-body attention-list">
            <Link className="attention-item" href="/documents/quote"><div><strong>승인 대기 문서</strong><span>제출 후 승인되지 않은 문서</span></div><span className="attention-number">{metrics.pendingApprovals}</span></Link>
            <Link className="attention-item" href="/inventory"><div><strong>재주문 필요 품목</strong><span>안전 재고 이하</span></div><span className="attention-number">{metrics.lowStockCount}</span></Link>
            <Link className="attention-item" href="/assets?support=expiring"><div><strong>90일 내 지원 만료</strong><span>고객 안내·갱신 대상</span></div><span className="attention-number">{metrics.expiringAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=expired"><div><strong>지원 만료 자산</strong><span>서비스 범위 즉시 확인</span></div><span className="attention-number">{metrics.expiredAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=not_contracted"><div><strong>미계약 자산</strong><span>고객·벤더 계약 공백</span></div><span className="attention-number">{metrics.uncontractedAssets}</span></Link>
            <Link className="attention-item" href="/inspections?queue=due"><div><strong>30일 내 점검</strong><span>예정·진행·조치 필요</span></div><span className="attention-number">{metrics.dueInspections}</span></Link>
          </div>
        </article>

        <article className="card span-12">
          <header className="card-header"><div><h2>최근 변경 이력</h2><p>누가 어떤 업무 데이터를 변경했는지 추적합니다.</p></div>{hasPermission(session.role, "audit:read") ? <Link className="button small" href="/admin/audit">감사 로그</Link> : null}</header>
          <div className="card-body">
            {activities.length === 0 ? <EmptyState /> : <div className="activity-list">{activities.map((activity) => (
              <div className="activity-item" key={activity.id}><span className="activity-dot" /><div><strong>{activity.summary}</strong><p>{activity.actor_name ?? "시스템"} · {activity.action}</p></div><time dateTime={activity.created_at}>{shortDate(activity.created_at)}</time></div>
            ))}</div>}
          </div>
        </article>
      </section>
    </>
  );
}
