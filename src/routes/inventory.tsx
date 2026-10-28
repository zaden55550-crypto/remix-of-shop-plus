import { clean } from "@/lib/format";
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
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { store, canOpen, type Account } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/components/shopbook/ui";
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
  products: ["All Products", "Add Product", "Categories", "Brands", "Export"],
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

/** Compact number formatter: full numbers below 1M with commas, M for >=1M, B for >=1B */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n) || Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  const [intPart, decPart] = n.toFixed(2).split(".");
  const formattedInt = Number(intPart).toLocaleString("en-US");
  return decPart && decPart !== "00" ? `${formattedInt}.${decPart}` : formattedInt;
}

/** Fluid KPI number component */
function Amt({
  value,
  curr,
  tone,
  size = "md",
}: {
  value: number;
  curr?: string;
  tone?: "warn" | "bad";
  size?: "sm" | "md" | "lg" | "xs";
}) {
  const formatted = compactFmt(value);
  const isLarge = formatted.length > 7;
  const isHuge = formatted.length > 10;
  return (
    <div className="flex items-baseline gap-0.5 leading-none min-w-0 max-w-full">
      <span
        className={cn(
          "font-extrabold tracking-tight tabular-nums truncate",
          tone === "bad" && "text-rose-500",
          tone === "warn" && "text-amber-500",
          !tone && "text-foreground",
          size === "xs" && (isHuge ? "text-xs" : isLarge ? "text-sm" : "text-base sm:text-lg"),
          size === "sm" && (isHuge ? "text-sm" : isLarge ? "text-base" : "text-lg sm:text-xl"),
          size === "md" && (isHuge ? "text-base" : isLarge ? "text-lg" : "text-xl sm:text-2xl"),
          size === "lg" && (isHuge ? "text-xl" : isLarge ? "text-2xl" : "text-3xl sm:text-4xl"),
        )}
      >
        {formatted}
      </span>
      {curr && (
        <span className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground/80 lowercase shrink-0">
          {curr}
        </span>
      )}
    </div>
  );
}

