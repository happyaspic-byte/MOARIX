import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Scale } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import type { MovementKind } from "@/lib/domain/inventory";
import { hasPermission } from "@/lib/security/permissions";
import { listInventory } from "@/lib/services/inventory-service";
import { listItems, listWarehouses } from "@/lib/services/master-data";
import { InventoryForm } from "./inventory-form";

export const metadata: Metadata = { title: "재고·원장" };
export const dynamic = "force-dynamic";

const movementLabels: Record<MovementKind, string> = {
  receipt: "입고",
  issue: "출고",
  adjustment: "조정",
  transfer_in: "이동 입고",
  transfer_out: "이동 출고",
  reservation: "예약",
  release: "예약 해제",
  reversal: "역분개",
};

export default async function InventoryPage() {
  const session = await requirePermission("inventory:read");
  const [{ balances, movements }, items, warehouses] = await Promise.all([
    listInventory(session.companyId), listItems(session.companyId), listWarehouses(session.companyId),
  ]);
  const totalOnHand = balances.reduce((sum, row) => sum + Number(row.on_hand), 0);
  const lowStock = balances.filter((row) => Number(row.available) <= Number(row.reorder_point)).length;

  return <>
    <PageHeader eyebrow="INVENTORY LEDGER" title="재고·원장" description="모든 재고 변동을 불변 원장에 기록하고 창고별 가용 수량을 실시간으로 확인합니다." actions={hasPermission(session.role, "inventory:write") ?
      <details className="create-panel"><summary className="button primary"><Plus size={17} />재고 변동</summary><div className="create-drawer"><div className="drawer-head"><div><h2>재고 변동 등록</h2><p>중복 요청은 자동 차단되며 출고 후 재고가 음수가 되면 저장되지 않습니다.</p></div><DrawerCloseButton /></div><InventoryForm items={items} warehouses={warehouses} idempotencyKey={randomUUID()} /></div></details>
    : undefined} />
    <section className="metric-grid" aria-label="재고 요약">
      <div className="metric-card"><span className="metric-icon teal"><Scale size={20} /></span><div><p>총 현재고</p><strong>{totalOnHand.toLocaleString("ko-KR")}</strong><span>모든 창고 합계</span></div></div>
      <div className="metric-card"><span className="metric-icon amber"><ArrowUpFromLine size={20} /></span><div><p>재주문 필요</p><strong>{lowStock}개</strong><span>가용 수량이 기준 이하</span></div></div>
      <div className="metric-card"><span className="metric-icon blue"><ArrowDownToLine size={20} /></span><div><p>최근 변동</p><strong>{movements.length}건</strong><span>최대 100건 표시</span></div></div>
    </section>
    <section className="section-grid">
      <article className="card span-12"><header className="card-header"><div><h2>창고별 재고</h2><p>{balances.length}개 재고 위치</p></div></header>{balances.length === 0 ? <EmptyState title="등록된 재고가 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>창고</th><th>품목</th><th className="numeric">현재고</th><th className="numeric">예약</th><th className="numeric">가용</th><th className="numeric">재주문점</th><th>상태</th></tr></thead><tbody>{balances.map((row) => { const low = Number(row.available) <= Number(row.reorder_point); return <tr key={`${row.warehouse_id}-${row.item_id}`}><td><strong>{row.warehouse_name}</strong></td><td><div className="table-title"><strong>{row.item_name}</strong><small>{row.sku}</small></div></td><td className="numeric">{row.on_hand}</td><td className="numeric">{row.reserved}</td><td className="numeric"><strong>{row.available}</strong></td><td className="numeric">{row.reorder_point}</td><td><span className={`status-badge ${low ? "status-critical" : "status-active"}`}>{low ? "보충 필요" : "정상"}</span></td></tr>; })}</tbody></table></div>}</article>
      <article className="card span-12"><header className="card-header"><div><h2>재고 변동 원장</h2><p>추가 전용 감사 원장 · 최근 100건</p></div></header>{movements.length === 0 ? <EmptyState title="재고 변동 기록이 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>일시</th><th>유형</th><th>창고</th><th>품목</th><th>참조</th><th>사유</th><th>등록자</th><th className="numeric">수량</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.occurred_at))}</td><td>{movementLabels[row.movement_type]}</td><td>{row.warehouse_name}</td><td><div className="table-title"><strong>{row.item_name}</strong><small>{row.sku}</small></div></td><td>{row.reference_number ?? "—"}</td><td>{row.reason ?? "—"}</td><td>{row.created_by_name}</td><td className="numeric"><strong>{formatMoney(row.quantity, "")}</strong></td></tr>)}</tbody></table></div>}</article>
    </section>
  </>;
}
