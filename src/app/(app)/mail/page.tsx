import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth/current";
import { listOutboundMessages } from "@/lib/services/outbound-mail";
import { MailQueueForm } from "./mail-form";

export const metadata: Metadata = { title: "메일 큐" };
export const dynamic = "force-dynamic";

export default async function MailPage() {
  const session = await requirePermission("documents:read");
  const messages = await listOutboundMessages(session.companyId);
  return <>
    <PageHeader eyebrow="OUTBOUND MAIL" title="메일 발송 큐" description="실연동 전 발송 요청을 큐와 감사 로그에 남깁니다. 외부 SMTP는 공급자 계약 후 연결합니다." />
    <section className="card"><header className="card-header"><div><h2>발송 요청</h2></div></header><MailQueueForm /></section>
    <section className="card"><header className="card-header"><div><h2>큐 이력</h2></div></header>
      {messages.length === 0 ? <EmptyState title="큐가 비어 있습니다." /> : <table className="data-table"><thead><tr><th>시각</th><th>수신</th><th>제목</th><th>상태</th></tr></thead><tbody>{messages.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.to_address}</td><td>{row.subject}</td><td>{row.status}</td></tr>)}</tbody></table>}
    </section>
  </>;
}