function Inventory() {
  const nav = useNavigate();
  const { tr } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [menu, setMenu] = useState<Menu>("overview");
  const [sub, setSub] = useState<string>("");
  const [prefillBarcode, setPrefill] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarRange, setCalendarRange] = useState<"today" | "week" | "month" | "all">("today");
  const [showShopMenu, setShowShopMenu] = useState(false);

  useEffect(() => {
    const a = store.get();
    if (!a || !canOpen(a, "inventory")) {
      nav({ to: "/apps" });
      return;
    }
    setAcct(a);
  }, [nav]);

  const s = useErp();
  const cur = acct?.currency ?? "KSh";
  const money = useMemo(() => {
    return (n: number) => `${Math.round(clean(n)).toLocaleString("en-KE")} ${cur}`;
  }, [cur]);

  if (!acct) return null;

  const go = (m: Menu, sm?: string) => {
    setMenu(m);
    setSub(sm ?? MENUS[m][0] ?? "");
  };

  const ctx: Ctx = {
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

  const shopInitials =
    (acct.shopName || "SB")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "SB";

  return (
    <main className="inventory-screen app-screen flex flex-col min-h-screen">
      <header className="inventory-header sticky top-0 z-30 flex items-center justify-between gap-1.5 px-3 py-2 border-b border-border/40 backdrop-blur-md bg-background/80">
        <div className="flex items-center gap-1.5 shrink-0">
          <ShopButton
            variant="bare"
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md hover:bg-muted/60 transition-colors"
            onClick={() => nav({ to: "/apps" })}
            aria-label={tr("Back to Apps")}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            <span>{tr("Apps")}</span>
          </ShopButton>
          <ConnectionStatus />
        </div>

        <div className="flex flex-col items-center justify-center min-w-0 px-2 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground leading-tight truncate">
            {tr("Inventory")}
          </span>
          <span className="text-[10px] text-muted-foreground truncate leading-tight">{acct.shopName}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 relative">
          <ShopButton
            variant="bare"
            className="h-8 w-8 p-0 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors text-foreground"
            onClick={toggleTheme}
            aria-label={tr("Toggle Theme")}
            title={theme === "dark" ? tr("Switch to Light mode") : tr("Switch to Dark mode")}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </ShopButton>

          <ShopButton
            variant="bare"
            className={cn(
              "h-8 w-8 p-0 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors",
              showCalendar && "bg-muted text-primary",
            )}
            onClick={() => {
              setShowCalendar(!showCalendar);
              setShowShopMenu(false);
            }}
            aria-label={tr("Filter by date")}
            title={tr("Calendar filter")}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </ShopButton>

          {showCalendar && (
            <div className="absolute right-9 top-10 z-50 w-36 rounded-lg border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-lg text-xs space-y-1">
              {(["today", "week", "month", "all"] as const).map((r) => (
                <button
                  key={r}
                  className={cn(
                    "w-full text-start px-2 py-1 rounded capitalize font-medium transition-colors",
                    calendarRange === r ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground",
                  )}
                  onClick={() => {
                    setCalendarRange(r);
                    setShowCalendar(false);
                    toast.success(`${tr("Date filter")}: ${tr(r)}`);
                  }}
                >
                  {tr(r === "all" ? "All time" : r === "today" ? "Today" : r === "week" ? "This week" : "This month")}
                </button>
              ))}
            </div>
          )}

          <ShopButton
            variant="bare"
            className="h-7 w-7 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
            onClick={() => {
              setShowShopMenu(!showShopMenu);
              setShowCalendar(false);
            }}
            aria-label={acct.shopName}
            title={acct.shopName}
          >
            {shopInitials}
          </ShopButton>

          {showShopMenu && (
            <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-lg text-xs space-y-1">
              <div className="px-2 py-1 border-b border-border/50 font-bold truncate">{acct.shopName}</div>
              <button
                className="w-full text-start px-2 py-1.5 rounded hover:bg-muted text-foreground"
                onClick={() => {
                  setShowShopMenu(false);
                  nav({ to: "/settings" });
                }}
              >
                {tr("Shop Settings")}
              </button>
              <button
                className="w-full text-start px-2 py-1.5 rounded hover:bg-muted text-foreground"
                onClick={() => {
                  setShowShopMenu(false);
                  nav({ to: "/apps" });
                }}
              >
                {tr("All Apps")}
              </button>
            </div>
          )}
        </div>
      </header>

      <nav aria-label={tr("Inventory navigation")} className="inventory-nav-wrap">
        <Tabs
          items={Object.keys(MENUS)}
          value={menu}
          onChange={(k) => go(k as Menu)}
          label={(k) => tr(k[0]?.toUpperCase() + k.slice(1))}
        />
        {MENUS[menu].length > 0 && (
          <Tabs small items={[...MENUS[menu]]} value={sub} onChange={setSub} label={(k) => tr(k)} />
        )}
      </nav>

      <section className="inventory-content flex-1">
        {menu === "overview" && <Overview {...ctx} />}
        {menu === "products" && sub === "All Products" && (
          <ProductList
            {...ctx}
            onUnknown={(code) => {
              setPrefill(code);
              setSub("Add Product");
            }}
          />
        )}
        {menu === "products" && sub === "Add Product" && (
          <AddProduct
            {...ctx}
            barcode={prefillBarcode}
            done={() => {
              setPrefill("");
              setSub("All Products");
            }}
          />
        )}
        {menu === "products" && (sub === "Categories" || sub === "Brands") && (
          <NamedList {...ctx} kind={sub === "Brands" ? "brands" : "categories"} />
        )}
        {menu === "products" && sub === "Export" && <ProductExport {...ctx} />}
        {menu === "stock" && sub === "Stock Levels" && <StockLevels {...ctx} />}
        {menu === "stock" && (sub === "Stock In" || sub === "Stock Out" || sub === "Adjustments") && (
          <StockForm {...ctx} mode={sub} />
        )}
        {menu === "stock" && sub === "Returned Goods" && <ReturnedGoods {...ctx} />}
        {menu === "stock" && sub === "History" && <History {...ctx} />}
        {menu === "transfers" && <Transfers {...ctx} view={sub} />}
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
  items: string[];
  value: string;
  onChange: (v: string) => void;
  label: (k: string) => string;
  small?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={small ? "Inventory submenu" : "Inventory navigation"}
      className={cn("inventory-tabs", small && "inventory-tabs-sub")}
    >
      {items.map((k) => (
        <ShopButton
          variant="bare"
          role="tab"
          aria-selected={value === k}
          key={k}
          onClick={() => onChange(k)}
          className="inventory-tab"
        >
          {label(k)}
        </ShopButton>
      ))}
    </div>
  );
}

function Status({ p }: { p: erp.Product }) {
  const st = erp.stockStatus(p);
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold",
        st === "OK" && "bg-primary/15 text-primary",
        st === "LOW" && "bg-warning/15 text-warning",
        st === "OUT" && "bg-destructive/15 text-destructive",
      )}
    >
      {translateCurrent(st)}
    </span>
  );
}

function Box({
  title,
  children,
  onView,
  tr,
}: {
  title: string;
  children: ReactNode;
  onView?: () => void;
  tr: Ctx["tr"];
}) {
  return (
    <div className="inventory-box">
      <div className="inventory-box-heading">
        <h2>{title}</h2>
        {onView && (
          <ShopButton variant="bare" className="inventory-view-all" onClick={onView}>
            {tr("View All")} <ChevronRight className="h-3 w-3 rtl:rotate-180" />
          </ShopButton>
        )}
      </div>
      {children}
    </div>
  );
}

function StockDot({ p }: { p?: erp.Product | undefined }) {
  const status = p ? erp.stockStatus(p) : "OK";
  return (
    <span
      aria-label={status}
      className={cn("inventory-dot", status === "LOW" && "inventory-dot-low", status === "OUT" && "inventory-dot-out")}
    />
  );
}

