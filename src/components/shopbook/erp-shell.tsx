// Shared compact navy shell for Purchases, Sales, POS and all ERP apps.
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronLeft, CalendarDays, Search as SearchIcon } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { cn } from "@/lib/utils";

export type Tr = (t: string) => string;

export function ErpShell({
  title,
  shop,
  menus,
  menu,
  sub,
  onMenu,
  onSub,
  children,
  hideSub,
}: {
  title: string;
  shop: string;
  menus: Record<string, readonly string[]>;
  menu: string;
  sub: string;
  onMenu: (m: string) => void;
  onSub: (s: string) => void;
  children: ReactNode;
  deps?: unknown;
  hideSub?: boolean;
}) {
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const subs = menus[menu] ?? [];

  // 2-letter uppercase initials for the Shop Circle avatar
  const shopInitials = (shop || "SB")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main dir={dir} className="inventory-screen flex w-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        {/* UNIFIED SINGLE-ROW HEADER: < Apps | Online | APP NAME | 📅 | (SC) */}
        <div className="flex items-center justify-between gap-1 px-2 sm:px-3 py-1.5 min-w-0">
          {/* Left: < Apps button + Online badge */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ShopButton
              variant="bare"
              className="h-7 px-1.5 py-0 inline-flex items-center gap-0.5 text-xs font-bold rounded-lg border border-border/60 hover:bg-muted"
              aria-label={tr("Back to Apps")}
              onClick={() => nav({ to: "/apps" })}
            >
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              <span>{tr("Apps")}</span>
            </ShopButton>
            <div className="scale-90 origin-left shrink-0">
              <ConnectionStatus />
            </div>
          </div>

          {/* Center: APP NAME + Shop subtitle */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 mx-auto px-1">
            <h1 className="truncate text-xs font-black uppercase tracking-wider text-foreground">{tr(title)}</h1>
            <p className="truncate text-[9.5px] font-semibold text-muted-foreground leading-tight">{shop}</p>
          </div>

          {/* Right: Calendar Icon Only (📅) + Shop Circle Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Calendar Icon Only */}
            <div className="relative">
              <ShopButton
                variant="bare"
                className="h-7 w-7 rounded-full border border-border/60 flex items-center justify-center p-0 hover:bg-muted"
                aria-label={tr("Calendar")}
                onClick={() => setCalOpen(!calOpen)}
              >
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
              </ShopButton>

              {calOpen && (
                <div className="absolute end-0 top-8 z-30 w-36 rounded-xl border border-border bg-popover p-1 shadow-lg">
                  {["Today", "Yesterday", "Last 7 Days", "Last 30 Days"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setCalOpen(false)}
                      className="block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium hover:bg-muted"
                    >
                      {tr(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Shop Circle */}
            <div className="relative">
              <ShopButton
                variant="bare"
                className="h-7 w-7 rounded-full border border-border/60 bg-primary/10 flex items-center justify-center p-0 text-[10px] font-black text-primary hover:scale-105 transition-all shadow-xs"
                aria-label={tr("Shop Menu")}
                title={shop}
                onClick={() => setOpen(!open)}
              >
                {shopInitials}
              </ShopButton>

              {open && (
                <div className="absolute end-0 top-8 z-30 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg">
                  <div className="px-2.5 py-1.5 border-b border-border/60 mb-1">
                    <div className="text-xs font-bold truncate">{shop}</div>
                    <div className="text-[10px] text-muted-foreground">{tr("Retail Shop")}</div>
                  </div>
                  {Object.keys(menus).map((m) => (
                    <ShopButton
                      variant="bare"
                      key={m}
                      onClick={() => {
                        onMenu(m);
                        setOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium hover:bg-muted",
                        menu === m && "text-primary",
                      )}
                    >
                      {tr(m)}
                    </ShopButton>
                  ))}
                  <ShopButton
                    variant="bare"
                    onClick={() => {
                      setOpen(false);
                      nav({ to: "/settings" });
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    {tr("Settings")}
                  </ShopButton>
                  <ShopButton
                    variant="bare"
                    onClick={() => {
                      setOpen(false);
                      nav({ to: "/apps" });
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    {tr("Apps")}
                  </ShopButton>
                </div>
              )}
            </div>
          </div>
        </div>

        <BackupStatus />
        <Tabs items={Object.keys(menus)} value={menu} onChange={onMenu} tr={tr} />
        {!hideSub && subs.length > 0 && <Tabs small items={[...subs]} value={sub} onChange={onSub} tr={tr} />}
      </header>
      <section className="inventory-content flex-1">{children}</section>
    </main>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  tr,
  small,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  tr: Tr;
  small?: boolean;
}) {
  return (
    <div role="tablist" className={cn("inventory-tabs", small && "inventory-tabs-sub")}>
      {items.map((k) => (
        <ShopButton
          variant="bare"
          role="tab"
          aria-selected={value === k}
          key={k}
          onClick={() => onChange(k)}
          className="inventory-tab"
        >
          {tr(k)}
        </ShopButton>
      ))}
    </div>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-center text-[11px] text-muted-foreground">{children}</p>
);
export function Box({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: (() => void) | undefined;
  children: ReactNode;
}) {
  const { tr } = useLanguage();
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{title}</h2>
        {action && (
          <ShopButton variant="bare" className="inventory-view-all" onClick={action}>
            {tr("View All")} ›
          </ShopButton>
        )}
      </div>
      {children}
    </div>
  );
}
export type Tone = "ok" | "warn" | "bad" | "info";
export const toneOf = (s: string): Tone =>
  s === "Paid" || s === "Completed"
    ? "ok"
    : s === "P.PAY" || s === "Pending" || s === "Draft" || s === "Due"
      ? "warn"
      : s === "Credit"
        ? "info"
        : "bad";
export function Badge({ s }: { s: string }) {
  const { tr } = useLanguage();
  return <span className={cn("pur-badge", `pur-badge-${toneOf(s)}`)}>{s === "P.PAY" ? "P.PAY" : tr(s)}</span>;
}
export const Dot = ({ tone }: { tone: Tone }) => (
  <span
    className={cn(
      "inventory-dot",
      tone === "warn" && "inventory-dot-low",
      tone === "bad" && "inventory-dot-out",
      tone === "info" && "inventory-dot-info",
    )}
  />
);
/** One record = one line; extra columns scroll sideways instead of wrapping. */
export const Row = ({ children, onClick }: { children: ReactNode; onClick?: (() => void) | undefined }) => (
  <div className={cn("pur-row", onClick && "cursor-pointer")} onClick={onClick}>
    {children}
  </div>
);
export function Search({ q, setQ, tr, ph }: { q: string; setQ: (v: string) => void; tr: Tr; ph: string }) {
  return (
    <div className="inventory-search mb-1.5">
      <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(ph)} aria-label={tr(ph)} />
    </div>
  );
}
export const BigButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <ShopButton className="inventory-save mb-2 w-full text-[13px] font-bold" onClick={onClick}>
    {children}
  </ShopButton>
);
/** Total / Paid / Balance trio used on purchase and sale details. */
export function MoneyTrio({
  total,
  paid,
  balance,
  money,
  tr,
}: {
  total: number;
  paid: number;
  balance: number;
  money: (n: number) => string;
  tr: Tr;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
      {(
        [
          ["Total", total, ""],
          ["Paid", paid, ""],
          ["Balance", balance, balance > 0 ? "text-destructive" : ""],
        ] as const
      ).map(([k, v, c]) => (
        <div key={k} className="inventory-box mt-0">
          <p className={cn("text-[10px] text-primary", c)}>{tr(k)}</p>
          <p className={cn("text-[13px] font-bold tabular-nums", balance > 0 && k === "Balance" && "text-warning")}>
            {money(v)}
          </p>
        </div>
      ))}
    </div>
  );
}
