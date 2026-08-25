import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/current";
import { hasPermission } from "@/lib/security/permissions";
import { listCounterparties } from "@/lib/services/master-data";
import { listCustomerSites } from "@/lib/services/operations-service";
import { SiteForm } from "./site-form";

export const metadata: Metadata = { title: "고객 사업장" };
export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const session = await requirePermission("assets:read");
  const [sites, counterparties] = await Promise.all([listCustomerSites(session.companyId), listCounterparties(session.companyId)]);
  return <>
    <PageHeader eyebrow="CUSTOMER SITE DIRECTORY" title="고객 사업장" description="고객별 공장·센터·해외 현장을 표준화하여 자산, 점검과 장애 케이스를 같은 위치에 연결합니다." actions={hasPermission(session.role, "assets:write") ? <details className="create-panel"><summary className="button primary"><Plus size={17} />사업장 등록</summary><div className="create-drawer"><div className="drawer-head"><div><h2>고객 사업장 등록</h2><p>고객사 아래의 실제 설치·지원 위치입니다.</p></div><DrawerCloseButton /></div><SiteForm counterparties={counterparties} /></div></details> : undefined} />
    <section className="card"><header className="card-header"><div><h2>사업장 디렉터리</h2><p>총 {sites.length}개 · 고객사 순</p></div></header>{sites.length === 0 ? <EmptyState title="등록된 사업장이 없습니다." description="자산을 연결할 고객 사업장을 먼저 등록하세요." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>고객사·사업장</th><th>코드</th><th>주소</th><th>고객 담당자</th><th>시간대</th><th className="numeric">자산</th><th className="numeric">진행 케이스</th></tr></thead><tbody>{sites.map((site) => <tr key={site.id}><td><div className="table-title"><strong>{site.name}</strong><Link className="table-link" href={`/counterparties/${site.counterparty_id}`}><small>{site.counterparty_name}</small></Link></div></td><td>{site.code}</td><td>{site.address ?? "—"}</td><td><div className="table-title"><strong>{site.contact_name ?? "—"}</strong><small>{site.contact_phone ?? site.contact_email ?? "연락처 미등록"}</small></div></td><td>{site.timezone}</td><td className="numeric">{site.asset_count}</td><td className="numeric">{site.open_case_count}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
