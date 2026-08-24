import { Bell, ChevronDown } from "lucide-react";
import { logoutAction } from "@/app/(app)/logout-action";

export function AppTopbar({ userName, role }: { userName: string; role: string }) {
  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="health-dot" />
        운영 상태 정상
      </div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="알림"><Bell size={18} /></button>
        <details className="user-menu">
          <summary>
            <span className="avatar">{userName.slice(0, 1)}</span>
            <span><strong>{userName}</strong><small>{role}</small></span>
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div>
            <form action={logoutAction}><button type="submit">로그아웃</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
