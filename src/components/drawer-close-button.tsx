"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function DrawerCloseButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const details = button?.closest("details");
    const panel = button?.closest<HTMLElement>(".create-drawer, .case-entry-popover");
    const summary = details?.querySelector<HTMLElement>(":scope > summary");
    if (!button || !details || !panel) return;

    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", panel.querySelector("h2")?.textContent?.trim() || "작업 패널");

    const focusableElements = () => [...panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    const close = () => {
      details.removeAttribute("open");
      summary?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!details.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    let wasOpen = details.open;
    const observer = new MutationObserver(() => {
      const isOpen = details.open;
      if (isOpen && !wasOpen) queueMicrotask(() => button.focus());
      if (!isOpen && wasOpen && details.isConnected) summary?.focus();
      wasOpen = isOpen;
    });
    observer.observe(details, { attributes: true, attributeFilter: ["open"] });
    details.addEventListener("keydown", handleKeyDown);
    if (details.open) queueMicrotask(() => button.focus());
    return () => {
      observer.disconnect();
      details.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function closePanel() {
    const details = buttonRef.current?.closest("details");
    details?.removeAttribute("open");
    details?.querySelector<HTMLElement>(":scope > summary")?.focus();
  }

  return (
    <button
      ref={buttonRef}
      className="drawer-close"
      type="button"
      aria-label="작업 패널 닫기"
      onClick={closePanel}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}