function ReturnedGoods({ s, tr }: Ctx) {
  const [q, setQ] = useState("");
  const rows = s.returns.filter(
    (r) =>
      !q || `${r.ref} ${r.saleRef} ${r.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div>
      <InventorySearch q={q} setQ={setQ} onScan={setQ} tr={tr} placeholder="Search returns..." />
      <div className="inventory-list-panel">
        {rows.length === 0 ? (
          <Empty>{tr("No returns yet.")}</Empty>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="border-b border-border py-2">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <b>{r.ref}</b>
                <span className="text-muted-foreground">{dt(r.at)}</span>
              </div>
              {r.items.map((i, k) => (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate">{i.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {tr("Quantity")}: {i.qty} • {tr("Sale")}: {r.saleRef}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tr("Reason")}: {tr("Return")} • {tr("Refund")}: {tr(erp.METHOD_LABEL[r.refund])}
                    </p>
                  </div>
                  <span className="rounded border border-primary px-1.5 text-[10px] text-primary">
                    +{i.qty} {tr("Stock")}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground first:mt-0">
      {children}
    </h2>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function MoveRow({ m, s, tr }: { m: erp.Movement; s: erp.ErpState; tr: Ctx["tr"] }) {
  const [open, setOpen] = useState(false);
  const p = s.products.find((x) => x.id === m.productId);
  return (
    <ShopButton
      variant="bare"
      onClick={() => setOpen(!open)}
      className="block h-auto w-full border-b border-border py-1.5 text-start"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">
            {dt(m.at)} • {tr(m.type)}
          </p>
          <p className="text-xs font-medium">{p?.name ?? tr("Deleted product")}</p>
        </div>
        <span className={cn("text-xs font-bold", m.qty > 0 ? "text-primary" : "text-destructive")}>
          {m.qty > 0 ? "+" : ""}
          {m.qty}
        </span>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-2 text-[11px]">
          <span className="text-muted-foreground">{tr("Source")}</span>
          <span>{m.source ?? "—"}</span>
          <span className="text-muted-foreground">{tr("Previous")}</span>
          <span>{m.prev}</span>
          <span className="text-muted-foreground">{tr("New")}</span>
          <span>{m.next}</span>
          <span className="text-muted-foreground">{tr("Reason")}</span>
          <span>{m.reason ? tr(m.reason) : "—"}</span>
          <span className="text-muted-foreground">{tr("Performed by")}</span>
          <span>{tr(m.user)}</span>
        </div>
      )}
    </ShopButton>
  );
}

function Overview({ s, money, tr, go, cur }: Ctx) {
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
      <div className="grid grid-cols-4 gap-1 sm:gap-2 mb-3">
        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Products")}
          </span>
          <Amt value={s.products.length} size="xs" />
        </div>
        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Stock Value")}
          </span>
          <Amt value={value} curr={cur} size="xs" />
        </div>
        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Low Stock")}
          </span>
          <Amt value={low.length} tone={low.length > 0 ? "warn" : undefined} size="xs" />
        </div>
        <div className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-1.5 py-1 sm:px-2.5 sm:py-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0 overflow-hidden">
          <span className="truncate text-[clamp(7px,1.8vw,9px)] font-bold uppercase tracking-wider text-muted-foreground leading-none w-full">
            {tr("Out of Stock")}
          </span>
          <Amt value={out.length} tone={out.length > 0 ? "bad" : undefined} size="xs" />
        </div>
      </div>

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
                <p className="truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {tr("Stock")}: {p.qty} • {tr("Reorder")}: {p.minStock ?? 5}
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
  const [open, setOpen] = useState<string | null>(null);
  const { cart, setCart, saveDraft, clearDraft } = useCartDraft("Sales");
  const [step, setStep] = useState<null | "cart">(null);
  const [receipt, setReceipt] = useState<erp.Sale | null>(null);
  const add = (p: erp.Product) => {
    const existing = cart.find((l) => l.productId === p.id);
    const qty = erp.roundQty((existing?.qty ?? 0) + 1);
    if (qty > p.qty) {
      toast.error(`${tr("Insufficient stock")}: ${p.name} (${p.qty})`);
      return;
    }
    setCart((current) =>
      existing
        ? current.map((l) => (l.productId === p.id ? { ...l, qty } : l))
        : [...current, { productId: p.id, qty }],
    );
  };
  const list = useMemo(() => inventoryProducts(s, q), [s, q]);
  const onScan = (code: string) => {
    const p = erp.findByCode(s, code);
    if (p) {
      setQ(p.name);
      setOpen(p.id);
    } else onUnknown(code);
  };
  const openP = s.products.find((p) => p.id === open);
  return (
    <div>
      <InventorySearch q={q} setQ={setQ} onScan={onScan} tr={tr} />
      <div className="inventory-list-panel">
        {list.length === 0 && <Empty>{q ? tr("No matching products") : tr("No products yet")}</Empty>}
        <div className="pos-head">
          <span>{tr("Product")}</span>
          <span className="text-center">{tr("Stock")}</span>
          <span className="text-end">{tr("Price")}</span>
          <span />
        </div>
        {list.map((p) => {
          const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0;
          return (
            <div key={p.id} className={cn("pos-row", inCart > 0 && "pos-row-on")}>
              <ShopButton
                variant="bare"
                className="flex h-auto min-w-0 items-center justify-start gap-1.5 p-0 text-start text-[11px] font-normal"
                aria-label={`${tr("Add")} ${p.name}`}
                disabled={p.qty <= 0}
                onClick={() => add(p)}
              >
                <StockDot p={p} />
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                {inCart > 0 && <span className="pos-chip">×{inCart}</span>}
              </ShopButton>
              <span className="text-center tabular-nums">{p.qty}</span>
              <span className="text-end tabular-nums">{Math.round(p.sell).toLocaleString("en-KE")}</span>
              <ShopButton
                variant="bare"
                className="pos-add h-[22px] w-[22px] p-0"
                aria-label={`${tr("Product")} ${p.name}`}
                title={tr("More details")}
                onClick={() => setOpen(p.id)}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </ShopButton>
            </div>
          );
        })}
      </div>
      {openP && <ProductSheet p={openP} s={s} money={money} tr={tr} onClose={() => setOpen(null)} />}
      {cart.length > 0 && (
        <ShopButton
          variant="bare"
          className="pos-fab"
          aria-label={`${tr("Cart")} (${cart.length})`}
          onClick={() => setStep("cart")}
        >
          <ShoppingCart className="h-6 w-6" />
          <span className="pos-fab-count">{cart.length}</span>
        </ShopButton>
      )}
      {step === "cart" && (
        <CartCheckout
          s={s}
          cart={cart}
          money={money}
          tr={tr}
          channel="Sales"
          setLine={(line) => setCart((current) => current.map((l) => (l.productId === line.productId ? line : l)))}
          remove={(id) => setCart((current) => current.filter((l) => l.productId !== id))}
          clear={() => {
            setCart([]);
            clearDraft();
            setStep(null);
          }}
          back={() => setStep(null)}
          saveDraft={saveDraft}
          onDone={(sale) => {
            setCart([]);
            clearDraft();
            setStep(null);
            setReceipt(sale);
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
  const [sell, setSell] = useState(String(p.sell));
  const [buy, setBuy] = useState(String(p.buy));
  const [min, setMin] = useState(String(p.minStock ?? 5));
  const moves = s.movements.filter((m) => m.productId === p.id).slice(0, 8);
  const cat = s.categories.find((c) => c.id === p.categoryId)?.name;
  const brand = s.brands.find((c) => c.id === p.brandId)?.name;
  const variants = (p as unknown as { variants?: { id: string; name: string; qty: number }[] }).variants ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto inventory-sheet border border-border bg-card p-4 rounded-t-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {[p.sku, p.barcode, cat, brand].filter(Boolean).join(" • ")}
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

        {variants.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Sizes / Variants")}
              </span>
              <span className="text-[10px] font-semibold text-primary">
                {variants.length} {tr("sizes")}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {variants.map((v) => (
                <div key={v.id} className="rounded border border-border/50 bg-background/80 px-2 py-1 text-center">
                  <p className="text-[10px] font-medium truncate text-foreground">{v.name}</p>
                  <b className="text-xs text-primary">{v.qty}</b>
                </div>
              ))}
            </div>
          </div>
        )}

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

        <div className="mt-3 flex gap-2">
          <ShopButton
            className="flex-1"
            onClick={() =>
              run(() => erp.updateProduct(p.id, { buy: +buy || 0, sell: +sell || 0, minStock: +min || 0 }), tr("Saved"))
            }
          >
            {tr("Save")}
          </ShopButton>
          <ShopButton
            variant="outline"
            className="w-14"
            aria-label={tr("Delete")}
            onClick={() => {
              if (confirm(tr("Delete this product?")) && run(() => erp.deleteProduct(p.id), tr("Deleted"))) onClose();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </ShopButton>
        </div>

        <Title>{tr("History")}</Title>
        {moves.length ? (
          moves.map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />)
        ) : (
          <Empty>{tr("No movements yet")}</Empty>
        )}
      </div>
    </div>
  );
}

type SizeDraft = { id: string; name: string; qty: string };

const SIZE_PRESETS = [
  { label: "46–56", sizes: ["46", "48", "50", "52", "54", "56"] },
  { label: "58–68", sizes: ["58", "60", "62", "64", "66", "68"] },
  { label: "S–3XL", sizes: ["S", "M", "L", "XL", "XXL", "3XL"] },
];

function AddProduct({ s, tr, barcode, done }: Ctx & { barcode: string; done: () => void }) {
  const [f, setF] = useState({
    name: "",
    buy: "0",
    sell: "0",
    qty: "0",
    categoryId: "",
    brandId: "",
    sku: "",
    barcode,
    unit: "Piece",
    minStock: "5",
  });
  const [adv, setAdv] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<SizeDraft[]>([]);
  const [customSize, setCustomSize] = useState("");

  useEffect(() => {
    setF((x) => ({ ...x, barcode }));
  }, [barcode]);

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [key]: e.target.value }));

  const applyPreset = (sizes: string[]) => {
    setVariants(sizes.map((sz) => ({ id: sz, name: `Size ${sz}`, qty: "0" })));
  };

  const updateVariantQty = (id: string, qty: string) => {
    setVariants((curr) => curr.map((v) => (v.id === id ? { ...v, qty } : v)));
  };

  const removeVariant = (id: string) => {
    setVariants((curr) => curr.filter((v) => v.id !== id));
  };

  const addCustomSize = () => {
    const trimmed = customSize.trim();
    if (!trimmed) return;
    if (variants.some((v) => v.id.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(tr("Size already exists"));
      return;
    }
    setVariants((curr) => [...curr, { id: trimmed, name: `Size ${trimmed}`, qty: "0" }]);
    setCustomSize("");
  };

  const totalVariantQty = useMemo(() => {
    return variants.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
  }, [variants]);

  const save = () => {
    const finalQty = hasVariants && variants.length > 0 ? totalVariantQty : Number(f.qty);
    const newProductData = {
      name: f.name.trim(),
      buy: Number(f.buy),
      sell: Number(f.sell),
      qty: finalQty,
      categoryId: f.categoryId || undefined,
      brandId: f.brandId || undefined,
      sku: f.sku.trim() || undefined,
      barcode: f.barcode.trim() || undefined,
      unit: f.unit,
      minStock: Number(f.minStock),
      ...(hasVariants && variants.length > 0
        ? { variants: variants.map((v) => ({ id: v.id, name: v.name, qty: Number(v.qty) || 0 })) }
        : {}),
    };

    return run(() => erp.addProduct(newProductData as erp.NewProduct), tr("Product added")) && done();
  };

  return (
    <div className="h-full flex flex-col justify-between max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="inventory-form-title text-xs font-bold uppercase tracking-wider">{tr("Add Product")}</h2>
        {hasVariants && (
          <span className="text-[11px] font-semibold text-primary">
            {tr("Total Stock")}: <b>{totalVariantQty}</b>
          </span>
        )}
      </div>

      <form
        className="inventory-form space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* Row 1: Product Name */}
        <InventoryField label={tr("Product name")} required>
          <input
            aria-label={tr("Product name")}
            placeholder={tr("Enter product name (e.g. Italian Wool Suit)")}
            value={f.name}
            onChange={set("name")}
            className={inventoryInput}
            required
          />
        </InventoryField>

        {/* Row 2: Buying Price & Selling Price */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Buying price")} required>
            <input
              aria-label={tr("Buying price")}
              type="number"
              min="0"
              step="any"
              value={f.buy}
              onChange={set("buy")}
              className={inventoryInput}
              required
            />
          </InventoryField>
          <InventoryField label={tr("Selling price")} required>
            <input
              aria-label={tr("Selling price")}
              type="number"
              min="0"
              step="any"
              value={f.sell}
              onChange={set("sell")}
              className={inventoryInput}
              required
            />
          </InventoryField>
        </div>

        {/* Option 1: Sizes / Variants Toggle */}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground">
              {tr("Has Sizes / Variants (e.g. Suits 46-56, 58-68)")}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={hasVariants}
                onChange={(e) => {
                  setHasVariants(e.target.checked);
                  if (e.target.checked && variants.length === 0) {
                    applyPreset(SIZE_PRESETS[1].sizes); // default to 58-68
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>

          {hasVariants ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground mr-1">{tr("Presets")}:</span>
                {SIZE_PRESETS.map((p) => (
                  <ShopButton
                    key={p.label}
                    type="button"
                    variant="outline"
                    className="h-6 px-2 text-[10px] rounded"
                    onClick={() => applyPreset(p.sizes)}
                  >
                    {p.label}
                  </ShopButton>
                ))}
              </div>

              {/* Per-size stock inputs */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                {variants.map((v) => (
                  <div key={v.id} className="relative rounded border border-border/60 bg-background/90 p-1 text-center">
                    <span className="block text-[10px] font-bold text-muted-foreground">{v.id}</span>
                    <input
                      type="number"
                      min="0"
                      value={v.qty}
                      onChange={(e) => updateVariantQty(v.id, e.target.value)}
                      className="w-full text-center text-xs font-bold py-0.5 rounded border border-input/60 bg-transparent tabular-nums"
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(v.id)}
                      className="absolute -top-1 -right-1 text-muted-foreground hover:text-destructive text-[10px] leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Add custom size */}
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder={tr("Add size (e.g. 70 or 38)")}
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  className="h-6 text-xs px-2 flex-1 rounded border border-input bg-background"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSize();
                    }
                  }}
                />
                <ShopButton type="button" variant="outline" className="h-6 px-2 text-[10px]" onClick={addCustomSize}>
                  {tr("+ Add")}
                </ShopButton>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <InventoryField label={tr("Quantity")} required>
                <input
                  aria-label={tr("Quantity")}
                  type="number"
                  min="0"
                  step="any"
                  value={f.qty}
                  onChange={set("qty")}
                  className={inventoryInput}
                  required
                />
              </InventoryField>
              <InventoryField label={tr("Unit")}>
                <select aria-label={tr("Unit")} className={inventoryInput} value={f.unit} onChange={set("unit")}>
                  {["Piece", "Box", "Pack", "Kg", "Gram", "Litre", "Metre", "Yard"].map((u) => (
                    <option key={u} value={u}>
                      {tr(u)}
                    </option>
                  ))}
                </select>
              </InventoryField>
            </div>
          )}
        </div>

        {/* Row 4: Category & Brand */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField group label={tr("Category")}>
            <SearchPicker
              tr={tr}
              items={s.categories.map((c) => ({ id: c.id, label: c.name }))}
              value={f.categoryId}
              onChange={(v) => setF((x) => ({ ...x, categoryId: v }))}
              noneLabel={tr("No category")}
              placeholder={tr("Select category")}
              addLabel={tr("Add Category")}
              onAdd={(n) => runPick(() => erp.addNamed("categories", n))}
            />
          </InventoryField>
          <InventoryField group label={tr("Brand")}>
            <SearchPicker
              tr={tr}
              items={s.brands.map((c) => ({ id: c.id, label: c.name }))}
              value={f.brandId}
              onChange={(v) => setF((x) => ({ ...x, brandId: v }))}
              noneLabel={tr("No brand")}
              placeholder={tr("Select brand")}
              addLabel={tr("Add Brand")}
              onAdd={(n) => runPick(() => erp.addNamed("brands", n))}
            />
          </InventoryField>
        </div>

        {/* Row 5: Barcode */}
        <InventoryField label={tr("Barcode")}>
          <BarcodeField value={f.barcode} onChange={(v) => setF((x) => ({ ...x, barcode: v }))} tr={tr} />
        </InventoryField>

        {/* Collapsible Details */}
        <ShopButton
          variant="bare"
          type="button"
          className="h-auto w-auto justify-start p-0 text-[10px] text-primary"
          onClick={() => setAdv(!adv)}
        >
          {tr("More details (SKU & Reorder)")}
          <ChevronDown className={cn("h-3 w-3 transition-transform", adv && "rotate-180")} />
        </ShopButton>

        {adv && (
          <div className="grid grid-cols-2 gap-2">
            <InventoryField label={tr("SKU")}>
              <input className={inventoryInput} value={f.sku} onChange={set("sku")} placeholder={tr("Auto")} />
            </InventoryField>
            <InventoryField label={tr("Reorder level")}>
              <input type="number" min="0" className={inventoryInput} value={f.minStock} onChange={set("minStock")} />
            </InventoryField>
          </div>
        )}

        {/* Submit */}
        <ShopButton type="submit" className="inventory-save w-full mt-2">
          {tr("Save Product")}
        </ShopButton>
      </form>
    </div>
  );
}

function NamedList({ s, tr, kind, go }: Ctx & { kind: "categories" | "brands" }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const list = s[kind].filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <InventorySearch
          q={q}
          setQ={setQ}
          tr={tr}
          placeholder={kind === "brands" ? "Search brands..." : "Search categories..."}
        />
        <ShopButton className="inventory-add-named" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3" />
          {tr(kind === "brands" ? "Add Brand" : "Add Category")}
        </ShopButton>
      </div>
      {adding && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (run(() => erp.addNamed(kind, name), tr("Added"))) {
              setName("");
              setAdding(false);
            }
          }}
        >
          <input
            aria-label={tr("Name")}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inventoryInput}
          />
          <ShopButton type="submit" className="inventory-add-named">
            {tr("Save")}
          </ShopButton>
        </form>
      )}
      <div className="inventory-list-panel">
        {!list.length && <Empty>{tr("Nothing here yet")}</Empty>}
        {list.map((c) => {
          const n = s.products.filter((p) => (kind === "brands" ? p.brandId : p.categoryId) === c.id).length;
          return (
            <div key={c.id} className="inventory-named-row">
              {edit?.id === c.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (run(() => erp.renameNamed(kind, c.id, edit.name), tr("Saved"))) setEdit(null);
                  }}
                >
                  <input
                    className={inventoryInput}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                  <ShopButton className="inventory-add-named">{tr("Save")}</ShopButton>
                </form>
              ) : (
                <ShopButton
                  variant="bare"
                  className="inventory-named-open"
                  onClick={() => {
                    go("products", "All Products");
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {kind === "categories" && (
                      <span className="inventory-category-icon">
                        <Layers className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate">{c.name}</p>
                      <p className="text-[10px] font-normal text-muted-foreground">
                        ({n} {tr("products")})
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </ShopButton>
              )}
              <div className="relative">
                <ShopButton
                  variant="bare"
                  className="inventory-icon-button"
                  aria-label={`${tr("Edit")} ${c.name}`}
                  title={tr("Edit")}
                  onClick={() => setEdit(edit?.id === c.id ? null : { id: c.id, name: c.name })}
                >
                  <MoreVertical className="h-4 w-4" />
                </ShopButton>
                {edit?.id === c.id && (
                  <ShopButton
                    variant="bare"
                    className="inventory-icon-button text-destructive"
                    aria-label={`${tr("Delete")} ${c.name}`}
                    onClick={() => {
                      if (confirm(tr("Delete") + " " + c.name + "?"))
                        run(() => erp.removeNamed(kind, c.id), tr("Deleted"));
                      setEdit(null);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </ShopButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductExport({ s, money, tr }: Ctx) {
  const [ai, setAi] = useState(false);
  const exportProducts = () => {
    const quote = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
    const rows = [
      ["Product", "Buying price", "Selling price", "Stock", "Reorder", "SKU", "Barcode", "Unit"],
      ...s.products.map((p) => [
        p.name,
        p.buy,
        p.sell,
        p.qty,
        p.minStock ?? 5,
        p.sku ?? "",
        p.barcode ?? "",
        p.unit ?? "",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "SHOPBOOK-products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <ShopButton className="inventory-save" onClick={exportProducts}>
        {tr("Export")}
      </ShopButton>
      <ShopButton variant="outline" className="inventory-save" onClick={() => setAi(!ai)}>
        {tr("AI Reorder")}
      </ShopButton>
      {ai && <Reorder s={s} money={money} />}
    </div>
  );
}

function StockLevels({ s, tr, onUnknown }: Ctx) {
  const [q, setQ] = useState("");
  const list = inventoryProducts(s, q);
  return (
    <div>
      <InventorySearch
        q={q}
        setQ={setQ}
        onScan={(code) => {
          const p = erp.findByCode(s, code);
          if (p) setQ(p.name);
          else onUnknown?.(code);
        }}
        tr={tr}
      />
      <div className="inventory-list-panel">
        <div className="inventory-stock-row text-[9px] font-semibold uppercase text-muted-foreground">
          <span>{tr("Product")}</span>
          <span>{tr("Stock")}</span>
          <span>{tr("Reorder")}</span>
        </div>
        {!list.length && <Empty>{tr("No products yet")}</Empty>}
        {list.map((p) => (
          <div key={p.id} className="inventory-stock-row">
            <span className="flex min-w-0 items-center gap-2">
              <StockDot p={p} />
              <span className="truncate">{p.name}</span>
            </span>
            <b
              className={cn(
                erp.stockStatus(p) === "OK"
                  ? "text-primary"
                  : erp.stockStatus(p) === "LOW"
                    ? "text-warning"
                    : "text-destructive",
              )}
            >
              {p.qty}
            </b>
            <span>{p.minStock ?? 5}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const REASONS = {
  "Stock In": ["Purchase", "Manual entry", "Received Transfer"],
  "Stock Out": ["Adjustment", "Damaged", "Own use", "Other"],
  Adjustments: ["Physical stock count", "Damaged", "Lost", "Other"],
};

function StockForm({ s, tr, mode }: Ctx & { mode: "Stock In" | "Stock Out" | "Adjustments" }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string>(REASONS[mode][0] ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setReason(REASONS[mode][0] ?? "");
    setQty("");
    setReference("");
    setNotes("");
  }, [mode]);
  const p = s.products.find((p) => p.id === pid);
  const adj = mode === "Adjustments";
  const submit = () => {
    if (!pid) {
      toast.error(tr("Select a product"));
      return;
    }
    const detail = [reason, reference, notes].filter(Boolean).join(" • ");
    if (
      run(
        () =>
          mode === "Stock In"
            ? erp.stockIn(pid, Number(qty), detail)
            : mode === "Stock Out"
              ? erp.stockOut(pid, Number(qty), detail)
              : erp.adjustStock(pid, Number(qty), detail),
        tr("Recorded"),
      )
    ) {
      setQty("");
      setReference("");
      setNotes("");
    }
  };
  return (
    <>
      <h2 className="inventory-form-title">
        {tr(adj ? "Stock Adjustment" : mode === "Stock In" ? "New Stock In" : "New Stock Out")}
      </h2>
      <form
        className="inventory-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!adj && (
          <InventoryField label={tr("Source")} required>
            <select
              aria-label={tr("Source")}
              className={inventoryInput}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS[mode].map((r) => (
                <option key={r}>{tr(r)}</option>
              ))}
            </select>
          </InventoryField>
        )}
        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>
        {adj ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InventoryField label={tr("Current stock")}>
                <input readOnly className={inventoryInput} value={p?.qty ?? ""} />
              </InventoryField>
              <InventoryField label={tr("Physical count")} required>
                <input
                  aria-label={tr("Physical count")}
                  required
                  type="number"
                  min="0"
                  step="any"
                  className={inventoryInput}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </InventoryField>
            </div>
            <InventoryField label={tr("Adjustment")}>
              <input
                className={cn(inventoryInput, p && Number(qty) < p.qty ? "text-destructive" : "text-primary")}
                readOnly
                value={p && qty !== "" ? `${Number(qty) - p.qty > 0 ? "+" : ""}${Number(qty) - p.qty}` : ""}
              />
            </InventoryField>
            <InventoryField label={tr("Reason")} required>
              <select
                aria-label={tr("Reason")}
                className={inventoryInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.Adjustments.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </select>
            </InventoryField>
          </>
        ) : (
          <>
            <InventoryField label={tr("Quantity")} required>
              <input
                aria-label={tr("Quantity")}
                type="number"
                min="0.001"
                step="any"
                required
                className={inventoryInput}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />
            </InventoryField>
            <InventoryField label={tr("Reference (Optional)")}>
              <input
                aria-label={tr("Reference (Optional)")}
                className={inventoryInput}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </InventoryField>
          </>
        )}
        <InventoryField label={tr("Notes (Optional)")}>
          <input
            aria-label={tr("Notes (Optional)")}
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Enter notes...")}
          />
        </InventoryField>
        <ShopButton type="submit" className="inventory-save">
          {tr(adj ? "Save Adjustment" : mode === "Stock In" ? "Save Stock In" : "Save Stock Out")}
        </ShopButton>
      </form>
    </>
  );
}

function History({ s, tr }: Ctx) {
  return (
    <div>
      {s.movements.length ? (
        s.movements.slice(0, 200).map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />)
      ) : (
        <Empty>{tr("No movements yet")}</Empty>
      )}
    </div>
  );
}

function Transfers({ s, tr, view, shop }: Ctx & { view: string }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [to, setTo] = useState("");
  const name = (id: string) => s.products.find((p) => p.id === id)?.name ?? "—";
  if (view === "New Transfer")
    return (
      <>
        <h2 className="inventory-form-title">{tr("New Transfer")}</h2>
        <form
          className="inventory-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pid) {
              toast.error(tr("Select a product"));
              return;
            }
            if (run(() => erp.createTransfer(pid, Number(qty), to, shop), tr("Transfer created"))) {
              setQty("");
              setTo("");
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <InventoryField label={tr("From Location")} required>
              <select className={inventoryInput} value={shop}>
                <option>{shop}</option>
              </select>
            </InventoryField>
            <InventoryField label={tr("To Location")} required>
              <input
                aria-label={tr("To Location")}
                className={inventoryInput}
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder={tr("To shop / branch")}
              />
            </InventoryField>
          </div>
          <InventoryField label={tr("Product")} required>
            <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
          </InventoryField>
          <InventoryField label={tr("Quantity")} required>
            <input
              aria-label={tr("Quantity")}
              className={inventoryInput}
              type="number"
              min="1"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <ShopButton className="inventory-save" type="submit">
            {tr("Create Transfer")}
          </ShopButton>
        </form>
      </>
    );
  const list = s.transfers.filter((t) =>
    view === "Pending"
      ? t.status === "PENDING" || t.status === "SENT"
      : view === "Received"
        ? t.status === "RECEIVED"
        : true,
  );
  return (
    <div>
      {list.length === 0 && <Empty>{tr("No transfers")}</Empty>}
      {list.map((t) => (
        <div key={t.id} className="border-b border-border py-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              {t.ref} • {name(t.productId)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">{tr(t.status)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {dt(t.at)} • {t.qty} • {t.from} → {t.to}
          </p>
          {(t.status === "PENDING" || t.status === "SENT") && (
            <div className="mt-2 flex gap-2">
              {t.status === "PENDING" && (
                <ShopButton className="h-9 text-sm" onClick={() => run(() => erp.sendTransfer(t.id), tr("Sent"))}>
                  {tr("Send")}
                </ShopButton>
              )}
              {t.status === "SENT" && (
                <ShopButton
                  className="h-9 text-sm"
                  onClick={() => run(() => erp.receiveTransfer(t.id), tr("Received"))}
                >
                  {tr("Mark received")}
                </ShopButton>
              )}
              <ShopButton
                variant="outline"
                className="h-9 text-sm"
                onClick={() => run(() => erp.cancelTransfer(t.id), tr("Cancelled"))}
              >
                {tr("Cancel")}
              </ShopButton>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Reports({ s, money, tr, view }: Ctx & { view: string }) {
  if (view === "AI Reorder") return <Reorder s={s} money={money} />;
  if (view === "Valuation") {
    const cost = s.products.reduce((a, p) => a + p.qty * p.buy, 0);
    const sell = s.products.reduce((a, p) => a + p.qty * p.sell, 0);
    return (
      <div>
        <KpiRow>
          <Kpi label={tr("Cost value")} value={money(cost)} />
          <Kpi label={tr("Selling value")} value={money(sell)} />
        </KpiRow>
        <p className="mt-2 text-xs text-muted-foreground">
          {tr("Potential profit")}: <b className="text-foreground">{money(sell - cost)}</b>
        </p>
        {s.products.map((p) => (
          <div key={p.id} className="flex justify-between border-b border-border py-1.5 text-xs">
            <span className="truncate">
              {p.name} <span className="text-xs text-muted-foreground">× {p.qty}</span>
            </span>
            <span>{money(p.qty * p.buy)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (view === "Movement") {
    const by = new Map<string, { in: number; out: number }>();
    s.movements.forEach((m) => {
      const x = by.get(m.type) ?? { in: 0, out: 0 };
      if (m.qty > 0) x.in += m.qty;
      else x.out -= m.qty;
      by.set(m.type, x);
    });
    return (
      <div>
        {by.size === 0 && <Empty>{tr("No movements yet")}</Empty>}
        {[...by].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-border py-1.5 text-xs">
            <span>{tr(k)}</span>
            <span>
              <span className="text-primary">+{v.in}</span> / <span className="text-destructive">-{v.out}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (view === "Performance") {
    const out = new Map<string, number>();
    s.movements
      .filter((m) => m.type === "SALE" || m.type === "STOCK OUT")
      .forEach((m) => out.set(m.productId, (out.get(m.productId) ?? 0) - m.qty));
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
