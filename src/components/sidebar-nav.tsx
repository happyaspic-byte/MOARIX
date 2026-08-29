"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Boxes,
  Building2,
  CarFront,
  ChartNoAxesCombined,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Gauge,
  History,
  PackageOpen,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Store,
  MapPinned,
  Truck,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import { hasPermission, type Permission, type Role } from "@/lib/security/permissions";

const groups: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: typeof Gauge; permission: Permission }>;
}> = [
  {
    label: "업무 홈",
    items: [{ href: "/dashboard", label: "대시보드", icon: Gauge, permission: "dashboard:read" }],
  },
  {
    label: "기준정보",
    items: [
      { href: "/counterparties", label: "거래처", icon: Building2, permission: "master:read" },
      { href: "/items", label: "품목", icon: Boxes, permission: "master:read" },
      { href: "/warehouses", label: "창고", icon: Warehouse, permission: "master:read" },
    ],
  },
  {
    label: "영업·구매",
    items: [
      { href: "/documents/quote", label: "견적", icon: FileText, permission: "documents:read" },
      { href: "/documents/sales_order", label: "수주", icon: ShoppingCart, permission: "documents:read" },
      { href: "/documents/shipment", label: "출고", icon: Truck, permission: "documents:read" },
      { href: "/documents/purchase_order", label: "발주", icon: Truck, permission: "documents:read" },
      { href: "/documents/receipt", label: "입고", icon: PackageOpen, permission: "documents:read" },
      { href: "/documents/invoice", label: "매출 청구", icon: ReceiptText, permission: "documents:read" },
      { href: "/documents/bill", label: "매입 청구", icon: FileCheck2, permission: "documents:read" },
      { href: "/settlements", label: "미수·미지급", icon: ReceiptText, permission: "documents:read" },
      { href: "/mail", label: "메일 큐", icon: FileCheck2, permission: "documents:read" },
    ],
  },
  {
    label: "운영",
    items: [
      { href: "/inventory", label: "재고·원장", icon: PackageOpen, permission: "inventory:read" },
      { href: "/sites", label: "고객 사업장", icon: MapPinned, permission: "assets:read" },
      { href: "/assets", label: "자산·지원 계약", icon: Store, permission: "assets:read" },
      { href: "/inspections", label: "정기점검", icon: ClipboardCheck, permission: "service:read" },
      { href: "/trips", label: "운행일지", icon: CarFront, permission: "trips:read" },
      { href: "/service", label: "장애·지원", icon: Wrench, permission: "service:read" },
      { href: "/reports", label: "운영 보고서", icon: ChartNoAxesCombined, permission: "reports:read" },
    ],
  },
  {
    label: "관리",
    items: [
      { href: "/admin/users", label: "사용자·역할", icon: Users, permission: "users:read" },
      { href: "/admin/audit", label: "감사 로그", icon: History, permission: "audit:read" },
    ],
  },
];

export function SidebarNav({ companyName, role }: { companyName: string; role: Role }) {
  const pathname = usePathname();
  useEffect(() => {
    const closeDrawer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      target.closest(".drawer-close")?.closest("details")?.removeAttribute("open");
    };
    document.addEventListener("click", closeDrawer);
    return () => document.removeEventListener("click", closeDrawer);
  }, []);
  return (
    <aside className="sidebar">
      <Link className="sidebar-brand" href="/dashboard" aria-label="MOARIX 업무 홈">
        <span className="brand-mark">M</span>
        <span><strong>MOARIX</strong><small>Enterprise Operations</small></span>
      </Link>
      <div className="company-chip"><ShieldCheck size={16} aria-hidden="true" /><span>{companyName}</span></div>
      <nav aria-label="주 메뉴">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.filter((item) => hasPermission(role, item.permission)).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
              return (
                <Link className={active ? "active" : undefined} href={href} key={href} aria-current={active ? "page" : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <ClipboardList size={16} aria-hidden="true" />
        <span>모든 변경은 감사 기록에 남습니다.</span>
      </div>
    </aside>
  );
}
