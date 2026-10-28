import { clean } from "@/lib/format";
import { ModuleCharts } from "@/components/shopbook/analytics-charts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MoreVertical,
  Package,
  Coins,
  TriangleAlert,
  ArchiveX,
  Layers,
  ShoppingCart,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { store, canOpen, type Account } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { Reorder } from "@/components/shopbook/reorder";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { run as runR } from "@/components/shopbook/selling";
const runPick = (fn: () => { id: string }) => runR(fn)?.id;
import { lastBackup } from "@/lib/backup";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { useErp } from "@/components/shopbook/product-search";
import { CartCheckout, useCartDraft } from "@/components/shopbook/cart-sheet";
import { ReceiptSheet } from "@/components/shopbook/selling";

import {
  InventorySearch,
  InventoryField,
  BarcodeField,
  InventoryProductPicker,
  inventoryProducts,
  inventoryInput,
} from "@/components/shopbook/inventory-controls";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — SHOPBOOK ERP" },
      {
        name: "description",
        content: "Products, stock levels, stock in/out, adjustments, transfers and stock reports.",
      },
      { property: "og:title", content: "Inventory — SHOPBOOK ERP" },
      { property: "og:description", content: "The single source of truth for products and stock in SHOPBOOK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventory,
});

const MENUS = {
  overview: [],
  products: ["All Products", "Add Product", "Categories", "Brands", "More"],
  stock: ["Stock Levels", "Stock In", "Stock Out", "Returned Goods", "Adjustments", "History"],
  transfers: ["New Transfer", "Pending", "Received", "History"],
  reports: ["Stock Report", "Movement", "Valuation", "Performance"],
} as const;
type Menu = keyof typeof MENUS;

const run = (fn: () => unknown, ok: string) => {
  try {
    fn();
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error(translateCurrent(e instanceof Error ? e.message : "Failed"));
    return false;
  }
};
const dt = (n: number) =>
  new Date(n).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Number formatter matching the Dashboard: full comma-separated below 1M, M/B suffix for 1M+ */
function compactFmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return clean(Math.round(n)).toLocaleString("en-KE");
}

/** Bold financial amount component matching the Dashboard with subscript lowercase currency */
function Amt({
  value,
  curr = "KSh",
  tone,
  size = "xs",
  className,
}: {
  value: number;
  curr?: string;
  tone?: "good" | "warn" | "bad" | undefined;
  size?: "2xs" | "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const numStr = compactFmt(value);
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";

  const isLong = numStr.length >= 6;
  const numSize =
    size === "2xs"
      ? "text-[9.5px]"
      : size === "xs"
        ? isLong
          ? "text-[clamp(8.5px,2.2vw,11.5px)] sm:text-xs"
          : "text-[clamp(10px,2.6vw,13px)] sm:text-sm"
        : size === "sm"
          ? isLong
            ? "text-[clamp(11px,2.6vw,13.5px)] sm:text-sm"
            : "text-xs sm:text-sm"
          : size === "md"
            ? "text-sm sm:text-base"
            : "text-base sm:text-lg";

  const currSize =
    size === "2xs"
      ? "text-[6.5px]"
      : size === "xs"
        ? isLong
          ? "text-[7px] sm:text-[8px]"
          : "text-[7.5px] sm:text-[8.5px]"
        : size === "sm"
          ? "text-[8px] sm:text-[9px]"
          : "text-[9px] sm:text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-mono font-black tracking-tight truncate max-w-full",
        toneClass,
        className,
      )}
    >
      <span className={cn("font-black", numSize)}>{numStr}</span>
      <span className={cn("ml-0.5 font-sans font-bold text-muted-foreground/80 lowercase shrink-0", currSize)}>
        {curr}
      </span>
    </span>
  );
}

