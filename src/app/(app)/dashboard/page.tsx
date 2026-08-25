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
  const renewalAssets = metrics.renewal90Assets + metrics.renewal60Assets + metrics.renewal30Assets + metrics.expiresTodayAssets;
  const customerGapAssets = metrics.customerExpiredAssets + metrics.customerUncontractedAssets;
  const licenseRisk = metrics.expiringLicenses + metrics.expiredLicenses;

  return (
    <>
      <PageHeader
        eyebrow="OPERATION OVERVIEW"
        title={`${session.userName}님, 업무 현황입니다.`}
        description="매출·재고와 함께 고객 지원 의무, 벤더 백계약, 라이선스 만료, 정기점검과 장애 업무를 한 화면에서 확인하세요."
        actions={<><Link className="button" href="/inventory">재고 원장</Link>{hasPermission(session.role, "documents:write") ? <Link className="button primary" href="/documents/quote">견적 작성</Link> : null}</>}
      />

      <section className="metric-grid" aria-label="핵심 지표">
        <MetricCard label="이번 달 매출" value={formatMoney(metrics.monthSales)} helper="확정 매출 청구 기준" icon={BadgeDollarSign} />
        <MetricCard label="이번 달 매입" value={formatMoney(metrics.monthPurchases)} helper="확정 매입 청구 기준" icon={ShoppingBag} tone="blue" />
        <MetricCard label="재주문 필요" value={`${metrics.lowStockCount}개 품목`} helper="가용재고가 기준 이하" icon={Boxes} tone="amber" />
        <MetricCard label="진행 서비스" value={`${metrics.openCases}건`} helper="접수·처리·대기 상태" icon={LifeBuoy} tone="coral" />
        <MetricCard label="30일 내 점검" value={`${metrics.dueInspections}건`} helper="예정·진행·조치 필요" icon={CalendarCheck2} tone="blue" />
        <MetricCard label="지원 갱신 구간" value={`${renewalAssets}대`} helper={`D90 ${metrics.renewal90Assets} · D60 ${metrics.renewal60Assets} · D30 ${metrics.renewal30Assets} · D0 ${metrics.expiresTodayAssets}`} icon={ClockAlert} tone="amber" />
        <MetricCard label="고객 지원 공백" value={`${customerGapAssets}대`} helper={`만료 ${metrics.customerExpiredAssets} · 미계약 ${metrics.customerUncontractedAssets}`} icon={CircleOff} tone="coral" />
        <MetricCard label="벤더 지원 공백" value={`${metrics.vendorGapAssets}대`} helper={`계약 미확인 ${metrics.vendorUnverifiedAssets}대`} icon={AlertTriangle} tone="coral" />
        <MetricCard label="라이선스 만료 위험" value={`${licenseRisk}건`} helper={`90일 내 ${metrics.expiringLicenses} · 만료 ${metrics.expiredLicenses}`} icon={ClockAlert} tone="amber" />
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
            <Link className="attention-item" href="/assets?support=expiring"><div><strong>지원 갱신 D-90 / 60 / 30 / 0</strong><span>고객·벤더 중 먼저 도래하는 실효 기한</span></div><span className="attention-number">{metrics.renewal90Assets}/{metrics.renewal60Assets}/{metrics.renewal30Assets}/{metrics.expiresTodayAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=expired"><div><strong>고객 지원 만료</strong><span>고객 제공 의무와 서비스 범위 확인</span></div><span className="attention-number">{metrics.customerExpiredAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=not_contracted"><div><strong>고객 미계약</strong><span>활성 자산의 고객 지원 계약 없음</span></div><span className="attention-number">{metrics.customerUncontractedAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=vendor_gap"><div><strong>벤더 지원 공백</strong><span>고객 의무를 뒷받침할 벤더 계약 없음</span></div><span className="attention-number">{metrics.vendorGapAssets}</span></Link>
            <Link className="attention-item" href="/assets?support=vendor_unverified"><div><strong>벤더 계약 미확인</strong><span>현재 벤더 계약 정보를 등록하세요</span></div><span className="attention-number">{metrics.vendorUnverifiedAssets}</span></Link>
            <Link className="attention-item" href="/reports#license-expiry"><div><strong>라이선스 만료 위험</strong><span>90일 내 만료·이미 만료된 라이선스</span></div><span className="attention-number">{licenseRisk}</span></Link>
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
