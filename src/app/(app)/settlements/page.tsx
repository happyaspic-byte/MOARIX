import type { Metadata } from "next";
import Decimal from "decimal.js";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { dateInTimeZone } from "@/lib/domain/company-date";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { listCounterparties } from "@/lib/services/master-data";
import { listOpenDocuments, listSettlements } from "@/lib/services/settlements";
import { SettlementForm } from "./settlement-form";

export const metadata: Metadata = { title: "미수·미지급" };
export const dynamic = "force-dynamic";

const agingLabels = { current: "만기 전", "1_30": "1–30일", "31_60": "31–60일", "61_90": "61–90일", over_90: "90일+" } as const;
const sumOpenAmounts = (rows: Array<{ open_amount: string }>) => rows.reduce((sum, row) => sum.plus(row.open_amount), new Decimal(0));

export default async function SettlementsPage() {
  const session = await requirePermission("documents:read");
  const [invoices, bills, settlements, counterparties] = await Promise.all([
    listOpenDocuments(session.companyId, "invoice", session.companyTimezone),
    listOpenDocuments(session.companyId, "bill", session.companyTimezone),
    listSettlements(session.companyId),
    listCounterparties(session.companyId),
  ]);
  const canWrite = hasPermission(session.role, "documents:write");
  const today = dateInTimeZone(session.companyTimezone);

  return <>
    <PageHeader eyebrow="AR / AP LEDGER" title="미수·미지급" description="확정된 매출·매입 청구에 입출금을 FIFO로 배부하고 에이징을 추적합니다." actions={canWrite ? <details className="create-panel"><summary className="button primary"><Plus size={17} />입출금 배부</summary><div className="create-drawer"><div className="drawer-head"><div><h2>입출금 배부</h2><p>선택한 미결 문서에 금액을 만기순으로 배부합니다. 초과 배부는 거부됩니다.</p></div><DrawerCloseButton /></div><SettlementForm counterparties={counterparties} invoices={invoices} bills={bills} today={today} /></div></details> : undefined} />
    <div className="metric-grid">
      <article className="metric-card"><span>미수</span><strong>{formatMoney(sumOpenAmounts(invoices), "KRW")}</strong></article>
      <article className="metric-card"><span>미지급</span><strong>{formatMoney(sumOpenAmounts(bills), "KRW")}</strong></article>
      <article className="metric-card"><span>배부 이력</span><strong>{settlements.length}</strong></article>
    </div>
    <section className="card"><header className="card-header"><div><h2>미결 에이징</h2></div></header>
      {invoices.concat(bills).length === 0 ? <EmptyState title="미결 문서 없음" description="확정된 청구가 모두 배부되었거나 아직 없습니다." /> : <table className="data-table"><thead><tr><th>구분</th><th>번호</th><th>거래처</th><th>만기</th><th>미결</th><th>에이징</th></tr></thead><tbody>{[...invoices, ...bills].map((row) => <tr key={row.id}><td>{row.kind === "invoice" ? "미수" : "미지급"}</td><td>{row.number}</td><td>{row.counterparty_name}</td><td>{row.due_date ?? "—"}</td><td>{formatMoney(row.open_amount, "KRW")}</td><td>{agingLabels[row.aging]}</td></tr>)}</tbody></table>}
    </section>
    <section className="card"><header className="card-header"><div><h2>입출금 원장</h2></div></header>
      {settlements.length === 0 ? <EmptyState title="배부 이력 없음" /> : <table className="data-table"><thead><tr><th>일자</th><th>구분</th><th>거래처</th><th>금액</th><th>방법</th><th>작성</th></tr></thead><tbody>{settlements.map((row) => <tr key={row.id}><td>{row.settled_on}</td><td>{row.direction === "receipt" ? "입금" : "지급"}</td><td>{row.counterparty_name}</td><td>{formatMoney(row.amount, "KRW")}</td><td>{row.method}</td><td>{row.created_by_name}</td></tr>)}</tbody></table>}
    </section>
  </>;
}
