import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileArchive, MessageSquareText, Paperclip, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { formatServiceCaseSla, getServiceCaseSlaHealth } from "@/lib/domain/service-case-sla";
import { allowedServiceCaseTransitions } from "@/lib/domain/service-case-state";
import { hasPermission } from "@/lib/security/permissions";
import { getServiceCaseDetail, type ServiceCaseActivityKind } from "@/lib/services/service-cases";
import { CaseActivityForm } from "../case-activity-form";
import { CaseAttachmentForm } from "../case-attachment-form";
import { CaseWatcherForm } from "../case-watcher-form";
import { ServiceTransitionForm } from "../service-transition-form";

export const metadata: Metadata = { title: "서비스 케이스 상세" };
export const dynamic = "force-dynamic";

const caseTypeLabels = {
  incident: "장애",
  request: "서비스 요청",
  question: "기술 문의",
  maintenance: "유지보수",
} as const;

const activityLabels: Record<ServiceCaseActivityKind, string> = {
  comment: "담당자 댓글",
  internal_note: "내부 작업 메모",
  vendor_reply: "지원사 회신",
  customer_reply: "고객 회신",
  status_change: "상태 변경",
  system: "시스템",
};

const watcherSourceLabels = {
  manual: "개별 수신자",
  customer: "고객",
  vendor: "지원사",
  distribution_list: "배포 목록",
} as const;

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function formatFileSize(value: string | null) {
  if (!value) return "크기 미등록";
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "크기 미등록";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default async function ServiceCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const session = await requirePermission("service:read");
  const { caseId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) notFound();
  const result = await getServiceCaseDetail(session.companyId, caseId);
  if (!result) notFound();
  const { detail, activities, attachments, watchers } = result;
  const canWrite = hasPermission(session.role, "service:write");
  const sla = getServiceCaseSlaHealth(detail.status, detail.due_at);
  const transitions = allowedServiceCaseTransitions(detail.status);

  return <>
    <PageHeader
      eyebrow={`SERVICE CASE · ${detail.number}`}
      title={detail.title}
      description={`${detail.counterparty_name} · ${caseTypeLabels[detail.case_type]} · ${detail.assigned_to_name ?? "담당자 미배정"}`}
      actions={<><Link className="button" href="/service"><ArrowLeft size={17} />업무 큐</Link>{detail.source_url ? <a className="button primary" href={detail.source_url} target="_blank" rel="noopener noreferrer">외부 원문 열기<ExternalLink size={16} /></a> : null}</>}
    />

    <section className="card case-summary-card" aria-label="케이스 요약">
      <div className="case-summary-badges"><StatusBadge status={detail.status} /><StatusBadge status={detail.severity} /><StatusBadge status={sla.state} /></div>
      <dl className="case-facts">
        <div><dt>내부 번호</dt><dd>{detail.number}</dd></div>
        <div><dt>외부 번호</dt><dd>{detail.external_case_number ? `${detail.external_provider ?? "외부"} · ${detail.external_case_number}` : "—"}</dd></div>
        <div><dt>현재 / 최대 심각도</dt><dd><StatusBadge status={detail.severity} /> <span aria-hidden="true">/</span> <StatusBadge status={detail.max_severity} /></dd></div>
        <div><dt>SLA</dt><dd>{formatServiceCaseSla(sla)}</dd></div>
        <div><dt>접수</dt><dd>{formatDateTime(detail.opened_at, session.companyTimezone)}</dd></div>
        <div><dt>업데이트</dt><dd>{formatDateTime(detail.updated_at, session.companyTimezone)}</dd></div>
        <div><dt>처리 기한</dt><dd>{formatDateTime(detail.due_at, session.companyTimezone)}</dd></div>
        <div><dt>다음 조치</dt><dd>{formatDateTime(detail.next_action_at, session.companyTimezone)}</dd></div>
        <div><dt>해결</dt><dd>{formatDateTime(detail.resolved_at, session.companyTimezone)}</dd></div>
        <div><dt>종료</dt><dd>{formatDateTime(detail.closed_at, session.companyTimezone)}</dd></div>
      </dl>
    </section>

    <div className="section-grid case-detail-grid">
      <section className="card span-8">
        <header className="card-header"><div><h2>케이스 내용</h2><p>최초 문의와 장애 현상을 원문 줄바꿈 그대로 표시합니다.</p></div></header>
        <div className="card-body case-copy">{detail.description ? <p>{detail.description}</p> : <EmptyState title="등록된 상세 내용이 없습니다." />}{detail.waiting_reason ? <div className="case-callout warning"><strong>현재 대기 사유</strong><p>{detail.waiting_reason}</p></div> : null}{detail.resolution_summary ? <div className="case-callout success"><strong>해결 내용</strong><p>{detail.resolution_summary}</p></div> : null}</div>
      </section>

      <aside className="card span-4">
        <header className="card-header"><div><h2>Account Information</h2><p>고객·지원 권한·자산 연결 정보</p></div></header>
        <dl className="detail-list">
          <div><dt>Account</dt><dd><Link className="table-link" href={`/counterparties/${detail.counterparty_id}`}>{detail.counterparty_name}</Link></dd></div>
          <div><dt>Account 연락처</dt><dd>{detail.counterparty_email ?? detail.counterparty_phone ?? "—"}</dd></div>
          <div><dt>Contact</dt><dd>{detail.contact_name ?? "—"}{detail.contact_email ? <small>{detail.contact_email}</small> : null}{detail.contact_phone ? <small>{detail.contact_phone}</small> : null}</dd></div>
          <div><dt>Entitlement</dt><dd>{detail.entitlement ?? detail.support_level ?? "—"}</dd></div>
          <div><dt>Asset</dt><dd>{detail.asset_id ? <Link className="table-link" href={`/assets/${detail.asset_id}`}>{detail.vendor_asset_id ?? detail.asset_tag ?? "자산 상세"}</Link> : "—"}{detail.asset_tag && detail.vendor_asset_id ? <small>{detail.asset_tag}</small> : null}</dd></div>
          <div><dt>Product</dt><dd>{detail.product_name ?? "—"}{detail.product_model ? <small>{detail.product_model}</small> : null}{detail.software_version ? <small>버전 {detail.software_version}</small> : null}</dd></div>
          <div><dt>Site</dt><dd>{detail.site_id ? <Link className="table-link" href="/sites">{detail.site_name ?? "사업장 디렉터리"}</Link> : "—"}</dd></div>
          <div><dt>지원 계약</dt><dd>{detail.contract_number ?? "—"}{detail.support_provider ? <small>{detail.support_provider} · {detail.support_level ?? "등급 미등록"}</small> : null}</dd></div>
          <div><dt>외부 상태</dt><dd>{detail.external_state ?? "—"}</dd></div>
        </dl>
      </aside>
    </div>

    <section className="card case-section">
      <header className="card-header"><div><h2><UsersRound size={17} />Task Watch List</h2><p>{watchers.length}명 · 케이스 알림 수신자와 배포 목록</p></div>{canWrite ? <details className="case-entry-panel"><summary className="button">수신자 추가</summary><div className="case-entry-popover"><CaseWatcherForm caseId={detail.id} /></div></details> : null}</header>
      {watchers.length === 0 ? <div className="card-body"><EmptyState title="등록된 Watch List 수신자가 없습니다." description="케이스 업데이트를 공유할 고객·지원사 이메일을 등록하세요." /></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>수신자</th><th>이메일</th><th>구분</th><th>등록자·일시</th></tr></thead><tbody>{watchers.map((watcher) => <tr key={watcher.id}><td>{watcher.display_name ?? "—"}</td><td><a className="table-link" href={`mailto:${watcher.email}`}>{watcher.email}</a></td><td>{watcherSourceLabels[watcher.source]}</td><td><div className="table-title"><strong>{watcher.created_by_name}</strong><small>{formatDateTime(watcher.created_at, session.companyTimezone)}</small></div></td></tr>)}</tbody></table></div>}
    </section>

    <section className="card case-section">
      <header className="card-header"><div><h2><MessageSquareText size={17} />활동</h2><p>{activities.length}건 · 고객/지원사 회신과 내부 작업 이력</p></div>{canWrite ? <details className="case-entry-panel"><summary className="button primary">활동 기록</summary><div className="case-entry-popover"><CaseActivityForm caseId={detail.id} /></div></details> : null}</header>
      <div className="card-body">{activities.length === 0 ? <EmptyState title="기록된 활동이 없습니다." /> : <ol className="case-timeline">{activities.map((activity) => <li key={activity.id} className={`case-activity activity-${activity.kind}`}><div className="case-activity-head"><div><strong>{activity.author_name}</strong><span>{activityLabels[activity.kind]}{activity.visibility === "internal" ? " · 내부 전용" : ""}</span></div><time dateTime={activity.occurred_at}>{formatDateTime(activity.occurred_at, session.companyTimezone)}</time></div><p>{activity.body}</p><small>MOARIX 기록자: {activity.recorded_by_name}</small></li>)}</ol>}</div>
    </section>

    <section className="card case-section">
      <header className="card-header"><div><h2><Paperclip size={17} />첨부 자료</h2><p>{attachments.length}건 · 대용량 파일은 저장소 링크로 관리</p></div>{canWrite ? <details className="case-entry-panel"><summary className="button">첨부 링크 등록</summary><div className="case-entry-popover"><CaseAttachmentForm caseId={detail.id} /></div></details> : null}</header>
      <div className="card-body">{attachments.length === 0 ? <EmptyState title="등록된 첨부 자료가 없습니다." /> : <div className="attachment-list">{attachments.map((attachment) => <a key={attachment.id} className="attachment-item" href={attachment.source_url} target="_blank" rel="noopener noreferrer"><span className="attachment-icon"><FileArchive size={20} /></span><span><strong>{attachment.file_name}</strong><small>{attachment.content_type ?? "파일"} · {formatFileSize(attachment.size_bytes)} · {attachment.uploaded_by_name}</small>{attachment.description ? <small>{attachment.description}</small> : null}</span><span>{formatDateTime(attachment.occurred_at, session.companyTimezone)}<ExternalLink size={14} /></span></a>)}</div>}</div>
    </section>

    {canWrite && transitions.length > 0 ? <section className="card case-section"><header className="card-header"><div><h2>상태 처리</h2><p>상태 변경과 사유는 활동 타임라인과 감사 로그에 함께 기록됩니다.</p></div></header><div className="card-body case-action-grid">{transitions.map((nextStatus) => <ServiceTransitionForm key={nextStatus} caseId={detail.id} nextStatus={nextStatus} />)}</div></section> : null}
  </>;
}
