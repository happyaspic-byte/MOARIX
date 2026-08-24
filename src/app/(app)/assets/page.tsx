import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { listAssetsAndCases } from "@/lib/services/assets-service";
import { listCounterparties } from "@/lib/services/master-data";
import { AssetForm } from "./asset-form";

export const metadata: Metadata = { title: "고객 자산" };
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const session = await requirePermission("assets:read");
  const [{ assets }, counterparties] = await Promise.all([listAssetsAndCases(session.companyId), listCounterparties(session.companyId)]);
  return <>
    <PageHeader eyebrow="CUSTOMER ASSETS" title="고객 자산" description="고객사에 설치된 장비의 일련번호, 보증과 지원 만료일을 추적합니다." actions={hasPermission(session.role, "assets:write") ? <details className="create-panel"><summary className="button primary"><Plus size={17} />자산 등록</summary><div className="create-drawer"><div className="drawer-head"><div><h2>고객 자산 등록</h2><p>서비스 이력과 계약 갱신에 사용할 설치 자산입니다.</p></div><DrawerCloseButton /></div><AssetForm counterparties={counterparties} /></div></details> : undefined} />
    <section className="card"><header className="card-header"><div><h2>설치 자산</h2><p>총 {assets.length}개 · 지원 만료일 순</p></div></header>{assets.length === 0 ? <EmptyState title="등록된 고객 자산이 없습니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>자산 태그·제품</th><th>고객사</th><th>일련번호</th><th>설치 위치</th><th>설치일</th><th>보증 만료</th><th>지원 만료</th><th>상태</th></tr></thead><tbody>{assets.map((row) => <tr key={row.id}><td><div className="table-title"><strong>{row.product_name}</strong><small>{row.asset_tag}</small></div></td><td>{row.counterparty_name}</td><td>{row.serial_number ?? "—"}</td><td>{row.site ?? "—"}</td><td>{row.installed_at ?? "—"}</td><td>{row.warranty_until ?? "—"}</td><td>{row.support_until ?? "—"}</td><td><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div>}</section>
  </>;
}