function Inventory() {
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  const [acct, setAcct] = useState<Account | null>(null);
  const [menu, setMenu] = useState<Menu>("overview");
  const [sub, setSub] = useState<string>("");
  const [prefillBarcode, setPrefill] = useState("");
  const s = useErp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [lb, setLb] = useState(0);
  useEffect(() => {
    setLb(lastBackup());
  }, []);

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) {
      nav({ to: "/", replace: true });
      return;
    }
    if (!canOpen(a, "basic")) {
      nav({ to: "/apps", replace: true });
      return;
    }
    setAcct(a);
  }, [nav]);
  if (!acct) return <main className="app-screen" />;

  const cur = acct.currency || "KSh";
  const money = (n: number) => `${compactFmt(clean(n))} ${cur.toLowerCase()}`;
  const go = (m: Menu, sm?: string) => {
    setMenu(m);
    setSub(sm ?? MENUS[m][0] ?? "");
  };
  const ctx = {
    s,
    money,
    tr,
    go,
    cur,
    shop: acct.shopName,
    onUnknown: (code: string) => {
      setPrefill(code);
      go("products", "Add Product");
    },
  };

  // 2-letter uppercase initials for the Shop Circle avatar
  const shopInitials = (acct.shopName || "SB")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main dir={dir} className="inventory-screen flex w-full flex-col">
      <style>{`
        .inventory-screen .shop-chart-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-bottom: 6px;
          color: var(--foreground);
        }
        .inventory-screen .shop-chart-rank {
          font-size: 9.5px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 700;
        }
        .inventory-screen .shop-chart-rank b {
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          color: var(--foreground);
        }
        .inventory-screen .kpi-item p:first-child {
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted-foreground);
        }
        .inventory-screen .kpi-item p:last-child {
          margin-top: 2px;
          font-size: 12px;
          font-weight: 900;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
      `}</style>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        {/* UNIFIED SINGLE-ROW HEADER: < Apps | Online | INVENTORY | 📅 | (SC) */}
        <div className="flex items-center justify-between gap-1 px-2 sm:px-3 py-1.5 min-w-0">
          {/* Left: < Apps button + Online status badge */}
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

          {/* Center: INVENTORY + Shop Subtitle */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 mx-auto px-1">
            <h1 className="truncate text-xs font-black uppercase tracking-wider text-foreground">
              {tr("Inventory").toUpperCase()}
            </h1>
            <p className="truncate text-[9.5px] font-semibold text-muted-foreground leading-tight">{acct.shopName}</p>
          </div>

          {/* Right: Calendar Icon Only (📅) + Shop Circle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Calendar Icon Only Popover */}
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

            {/* Shop Circle Avatar & Dropdown */}
            <div className="relative">
              <ShopButton
                variant="bare"
                className="h-7 w-7 rounded-full border border-border/60 bg-primary/10 flex items-center justify-center p-0 text-[10px] font-black text-primary hover:scale-105 transition-all shadow-xs overflow-hidden"
                aria-label={tr("Shop Menu")}
                title={acct.shopName}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {acct.logo ? (
                  <img src={acct.logo} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  shopInitials
                )}
              </ShopButton>

              {menuOpen && (
                <div className="absolute end-0 top-8 z-30 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg">
                  <div className="px-2.5 py-1.5 border-b border-border/60 mb-1">
                    <div className="text-xs font-bold truncate">{acct.shopName}</div>
                    <div className="text-[10px] text-muted-foreground">{acct.currency}</div>
                  </div>
                  {(Object.keys(MENUS) as Menu[]).map((m) => (
                    <ShopButton
                      variant="bare"
                      key={m}
                      onClick={() => {
                        go(m);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium hover:bg-muted",
                        menu === m && "text-primary",
                      )}
                    >
                      {tr(m.charAt(0).toUpperCase() + m.slice(1))}
                    </ShopButton>
                  ))}
                  <ShopButton
                    variant="bare"
                    onClick={() => {
                      setMenuOpen(false);
                      nav({ to: "/settings" });
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    {tr("Settings")}
                  </ShopButton>
                  <ShopButton
                    variant="bare"
                    onClick={() => {
                      setMenuOpen(false);
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
        <Tabs
          items={Object.keys(MENUS)}
          value={menu}
          onChange={(m) => go(m as Menu)}
          label={(k) => tr(k.charAt(0).toUpperCase() + k.slice(1))}
        />
        {MENUS[menu].length > 0 && (
          <Tabs small items={[...MENUS[menu]]} value={sub} onChange={setSub} label={(k) => tr(k)} />
        )}
      </header>

      <section className="inventory-content flex-1">
        {menu === "overview" && <Overview {...ctx} />}
        {menu === "products" && sub === "All Products" && (
          <ProductList
            {...ctx}
            onUnknown={(code) => {
              setPrefill(code);
              go("products", "Add Product");
            }}
          />
        )}
        {menu === "products" && sub === "Add Product" && (
          <ProductForm
            {...ctx}
            barcode={prefillBarcode}
            onSaved={() => {
              setPrefill("");
              go("products", "All Products");
            }}
          />
        )}
        {menu === "products" && sub === "Categories" && <Categories {...ctx} />}
        {menu === "products" && sub === "Brands" && <Brands {...ctx} />}
        {menu === "products" && sub === "More" && <ProductMore {...ctx} />}
        {menu === "stock" && sub === "Stock Levels" && <StockLevels {...ctx} />}
        {menu === "stock" && sub === "Stock In" && <StockIn {...ctx} onDone={() => go("stock", "Stock Levels")} />}
        {menu === "stock" && sub === "Stock Out" && <StockOut {...ctx} onDone={() => go("stock", "Stock Levels")} />}
        {menu === "stock" && sub === "Returned Goods" && <Returns {...ctx} />}
        {menu === "stock" && sub === "Adjustments" && <Adjustments {...ctx} />}
        {menu === "stock" && sub === "History" && <History {...ctx} />}
        {menu === "transfers" && sub === "New Transfer" && <NewTransfer {...ctx} />}
        {menu === "transfers" && sub === "Pending" && <PendingTransfers {...ctx} />}
        {menu === "transfers" && sub === "Received" && <ReceivedTransfers {...ctx} />}
        {menu === "transfers" && sub === "History" && <TransferHistory {...ctx} />}
        {menu === "reports" && <Reports {...ctx} view={sub} />}
      </section>
    </main>
  );
}

type Ctx = {
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (t: string) => string;
  go: (m: Menu, sm?: string) => void;
  cur: string;
  shop: string;
  onUnknown?: (code: string) => void;
};

function Tabs({
  items,
  value,
  onChange,
  label,
  small,
}: {
  items: readonly string[];
  value: string;
  onChange: (v: string) => void;
  label?: (k: string) => string;
  small?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={small ? "Sub-navigation" : "Main navigation"}
      className={small ? "inventory-tabs-sub" : "inventory-tabs"}
    >
      {items.map((it) => (
        <ShopButton
          variant="bare"
          key={it}
          role="tab"
          aria-selected={value === it}
          onClick={() => onChange(it)}
          className="inventory-tab"
        >
          {label ? label(it) : it}
        </ShopButton>
      ))}
    </div>
  );
}

function StockDot({ p }: { p?: erp.Product | undefined }) {
  const st = p ? erp.stockStatus(p) : "OUT";
  return <span className={cn("stock-dot", st === "OK" ? "stock-ok" : st === "LOW" ? "stock-low" : "stock-out")} />;
}

function Box({
  title,
  action,
  children,
  onView,
  tr,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  onView?: () => void;
  tr: (t: string) => string;
}) {
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          {onView && (
            <ShopButton variant="bare" onClick={onView} className="inventory-view-all">
              {tr("View all")}
            </ShopButton>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

function MovementRow({ m, s, tr }: { m: erp.Movement; s: erp.ErpState; tr: (t: string) => string }) {
  const p = s.products.find((x) => x.id === m.productId);
  const isIn = m.qty > 0;
  return (
    <div className="inventory-move-row">
      <StockDot p={p} />
      <span className="truncate">{p?.name ?? tr("Deleted product")}</span>
      <b className={cn("text-end", isIn ? "text-primary" : "text-destructive")}>
        {isIn ? "+" : ""}
        {m.qty}
      </b>
      <span className="text-end text-[10px] text-muted-foreground">{dt(m.at)}</span>
    </div>
  );
}

function MovementDetailRow({
  m,
  s,
  money,
  tr,
}: {
  m: erp.Movement;
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (t: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const p = s.products.find((x) => x.id === m.productId);
  const isIn = m.qty > 0;
  const unit = p?.costPrice ?? p?.buy ?? 0;
  const total = Math.abs(m.qty) * unit;
  return (
    <ShopButton
      variant="bare"
      className="block w-full border-b border-border py-2 text-start text-xs last:border-0 hover:bg-muted/40"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StockDot p={p} />
          <div className="min-w-0">
            <p className="truncate font-medium">{p?.name ?? tr("Deleted product")}</p>
            <p className="text-[10px] text-muted-foreground">{dt(m.at)}</p>
          </div>
        </div>
        <div className="text-end">
          <b className={cn("block", isIn ? "text-primary" : "text-destructive")}>
            {isIn ? "+" : ""}
            {m.qty}
          </b>
          <span className="text-[10px] text-muted-foreground">{money(total)}</span>
        </div>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
          <span>
            {tr("Reason")}: {m.reason}
          </span>
          <span>
            {tr("Ref")}: {m.ref || "-"}
          </span>
          <span>
            {tr("Unit cost")}: {money(unit)}
          </span>
          <span>{tr(m.user)}</span>
        </div>
      )}
    </ShopButton>
  );
}

function Overview({ s, money, tr, go, cur = "KSh" }: Ctx & { cur?: string }) {
  const low = s.products.filter((p) => erp.stockStatus(p) === "LOW");
  const out = s.products.filter((p) => erp.stockStatus(p) === "OUT");
  const value = s.products.reduce((a, p) => a + p.qty * p.buy, 0);
  const ins = s.movements.filter((m) => m.qty > 0).slice(0, 5);
  const outs = s.movements.filter((m) => m.qty < 0).slice(0, 5);
  const shortDate = (at: number) => {
    const date = new Date(at);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return tr("Today");
    today.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return tr("Yesterday");
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };
  const movement = (m: erp.Movement) => {
    const p = s.products.find((p) => p.id === m.productId);
    return (
      <div className="inventory-move-row" key={m.id}>
        <StockDot p={p} />
        <span className="truncate">{p?.name ?? tr("Deleted product")}</span>
        <b className={cn("text-end", m.qty > 0 ? "text-primary" : "text-destructive")}>
          {m.qty > 0 ? "+" : ""}
          {m.qty}
        </b>
        <span className="text-end text-[10px] text-muted-foreground">{shortDate(m.at)}</span>
      </div>
    );
  };
  return (
    <div>
      {/* KPI ROW: Matches Dashboard typography, bold weights and liquid-glass cards */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 mb-2">
        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Products")}
          </span>
          <span className="font-mono font-black text-[clamp(11px,2.6vw,14px)] text-foreground">
            {s.products.length}
          </span>
        </div>

        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Stock value")}
          </span>
          <Amt value={value} curr={cur} size="xs" />
        </div>

        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Low stock")}
          </span>
          <span className="font-mono font-black text-[clamp(11px,2.6vw,14px)] text-amber-500 dark:text-amber-400">
            {low.length}
          </span>
        </div>

        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Out of stock")}
          </span>
          <span className="font-mono font-black text-[clamp(11px,2.6vw,14px)] text-rose-500 dark:text-rose-400">
            {out.length}
          </span>
        </div>
      </div>

      <ModuleCharts s={s} module="inventory" money={money} tr={tr} />
      <Box title={tr("Recent Stock In")} tr={tr} onView={() => go("stock", "History")}>
        {ins.length ? ins.map(movement) : <Empty>{tr("No movements yet")}</Empty>}
      </Box>
      <Box title={tr("Recent Stock Out")} tr={tr} onView={() => go("stock", "History")}>
        {outs.length ? outs.map(movement) : <Empty>{tr("No movements yet")}</Empty>}
      </Box>
      <Box title={tr("Low / Out of Stock")} tr={tr} onView={() => go("stock", "Stock Levels")}>
        {[...out, ...low].length ? (
          [...out, ...low].slice(0, 5).map((p) => (
            <div className="flex items-start gap-2 border-b border-border py-1.5 last:border-0" key={p.id}>
              <span className="mt-1">
                <StockDot p={p} />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-xs text-foreground">{p.name}</p>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {tr("Stock")}: <b className="font-bold text-foreground">{p.qty}</b> • {tr("Reorder")}:{" "}
                  {p.minStock ?? 5}
                </p>
              </div>
            </div>
          ))
        ) : (
          <Empty>{s.products.length ? tr("Nothing here yet") : tr("No products yet")}</Empty>
        )}
      </Box>
    </div>
  );
}

function ProductList({ s, money, tr, shop, onUnknown }: Ctx & { onUnknown: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [openP, setOpen] = useState<erp.Product | null>(null);
  const [editP, setEdit] = useState<erp.Product | null>(null);
  const [receipt, setReceipt] = useState<erp.Sale | null>(null);
  const draft = useCartDraft("inventory-checkout");

  const filtered = useMemo(() => {
    return s.products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      const st = erp.stockStatus(p);
      if (filter === "low" && st !== "LOW") return false;
      if (filter === "out" && st !== "OUT") return false;
      if (!q.trim()) return true;
      const t = q.toLowerCase();
      return (
        p.name.toLowerCase().includes(t) ||
        (p.barcode && p.barcode.toLowerCase().includes(t)) ||
        (p.sku && p.sku.toLowerCase().includes(t))
      );
    });
  }, [s.products, q, cat, filter]);

  return (
    <div>
      <InventorySearch
        q={q}
        setQ={setQ}
        tr={tr}
        categories={s.categories}
        cat={cat}
        setCat={setCat}
        filter={filter}
        setFilter={setFilter}
        onScan={onUnknown}
      />
      <div className={inventoryProducts}>
        {filtered.length === 0 ? (
          <Empty>{tr("No products match")}</Empty>
        ) : (
          filtered.map((p) => (
            <ShopButton
              variant="bare"
              key={p.id}
              className="pos-product-button"
              onClick={() => {
                if (draft.count > 0) {
                  draft.add(p);
                } else {
                  setOpen(p);
                }
              }}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StockDot p={p} />
                  <span className="pos-product-name truncate">{p.name}</span>
                </div>
                <span className="pos-product-price shrink-0">{money(p.sell)}</span>
              </div>
              <div className="pos-product-meta flex justify-between">
                <span>
                  {tr("Stock")}: {p.qty} {p.unit || ""}
                </span>
                {p.category && <span className="truncate">{p.category}</span>}
              </div>
            </ShopButton>
          ))
        )}
      </div>
      {openP && <ProductSheet p={openP} s={s} money={money} tr={tr} onClose={() => setOpen(null)} />}
      {editP && (
        <ProductForm
          s={s}
          money={money}
          tr={tr}
          go={() => {}}
          cur=""
          shop=""
          initial={editP}
          onSaved={() => setEdit(null)}
        />
      )}
      {draft.count > 0 && (
        <CartCheckout
          cart={draft}
          s={s}
          money={money}
          tr={tr}
          shop={shop}
          onDone={(sale) => {
            setReceipt(sale);
            draft.clear();
          }}
        />
      )}
      {receipt && (
        <ReceiptSheet live sale={receipt} s={s} money={money} tr={tr} shop={shop} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}

function ProductSheet({
  p,
  s,
  money,
  tr,
  onClose,
}: {
  p: erp.Product;
  s: erp.ErpState;
  money: Ctx["money"];
  tr: Ctx["tr"];
  onClose: () => void;
}) {
  const [buy, setBuy] = useState(String(p.buy));
  const [sell, setSell] = useState(String(p.sell));
  const [min, setMin] = useState(String(p.minStock ?? 5));
  const [cat, setCat] = useState(p.category || "");
  const [brand, setBrand] = useState(p.brand || "");
  const [unit, setUnit] = useState(p.unit || "Pcs");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 sm:items-center">
      <div className="w-full max-w-lg rounded-t-xl bg-card p-4 shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold">{p.name}</h2>
            <p className="text-xs text-muted-foreground">
              {p.barcode || p.sku || tr("No barcode")} • {p.category || tr("Uncategorized")}
            </p>
          </div>
          <ShopButton variant="bare" onClick={onClose} aria-label={tr("Close")}>
            <X className="h-5 w-5" />
          </ShopButton>
        </div>
        <KpiRow className="mt-3">
          <Kpi label={tr("Stock")} value={`${p.qty}`} />
          <Kpi label={tr("Cost value")} value={money(p.qty * p.buy)} />
          <Kpi label={tr("Sell value")} value={money(p.qty * p.sell)} />
        </KpiRow>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <label>
            {tr("Buying price")}
            <input type="number" value={buy} onChange={(e) => setBuy(e.target.value)} className={inventoryInput} />
          </label>
          <label>
            {tr("Selling price")}
            <input type="number" value={sell} onChange={(e) => setSell(e.target.value)} className={inventoryInput} />
          </label>
          <label>
            {tr("Min stock")}
            <input type="number" value={min} onChange={(e) => setMin(e.target.value)} className={inventoryInput} />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <label>
            {tr("Category")}
            <SearchPicker
              value={cat}
              onChange={setCat}
              options={s.categories.map((c) => ({ id: c, label: c }))}
              placeholder={tr("Select category")}
              entityName={tr("Category")}
              onCreateOption={(name) => {
                run(() => erp.addCategory(name), tr("Category created"));
                setCat(name);
              }}
              triggerClassName={inventoryInput}
            />
          </label>
          <label>
            {tr("Brand")}
            <SearchPicker
              value={brand}
              onChange={setBrand}
              options={s.brands.map((b) => ({ id: b, label: b }))}
              placeholder={tr("Select brand")}
              entityName={tr("Brand")}
              onCreateOption={(name) => {
                run(() => erp.addBrand(name), tr("Brand created"));
                setBrand(name);
              }}
              triggerClassName={inventoryInput}
            />
          </label>
          <label>
            {tr("Unit")}
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inventoryInput} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <ShopButton
            variant="bare"
            className="inventory-action-btn border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (!confirm(tr("Delete this product?"))) return;
              run(() => erp.deleteProduct(p.id), tr("Deleted"));
              onClose();
            }}
          >
            {tr("Delete")}
          </ShopButton>
          <ShopButton
            className="inventory-action-btn flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              run(
                () =>
                  erp.updateProduct({
                    ...p,
                    buy: Number(buy),
                    sell: Number(sell),
                    minStock: Number(min),
                    category: cat,
                    brand,
                    unit,
                  }),
                tr("Saved"),
              );
              onClose();
            }}
          >
            {tr("Save changes")}
          </ShopButton>
        </div>
      </div>
    </div>
  );
}

function ProductForm({
  s,
  tr,
  barcode: initialBarcode,
  initial,
  onSaved,
}: Ctx & { barcode?: string; initial?: erp.Product | null; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [barcode, setBarcode] = useState(initial?.barcode || initialBarcode || "");
  const [sku, setSku] = useState(initial?.sku || "");
  const [buy, setBuy] = useState(initial ? String(initial.buy) : "");
  const [sell, setSell] = useState(initial ? String(initial.sell) : "");
  const [qty, setQty] = useState(initial ? String(initial.qty) : "0");
  const [min, setMin] = useState(initial ? String(initial.minStock ?? 5) : "5");
  const [cat, setCat] = useState(initial?.category || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [unit, setUnit] = useState(initial?.unit || "Pcs");

  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{initial ? tr("Edit Product") : tr("New Product")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return toast.error(tr("Name is required"));
          if (initial) {
            run(
              () =>
                erp.updateProduct({
                  ...initial,
                  name: name.trim(),
                  barcode: barcode.trim(),
                  sku: sku.trim(),
                  buy: Number(buy) || 0,
                  sell: Number(sell) || 0,
                  minStock: Number(min) || 0,
                  category: cat,
                  brand,
                  unit,
                }),
              tr("Updated"),
            );
          } else {
            run(
              () =>
                erp.addProduct({
                  name: name.trim(),
                  barcode: barcode.trim(),
                  sku: sku.trim(),
                  buy: Number(buy) || 0,
                  sell: Number(sell) || 0,
                  qty: Number(qty) || 0,
                  minStock: Number(min) || 0,
                  category: cat,
                  brand,
                  unit,
                }),
              tr("Product created"),
            );
          }
          onSaved();
        }}
        className="space-y-3"
      >
        <InventoryField label={tr("Product name")} required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("e.g. Milk 500ml")}
            className={inventoryInput}
          />
        </InventoryField>
        <div className="grid grid-cols-2 gap-2">
          <BarcodeField barcode={barcode} setBarcode={setBarcode} tr={tr} />
          <InventoryField label={tr("SKU")}>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU-..."
              className={inventoryInput}
            />
          </InventoryField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Buying price")}>
            <input
              type="number"
              step="0.01"
              value={buy}
              onChange={(e) => setBuy(e.target.value)}
              placeholder="0.00"
              className={inventoryInput}
            />
          </InventoryField>
          <InventoryField label={tr("Selling price")} required>
            <input
              type="number"
              step="0.01"
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              placeholder="0.00"
              className={inventoryInput}
            />
          </InventoryField>
        </div>
        {!initial && (
          <InventoryField label={tr("Opening stock")}>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className={inventoryInput}
            />
          </InventoryField>
        )}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Reorder level")}>
            <input
              type="number"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="5"
              className={inventoryInput}
            />
          </InventoryField>
          <InventoryField label={tr("Category")}>
            <SearchPicker
              value={cat}
              onChange={setCat}
              options={s.categories.map((c) => ({ id: c, label: c }))}
              placeholder={tr("Select category")}
              entityName={tr("Category")}
              onCreateOption={(name) => {
                run(() => erp.addCategory(name), tr("Category created"));
                setCat(name);
              }}
              triggerClassName={inventoryInput}
            />
          </InventoryField>
          <InventoryField label={tr("Brand")}>
            <SearchPicker
              value={brand}
              onChange={setBrand}
              options={s.brands.map((b) => ({ id: b, label: b }))}
              placeholder={tr("Select brand")}
              entityName={tr("Brand")}
              onCreateOption={(name) => {
                run(() => erp.addBrand(name), tr("Brand created"));
                setBrand(name);
              }}
              triggerClassName={inventoryInput}
            />
          </InventoryField>
        </div>
        <ShopButton
          type="submit"
          className="inventory-action-btn w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {initial ? tr("Save changes") : tr("Create product")}
        </ShopButton>
      </form>
    </div>
  );
}

function Categories({ s, tr }: Ctx) {
  const [name, setName] = useState("");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Categories")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => erp.addCategory(name.trim()), tr("Category added"));
          setName("");
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr("New category...")}
          className={cn(inventoryInput, "flex-1")}
        />
        <ShopButton
          type="submit"
          className="inventory-action-btn bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </ShopButton>
      </form>
      <div className="mt-3 divide-y divide-border">
        {s.categories.map((c) => {
          const count = s.products.filter((p) => p.category === c).length;
          return (
            <div key={c} className="flex items-center justify-between py-2 text-xs">
              <div>
                <span className="font-medium">{c}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {count} {tr("products")}
                </span>
              </div>
              <ShopButton
                variant="bare"
                onClick={() => {
                  if (confirm(tr("Delete category?"))) {
                    run(() => erp.deleteCategory(c), tr("Deleted"));
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </ShopButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Brands({ s, tr }: Ctx) {
  const [name, setName] = useState("");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Brands")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => erp.addBrand(name.trim()), tr("Brand added"));
          setName("");
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr("New brand...")}
          className={cn(inventoryInput, "flex-1")}
        />
        <ShopButton
          type="submit"
          className="inventory-action-btn bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </ShopButton>
      </form>
      <div className="mt-3 divide-y divide-border">
        {s.brands.map((b) => {
          const count = s.products.filter((p) => p.brand === b).length;
          return (
            <div key={b} className="flex items-center justify-between py-2 text-xs">
              <div>
                <span className="font-medium">{b}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {count} {tr("products")}
                </span>
              </div>
              <ShopButton
                variant="bare"
                onClick={() => {
                  if (confirm(tr("Delete brand?"))) {
                    run(() => erp.deleteBrand(b), tr("Deleted"));
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </ShopButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductMore({ s, money, tr }: Ctx) {
  const [ai, setAi] = useState(false);
  const handleExport = () => {
    const rows = s.products.map((p) => ({
      name: p.name,
      barcode: p.barcode,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      buy: p.buy,
      sell: p.sell,
      qty: p.qty,
      minStock: p.minStock,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tr("Exported"));
  };
  return (
    <div className="space-y-3">
      <div className="inventory-box">
        <div className="inventory-box-heading">
          <h2>{tr("Bulk Actions & Tools")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <ShopButton variant="bare" onClick={handleExport} className="inventory-tab border border-border">
            {tr("Export JSON")}
          </ShopButton>
          <ShopButton
            variant="bare"
            onClick={() => setAi(!ai)}
            className="inventory-tab border border-border text-primary"
          >
            {ai ? tr("Hide AI") : tr("AI Reorder suggestions")}
          </ShopButton>
        </div>
      </div>
      {ai && <Reorder s={s} money={money} />}
    </div>
  );
}

function StockLevels({ s, tr, go }: Ctx) {
  const [q, setQ] = useState("");
  const filtered = s.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Stock Levels")}</h2>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr("Filter products...")}
        className={cn(inventoryInput, "mb-3")}
      />
      <div className="divide-y divide-border">
        {filtered.map((p) => {
          const st = erp.stockStatus(p);
          return (
            <div key={p.id} className="flex items-center justify-between py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <StockDot p={p} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("Reorder at")}: {p.minStock ?? 5}
                  </p>
                </div>
              </div>
              <div className="text-end">
                <b className={cn(st === "OK" ? "text-primary" : st === "LOW" ? "text-warning" : "text-destructive")}>
                  {p.qty} {p.unit || ""}
                </b>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockIn({ s, tr, onDone }: Ctx & { onDone: () => void }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Purchase");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Stock In")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pid) return toast.error(tr("Select product"));
          const n = Number(qty);
          if (!n || n <= 0) return toast.error(tr("Enter positive quantity"));
          run(() => erp.stockIn(pid, n, reason), tr("Stock added"));
          onDone();
        }}
        className="space-y-3"
      >
        <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        <InventoryField label={tr("Quantity to add")} required>
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className={inventoryInput}
          />
        </InventoryField>
        <InventoryField label={tr("Reason")}>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inventoryInput}>
            <option value="Purchase">{tr("Purchase")}</option>
            <option value="Return">{tr("Customer Return")}</option>
            <option value="Adjustment">{tr("Inventory Count / Found")}</option>
            <option value="Opening">{tr("Opening stock")}</option>
          </select>
        </InventoryField>
        <ShopButton
          type="submit"
          className="inventory-action-btn w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {tr("Confirm Stock In")}
        </ShopButton>
      </form>
    </div>
  );
}

function StockOut({ s, tr, onDone }: Ctx & { onDone: () => void }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Damaged");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Stock Out")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pid) return toast.error(tr("Select product"));
          const n = Number(qty);
          if (!n || n <= 0) return toast.error(tr("Enter positive quantity"));
          run(() => erp.stockOut(pid, n, reason), tr("Stock removed"));
          onDone();
        }}
        className="space-y-3"
      >
        <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        <InventoryField label={tr("Quantity to remove")} required>
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className={inventoryInput}
          />
        </InventoryField>
        <InventoryField label={tr("Reason")}>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inventoryInput}>
            <option value="Damaged">{tr("Damaged / Expired")}</option>
            <option value="Lost">{tr("Lost / Stolen")}</option>
            <option value="Internal">{tr("Internal Store Use")}</option>
            <option value="Adjustment">{tr("Inventory Count / Shortage")}</option>
          </select>
        </InventoryField>
        <ShopButton
          type="submit"
          className="inventory-action-btn w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {tr("Confirm Stock Out")}
        </ShopButton>
      </form>
    </div>
  );
}

function Returns({ s, tr }: Ctx) {
  const returns = s.movements.filter((m) => m.reason?.toLowerCase().includes("return"));
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Returned Goods")}</h2>
      </div>
      <div className="divide-y divide-border">
        {returns.length === 0 ? (
          <Empty>{tr("No return records")}</Empty>
        ) : (
          returns.map((m) => <MovementRow key={m.id} m={m} s={s} tr={tr} />)
        )}
      </div>
    </div>
  );
}

function Adjustments({ s, tr }: Ctx) {
  const [pid, setPid] = useState("");
  const [actual, setActual] = useState("");
  const p = s.products.find((x) => x.id === pid);
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Physical Count Adjustment")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!p) return toast.error(tr("Select product"));
          const n = Number(actual);
          if (isNaN(n) || n < 0) return toast.error(tr("Enter valid actual quantity"));
          const diff = n - p.qty;
          if (diff === 0) return toast.info(tr("Stock is already correct"));
          run(() => erp.adjustStock(p.id, n, tr("Stock Audit")), tr("Stock adjusted"));
          setActual("");
        }}
        className="space-y-3"
      >
        <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        {p && (
          <p className="text-xs text-muted-foreground">
            {tr("Current system stock")}: <b className="font-bold text-foreground">{p.qty}</b>
          </p>
        )}
        <InventoryField label={tr("Actual counted stock")} required>
          <input
            type="number"
            step="any"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="0"
            className={inventoryInput}
          />
        </InventoryField>
        <ShopButton
          type="submit"
          className="inventory-action-btn w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {tr("Save Adjustment")}
        </ShopButton>
      </form>
    </div>
  );
}

function History({ s, money, tr }: Ctx) {
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Stock Movement History")}</h2>
      </div>
      <div className="divide-y divide-border">
        {s.movements.length === 0 ? (
          <Empty>{tr("No movements yet")}</Empty>
        ) : (
          s.movements
            .slice()
            .reverse()
            .map((m) => <MovementDetailRow key={m.id} m={m} s={s} money={money} tr={tr} />)
        )}
      </div>
    </div>
  );
}

function NewTransfer({ s, tr }: Ctx) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [toShop, setToShop] = useState("");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("New Transfer")}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pid) return toast.error(tr("Select product"));
          const n = Number(qty);
          if (!n || n <= 0) return toast.error(tr("Enter quantity"));
          if (!toShop.trim()) return toast.error(tr("Enter destination branch"));
          run(() => erp.createTransfer(pid, n, toShop.trim()), tr("Transfer sent"));
          setQty("");
          setToShop("");
        }}
        className="space-y-3"
      >
        <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        <InventoryField label={tr("Quantity")} required>
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className={inventoryInput}
          />
        </InventoryField>
        <InventoryField label={tr("Destination Branch / Warehouse")} required>
          <input
            value={toShop}
            onChange={(e) => setToShop(e.target.value)}
            placeholder={tr("e.g. Westlands Branch")}
            className={inventoryInput}
          />
        </InventoryField>
        <ShopButton
          type="submit"
          className="inventory-action-btn w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {tr("Initiate Transfer")}
        </ShopButton>
      </form>
    </div>
  );
}

function PendingTransfers({ s, tr }: Ctx) {
  const pending = s.transfers.filter((t) => t.status === "PENDING");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Pending Transfers")}</h2>
      </div>
      <div className="divide-y divide-border">
        {pending.length === 0 ? (
          <Empty>{tr("No pending transfers")}</Empty>
        ) : (
          pending.map((t) => {
            const p = s.products.find((x) => x.id === t.productId);
            return (
              <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold">{p?.name || tr("Product")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("To")}: {t.to} • {dt(t.at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <b className="font-bold">{t.qty}</b>
                  <ShopButton
                    variant="bare"
                    onClick={() => run(() => erp.receiveTransfer(t.id), tr("Received"))}
                    className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
                  >
                    {tr("Receive")}
                  </ShopButton>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ReceivedTransfers({ s, tr }: Ctx) {
  const received = s.transfers.filter((t) => t.status === "RECEIVED");
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Received Transfers")}</h2>
      </div>
      <div className="divide-y divide-border">
        {received.length === 0 ? (
          <Empty>{tr("No received transfers yet")}</Empty>
        ) : (
          received.map((t) => {
            const p = s.products.find((x) => x.id === t.productId);
            return (
              <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold">{p?.name || tr("Product")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("From / To")}: {t.to} • {dt(t.at)}
                  </p>
                </div>
                <b className="text-primary font-bold">{t.qty}</b>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TransferHistory({ s, tr }: Ctx) {
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{tr("Transfer History")}</h2>
      </div>
      <div className="divide-y divide-border">
        {s.transfers.length === 0 ? (
          <Empty>{tr("No transfers recorded")}</Empty>
        ) : (
          s.transfers.map((t) => {
            const p = s.products.find((x) => x.id === t.productId);
            return (
              <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold">{p?.name || tr("Product")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.to} • {dt(t.at)}
                  </p>
                </div>
                <div className="text-end">
                  <b className="font-bold">{t.qty}</b>
                  <span className="block text-[10px] text-muted-foreground">{t.status}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Reports({ s, money, tr, view }: Ctx & { view: string }) {
  if (view === "AI Reorder") return <Reorder s={s} money={money} />;
  if (view === "Valuation") {
    const cost = s.products.reduce((a, p) => a + p.qty * p.buy, 0);
    const sell = s.products.reduce((a, p) => a + p.qty * p.sell, 0);
    return (
      <div className="space-y-3">
        <KpiRow>
          <Kpi label={tr("Cost value")} value={money(cost)} />
          <Kpi label={tr("Selling value")} value={money(sell)} />
        </KpiRow>
        <p className="text-xs text-muted-foreground">
          {tr("Potential profit")}: <b className="text-foreground">{money(sell - cost)}</b>
        </p>
        <div className="divide-y divide-border">
          {s.products.map((p) => (
            <div key={p.id} className="flex justify-between py-1.5 text-xs">
              <span className="truncate">{p.name}</span>
              <div className="text-end font-mono">
                <span>{money(p.qty * p.buy)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (view === "Performance") {
    const out = new Map<string, number>();
    s.movements.filter((m) => m.qty < 0).forEach((m) => out.set(m.productId, (out.get(m.productId) ?? 0) - m.qty));
    const ranked = s.products.map((p) => ({ p, n: out.get(p.id) ?? 0 })).sort((a, b) => b.n - a.n);
    return (
      <div>
        {ranked.length === 0 && <Empty>{tr("No products yet")}</Empty>}
        {ranked.map(({ p, n }) => (
          <div key={p.id} className="flex justify-between border-b border-border py-1.5 text-xs">
            <span className="truncate">{p.name}</span>
            <span className="font-semibold">
              {n} {tr("out")}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <StockLevels s={s} money={money} tr={tr} go={() => {}} cur="" shop="" />;
}
