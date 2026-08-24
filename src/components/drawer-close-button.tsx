"use client";

import { X } from "lucide-react";

export function DrawerCloseButton() {
  return (
    <button
      className="drawer-close"
      type="button"
      aria-label="등록 패널 닫기"
      onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}
