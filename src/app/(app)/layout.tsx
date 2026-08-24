import { AppTopbar } from "@/components/app-topbar";
import { SidebarNav } from "@/components/sidebar-nav";
import { requireSession } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="app-shell">
      <SidebarNav companyName={session.companyName} role={session.role} />
      <div className="app-main">
        <AppTopbar userName={session.userName} role={session.role} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
