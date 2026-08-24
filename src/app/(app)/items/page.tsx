import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import { listItems } from "@/lib/services/master-data";
import { ItemForm } from "./item-form";

export const metadata: Metadata = { title: "품목" };
export const dynamic = "force-dynamic";
const kindLabel = { product: "상품", material: "원재료", service: "서비스" };

export default async function ItemsPage() {
  const session = await requirePermission("master:read");
  const rows = await listItems(session.companyId);
  const createPanel = hasPermission(session.role, "master:write") ? (
    <details className="create-panel">
      <summary className="button primary"><Plus size={17} />품목 등록</summary>
      <div className="create-drawer"><div className="drawer-head"><div><h2>새 품목</h2><p>가격과 재고 추적 기준을 함께 등록합니다.</p></div><DrawerCloseButton /></div><ItemForm /></div>
    </details>
  ) : undefined;

  return <>
    <PageHeader eyebrow="MASTER DATA" title="품목" description="판매·구매·재고 문서에서 공통으로 사용하는 품목과 가격 정책을 관리합니다." actions={createPanel} />
    <section className="card"><header className="card-header"><div><h2>품목 목록</h2><p>총 {rows.length}개 품목</p></div></header>{rows.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>코드·품목</th><th>유형</th><th>단위</th><th>재고</th><th className="numeric">판매가</th><th className="numeric">구매가</th><th className="numeric">세율</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-title"><strong>{row.name}</strong><small>{row.sku}</small></div></td><td>{kindLabel[row.kind]}</td><td>{row.unit}</td><td>{row.track_inventory ? `추적 · 기준 ${row.reorder_point}` : "미추적"}</td><td className="numeric">{formatMoney(row.sale_price)}</td><td className="numeric">{formatMoney(row.purchase_price)}</td><td className="numeric">{row.tax_rate}%</td></tr>)}</tbody></table></div>}</section>
  </>;
}
