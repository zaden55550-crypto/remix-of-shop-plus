// What a click opens (a product, a sale, a contact, a form) floats over the page it came from: a liquid glass panel only
// as tall as its content, with the page still visible behind it. Styles: the GLASS PAGES block in styles.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

export function GlassPage({ label, onClose, narrow, children }: { label: string; onClose: () => void; narrow?: boolean; children: ReactNode }) {
  // A direct <section> child of the app screen reads the same sizes and tokens as the page's content area.
  const [host] = useState(() => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".shop-app") ?? document.body));
  const overlay = useRef<HTMLElement>(null);
  const { tr } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // With one panel opened from another, Escape closes the top one only.
      const all = document.querySelectorAll(".glass-overlay");
      if (all[all.length - 1] === overlay.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <section
      ref={overlay}
      className="glass-overlay"
      // Portal clicks still bubble through React, and must not reach the row that opened this panel.
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) { onClose(); return; }
        // Cancel closes the window, after the screen's own Cancel has cleared its form (owner, 2026-11-27). A Cancel inside a
        // question opened over the form (a confirmation, a nested window) answers that question only.
        const btn = (e.target as Element).closest("button");
        if (!btn || btn.closest("[role=alertdialog], .glass-scrim, .glass-card")) return;
        const inner = btn.closest("[role=dialog]");
        if (inner && inner !== overlay.current?.firstElementChild) return;
        if (btn.hasAttribute("data-glass-close") || btn.textContent?.trim() === tr("Cancel")) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={label} className={cn("glass-page", narrow && "is-narrow")}>
        <div className="glass-page-body">{children}</div>
      </div>
    </section>,
    host,
  );
}
