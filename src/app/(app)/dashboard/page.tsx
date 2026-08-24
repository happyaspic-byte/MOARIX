import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, Boxes, LifeBuoy, ShoppingBag } from "lucide-react";
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
        description="매출·구매·재고·서비스의 핵심 흐름과 오늘 처리할 항목을 한 화면에서 확인하세요."
        actions={<><Link className="button" href="/inventory">재고 원장</Link>{hasPermission(session.role, "documents:write") ? <Link className="button primary" href="/documents/quote">견적 작성</Link> : null}</>}
      />

      <section className="metric-grid" aria-label="핵심 지표">
        <MetricCard label="이번 달 매출" value={formatMoney(metrics.monthSales)} helper="확정 매출 청구 기준" icon={BadgeDollarSign} />
        <MetricCard label="이번 달 매입" value={formatMoney(metrics.monthPurchases)} helper="확정 매입 청구 기준" icon={ShoppingBag} tone="blue" />
        <MetricCard label="재주문 필요" value={`${metrics.lowStockCount}개 품목`} helper="가용재고가 기준 이하" icon={Boxes} tone="amber" />
        <MetricCard label="진행 서비스" value={`${metrics.openCases}건`} helper="접수·처리·대기 상태" icon={LifeBuoy} tone="coral" />
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
            <Link className="attention-item" href="/assets"><div><strong>90일 내 지원 만료</strong><span>고객 안내·갱신 대상</span></div><span className="attention-number">{metrics.expiringAssets}</span></Link>
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
