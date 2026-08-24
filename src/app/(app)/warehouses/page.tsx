import type { Metadata } from "next";
import { MapPin, Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { listWarehouses } from "@/lib/services/master-data";
import { WarehouseForm } from "./warehouse-form";

export const metadata: Metadata = { title: "창고" };
export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  const session = await requirePermission("master:read");
  const rows = await listWarehouses(session.companyId);
  const createPanel = hasPermission(session.role, "master:write") ? (
    <details className="create-panel">
      <summary className="button primary"><Plus size={17} />창고 등록</summary>
      <div className="create-drawer"><div className="drawer-head"><div><h2>새 창고</h2><p>재고를 보관하고 이동할 기준 위치입니다.</p></div><DrawerCloseButton /></div><WarehouseForm /></div>
    </details>
  ) : undefined;

  return <>
    <PageHeader eyebrow="MASTER DATA" title="창고" description="입고·출고·이동의 기준이 되는 창고와 현장 위치를 관리합니다." actions={createPanel} />
    <section className="card"><header className="card-header"><div><h2>창고 목록</h2><p>총 {rows.length}개</p></div></header>{rows.length === 0 ? <EmptyState /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>코드</th><th>창고명</th><th>위치</th><th>상태</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.code}</strong></td><td>{row.name}</td><td>{row.location ? <span><MapPin size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />{row.location}</span> : "—"}</td><td>{row.is_active ? "사용 중" : "중지"}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
