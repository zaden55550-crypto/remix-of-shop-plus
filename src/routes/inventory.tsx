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
  Search,
  ScanLine,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  Truck,
  SlidersHorizontal,
  Settings2,
  Download,
  AlertTriangle,
  Building2,
  ShieldAlert,
} from "lucide-react";
import { findByCurrency } from "@/lib/world-data";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { store, canOpen, APPS, type Account } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/components/shopbook/ui";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";
import { lastBackup } from "@/lib/backup";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { useErp } from "@/components/shopbook/product-search";
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
        content: "Products, stock levels, stock in/out, customer and supplier returns, transfers and configuration.",
      },
      { property: "og:title", content: "Inventory — SHOPBOOK ERP" },
      { property: "og:description", content: "The single source of truth for products and stock in SHOPBOOK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventory,
});

/** 4-Menu Architecture matching specification */
const MENUS = {
  overview: [],
  "products & stock": ["All Products", "Add Product", "Stock In", "Stock Out", "Stock History", "Adjustments"],
  "returns & transfers": ["Customer Returns", "Supplier Returns", "New Transfer", "Transfer History"],
  configuration: ["Product Setup", "Stock Setup"],
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
  new Date(n).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

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
/** Universal currency symbol resolver for all global currencies */
function toCurrencySymbol(code?: string): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();

  // 1. Regional East African standard notations
  if (upper === "KES" || upper === "KSH" || code === "KSh") return "KSh";
  if (upper === "UGX" || upper === "USH" || code === "USh") return "USh";
  if (upper === "TZS" || upper === "TSH" || code === "TSh") return "TSh";
  if (upper === "RWF" || code === "FRw") return "FRw";
  if (upper === "SOS" || upper === "SH.SO." || code === "Sh.So.") return "Sh.So.";

  // 2. Project curated world currency symbols (150+ countries)
  const fromWorld = findByCurrency(upper);
  if (fromWorld?.currencySymbol) return fromWorld.currencySymbol;

  // 3. Native Intl engine covering all remaining global ISO currencies ($ for USD, € for EUR, ¥, ₹, etc.)
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(1);
    const sym = parts.find((p) => p.type === "currency")?.value;
    if (sym && sym !== upper) return sym;

    const partsFallback = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
      currencyDisplay: "symbol",
    }).formatToParts(1);
    const symFallback = partsFallback.find((p) => p.type === "currency")?.value;
    if (symFallback) return symFallback;
  } catch {
    // If an unknown string is provided, fall back cleanly
  }

  return code;
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
  tone?: "info" | "good" | "warn" | "bad";
  size?: "sm" | "md" | "lg" | "xs";
}) {
  const formatted = compactFmt(value);
  const isLarge = formatted.length > 7;
  const isHuge = formatted.length > 10;
  const symbol = curr ? toCurrencySymbol(curr) : undefined;
  const toneClass = cn(
    tone === "info" && "text-sky-500 dark:text-sky-400",
    tone === "good" && "text-emerald-500 dark:text-emerald-400",
    tone === "warn" && "text-amber-500 dark:text-amber-400",
    tone === "bad" && "text-rose-500 dark:text-rose-400",
    !tone && "text-foreground",
  );

  return (
    <div className="flex items-start gap-0.5 leading-none min-w-0 max-w-full">
      <span
        className={cn(
          "font-extrabold tracking-tight tabular-nums truncate",
          toneClass,
          size === "xs" && "text-xs",
          size === "sm" && "text-sm",
          size === "md" && (isHuge ? "text-sm" : isLarge ? "text-base" : "text-lg"),
          size === "lg" && (isHuge ? "text-base" : isLarge ? "text-lg" : "text-xl"),
        )}
      >
        {formatted}
      </span>
      {symbol && (
        <sup
          className={cn(
            "font-semibold shrink-0 select-none ml-0.5 relative top-0 leading-tight",
            toneClass,
            size === "xs" && "text-[7px]",
            size === "sm" && "text-[8px]",
            size === "md" && "text-[9px]",
            size === "lg" && "text-[10px]",
          )}
        >
          {symbol}
        </sup>
      )}
    </div>
  );
}

function Inventory() {
  const nav = useNavigate();
  const { tr } = useLanguage();
  const { dark, toggle: toggleTheme } = useTheme();
  const theme = dark ? "dark" : "light";
  const [acct, setAcct] = useState<Account | null>(null);
  const [menu, setMenu] = useState<Menu>("overview");
  const [sub, setSub] = useState<string>("");
  const [prefillBarcode, setPrefill] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarRange, setCalendarRange] = useState<"today" | "week" | "month" | "all">("today");
  const [showShopMenu, setShowShopMenu] = useState(false);

  useEffect(() => {
    const a = store.get();
    if (!a) {
      nav({ to: "/" });
      return;
    }
    if (!canOpen(a, "basic")) {
      toast.error(tr("Upgrade to access Inventory"));
      nav({ to: "/apps" });
      return;
    }
    setAcct(a);
  }, [nav]);

  const s = useErp();
  const cur = acct?.currency || "USD";
  const money = (n: number) =>
    `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    shop: acct?.shopName || "Main Shop",
    onUnknown: (code: string) => {
      setPrefill(code);
      go("products & stock", "Add Product");
    },
  };

  const shopInitials =
    (acct?.shopName || "SB")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "SB";

  return (
    <main className="inventory-screen app-screen flex flex-col min-h-screen">
      {/* 1. RESTORED PREVIOUS HEADER */}
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

        {/* Center: Inventory title on top, Shop name below */}
        <div className="flex flex-col items-center justify-center min-w-0 px-2 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground leading-tight truncate">
            {tr("Inventory")}
          </span>
          <span className="text-[10px] text-muted-foreground truncate leading-tight">{acct?.shopName}</span>
        </div>

        {/* Right: Theme toggle, Calendar filter, Avatar */}
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
            aria-label={acct?.shopName}
            title={acct?.shopName}
          >
            {shopInitials}
          </ShopButton>

          {showShopMenu && (
            <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-lg text-xs space-y-1">
              <div className="px-2 py-1 border-b border-border/50 font-bold truncate">{acct?.shopName}</div>
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

      {/* 2. 4 MAIN NAVIGATION MENUS & SUBMENUS */}
      <nav aria-label={tr("Inventory navigation")} className="inventory-nav-wrap">
        <Tabs
          items={Object.keys(MENUS)}
          value={menu}
          onChange={(k) => go(k as Menu)}
          label={(k) =>
            k === "overview"
              ? tr("Overview")
              : k === "products & stock"
                ? tr("Products & Stock")
                : k === "returns & transfers"
                  ? tr("Returns & Transfers")
                  : tr("Configuration")
          }
        />
        {MENUS[menu].length > 0 && (
          <Tabs small items={[...MENUS[menu]]} value={sub} onChange={setSub} label={(k) => tr(k)} />
        )}
      </nav>

      {/* 3. WORKING CONTENT CANVAS (All screens & workflows preserved) */}
      <section className="inventory-content flex-1">
        {/* Menu 1: Overview */}
        {menu === "overview" && <Overview {...ctx} />}

        {/* Menu 2: Products & Stock */}
        {menu === "products & stock" && sub === "All Products" && (
          <ProductList
            {...ctx}
            onUnknown={(code) => {
              setPrefill(code);
              setSub("Add Product");
            }}
          />
        )}
        {menu === "products & stock" && sub === "Add Product" && (
          <AddProduct
            {...ctx}
            barcode={prefillBarcode}
            done={() => {
              setPrefill("");
              setSub("All Products");
            }}
          />
        )}
        {menu === "products & stock" && sub === "Stock In" && <StockInScreen {...ctx} />}
        {menu === "products & stock" && sub === "Stock Out" && <StockOutScreen {...ctx} />}
        {menu === "products & stock" && sub === "Stock History" && <StockHistoryScreen {...ctx} />}
        {menu === "products & stock" && sub === "Adjustments" && <AdjustmentsScreen {...ctx} />}

        {/* Menu 3: Returns & Transfers */}
        {menu === "returns & transfers" && sub === "Customer Returns" && <CustomerReturnsScreen {...ctx} />}
        {menu === "returns & transfers" && sub === "Supplier Returns" && <SupplierReturnsScreen {...ctx} />}
        {menu === "returns & transfers" && sub === "New Transfer" && <NewTransferScreen {...ctx} />}
        {menu === "returns & transfers" && sub === "Transfer History" && <TransferHistoryScreen {...ctx} />}

        {/* Menu 4: Configuration */}
        {menu === "configuration" && sub === "Product Setup" && <ProductSetupScreen {...ctx} />}
        {menu === "configuration" && sub === "Stock Setup" && <StockSetupScreen {...ctx} />}
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
  acct?: Account | null;
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
        "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0",
        st === "OK" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
        st === "LOW" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
        st === "OUT" && "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30",
      )}
    >
      {st}
    </span>
  );
}

function Box({ title, sub, extra, children }: { title: string; sub?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="inventory-box rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3 sm:p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm sm:text-base text-foreground tracking-tight">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}
function Empty({ children, compact }: { children: ReactNode; compact?: boolean }) {
  if (compact) {
    return (
      <div className="py-2.5 text-center text-xs text-muted-foreground/80 font-medium flex items-center justify-center gap-1.5">
        <ArchiveX className="w-3.5 h-3.5 stroke-1 text-muted-foreground/50 shrink-0" />
        <span>{children}</span>
      </div>
    );
  }
  return (
    <div className="py-3 sm:py-4 text-center text-xs text-muted-foreground font-medium flex flex-col items-center justify-center gap-1">
      <ArchiveX className="w-5 h-5 stroke-1 text-muted-foreground/60 mb-0.5" />
      {children}
    </div>
  );
}

/* =========================================================================
   1. OVERVIEW
   ========================================================================= */

function Overview({ s, money, tr, go, cur }: Ctx) {
  const totalProducts = s.products.length;
  const totalStockVal = s.products.reduce((acc, p) => acc + (p.qty || 0) * (p.buy || 0), 0);
  const lowStock = s.products.filter((p) => erp.stockStatus(p) === "LOW");
  const outOfStock = s.products.filter((p) => (p.qty || 0) <= 0);

  const recentIn = s.movements.filter((m) => m.qty > 0).slice(0, 5);
  const recentOut = s.movements.filter((m) => m.qty < 0 && m.type !== "SALE").slice(0, 5);

  return (
    <div className="space-y-4">
      {/* 4 Separate KPI Cards in 1 Row */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
        {/* 1. Total Products (Sky Blue) */}
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 hover:border-primary/40 transition-colors min-w-0"
        >
          <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate block">
            {tr("Total Products")}
          </span>
          <div className="mt-1">
            <Amt value={totalProducts} tone="info" size="lg" />
          </div>
        </div>

        {/* 2. Stock Value (Emerald Green + Superscript Currency) */}
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 hover:border-primary/40 transition-colors min-w-0"
        >
          <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate block">
            {tr("Stock Value")}
          </span>
          <div className="mt-1">
            <Amt value={totalStockVal} curr={cur} tone="good" size="lg" />
          </div>
        </div>

        {/* 3. Low Stock (Amber Orange) */}
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 hover:border-primary/40 transition-colors min-w-0"
        >
          <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate block">
            {tr("Low Stock")}
          </span>
          <div className="mt-1">
            <Amt value={lowStock.length} tone="warn" size="lg" />
          </div>
        </div>

        {/* 4. Out of Stock (Rose Red) */}
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 hover:border-primary/40 transition-colors min-w-0"
        >
          <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate block">
            {tr("Out of Stock")}
          </span>
          <div className="mt-1">
            <Amt value={outOfStock.length} tone="bad" size="lg" />
          </div>
        </div>
      </div>

      {/* Recent Activity Grid (2 Columns on Top) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Box title={tr("Recent Stock In")} sub={tr("Goods received into inventory")}>
          {recentIn.length ? (
            <div className="divide-y divide-border/30">
              {recentIn.map((m) => (
                <div key={m.id} className="py-1.5 flex items-center justify-between text-xs gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <span className="font-medium text-foreground truncate">
                      {s.products.find((p) => p.id === m.productId)?.name || "—"}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {dt(m.at)} · {m.source}
                    </span>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">+{m.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty compact>{tr("No recent receipts")}</Empty>
          )}
        </Box>

        <Box title={tr("Recent Stock Out")} sub={tr("Non-sale inventory removals")}>
          {recentOut.length ? (
            <div className="divide-y divide-border/30">
              {recentOut.map((m) => (
                <div key={m.id} className="py-1.5 flex items-center justify-between text-xs gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <span className="font-medium text-foreground truncate">
                      {s.products.find((p) => p.id === m.productId)?.name || "—"}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {dt(m.at)} · {m.reason || m.type}
                    </span>
                  </div>
                  <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">-{m.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty compact>{tr("No non-sale write-offs")}</Empty>
          )}
        </Box>
      </div>

      {/* Low Stock Replenishment List (Below the 2 Columns) */}
      <Box
        title={tr("Low Stock Products")}
        sub={tr("Products that require immediate replenishment")}
        extra={
          <ShopButton
            variant="ghost"
            size="sm"
            onClick={() => go("products & stock", "Stock In")}
            className="text-xs font-semibold h-7"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {tr("Stock In")}
          </ShopButton>
        }
      >
        {lowStock.length || outOfStock.length ? (
          <div className="divide-y divide-border/30">
            {[...outOfStock, ...lowStock].slice(0, 6).map((p) => (
              <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("Available")}: {p.qty} {p.unit || "pcs"} · {tr("Reorder level")}: {p.minStock ?? 5}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Status p={p} />
                  <ShopButton
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => go("products & stock", "Stock In")}
                  >
                    {tr("Restock")}
                  </ShopButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty compact>{tr("All products are well stocked")}</Empty>
        )}
      </Box>
    </div>
  );
}

/* =========================================================================
   2. PRODUCTS & STOCK
   ========================================================================= */

/** 2.1 All Products */
function ProductList({ s, money, tr, shop, acct, onUnknown }: Ctx & { onUnknown: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<erp.Product | null>(null);

  const filtered = useMemo(() => {
    return s.products.filter((p) => {
      const matchQ = !q.trim() || [p.name, p.sku, p.barcode].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
      const matchCat = cat === "all" || p.categoryId === cat;
      const st = erp.stockStatus(p);
      const matchStatus = status === "all" || st === status;
      return matchQ && matchCat && matchStatus;
    });
  }, [s.products, q, cat, status]);

  const exportCSV = () => {
    const headers = ["Name,SKU,Barcode,Category,Stock,Buy Price,Sell Price,Status"];
    const rows = filtered.map((p) => {
      const c = s.categories.find((x) => x.id === p.categoryId)?.name || "";
      return `"${p.name}","${p.sku || ""}","${p.barcode || ""}","${c}",${p.qty},${p.buy},${p.sell},"${erp.stockStatus(p)}"`;
    });
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-products-${Date.now()}.csv`;
    link.click();
    toast.success(tr("Exported CSV"));
  };

  return (
    <div className="space-y-3">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <InventorySearch q={q} setQ={setQ} tr={tr} onScan={onUnknown} />
        </div>
        <div className="flex gap-2">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="inventory-input text-xs w-32">
            <option value="all">{tr("All Categories")}</option>
            {s.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="inventory-input text-xs w-28">
            <option value="all">{tr("All Status")}</option>
            <option value="OK">{tr("In Stock")}</option>
            <option value="LOW">{tr("Low Stock")}</option>
            <option value="OUT">{tr("Out of Stock")}</option>
          </select>
          <ShopButton
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="h-9 px-2 text-xs"
            title={tr("Export CSV")}
          >
            <Download className="w-4 h-4" />
          </ShopButton>
        </div>
      </div>

      {/* If unknown product typed */}
      {q.trim() && filtered.length === 0 && (
        <div className="p-3 rounded-xl bg-card/65 backdrop-blur-xl border border-dashed border-border flex items-center justify-between text-xs">
          <span>
            {tr("No product matches")} "<strong>{q}</strong>"
          </span>
          <ShopButton variant="primary" size="sm" onClick={() => onUnknown(q)} className="h-7 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            {tr("Add New Product")}
          </ShopButton>
        </div>
      )}

      {/* Compact Product List: Name (Left), Selling Price (Center), Quantity (Right) */}
      {filtered.length ? (
        <div className="rounded-xl border border-border/40 bg-card/65 backdrop-blur-xl divide-y divide-border/30 overflow-hidden shadow-sm">
          {filtered.map((p) => {
            const st = erp.stockStatus(p);
            const dotTone = st === "OK" ? "bg-emerald-500" : st === "LOW" ? "bg-amber-500" : "bg-rose-500";
            const sellPrice = p.sell > 0 ? money(p.sell) : "";

            return (
              <div
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer min-h-[36px]"
              >
                {/* 1. Left: Status dot & Product name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", dotTone)} />
                  <span className="font-bold text-foreground text-xs truncate max-w-[170px] sm:max-w-xs">{p.name}</span>
                </div>

                {/* 2. Center: Selling price if present, else blank */}
                <div className="flex-1 text-center shrink-0">
                  <span className="text-xs font-semibold text-foreground/90 tabular-nums">{sellPrice}</span>
                </div>

                {/* 3. Right: Quantity & unit (OK badge removed) */}
                <div className="flex-1 flex justify-end shrink-0 text-right">
                  <span className="font-extrabold text-xs text-foreground tabular-nums">
                    {p.qty} <span className="text-[9.5px] font-normal text-muted-foreground">{p.unit || "pcs"}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm p-4">
          <Empty>{tr("No products found")}</Empty>
        </div>
      )}

      {/* Product Detail Sheet */}
      {selectedProduct && (
        <ProductDetailSheet
          p={selectedProduct}
          s={s}
          money={money}
          tr={tr}
          isOwner={!!acct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}

/** 2.2 Add Product */
function AddProduct({ s, tr, barcode, done }: Ctx & { barcode: string; done: () => void }) {
  const [f, setF] = useState({
    name: "",
    buy: "0",
    sell: "0",
    qty: "0",
    categoryId: "",
    brandId: "",
    sku: "",
    barcode: barcode || "",
    unit: "Piece",
    minStock: "5",
  });

  const [showCategory, setShowCategory] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [showBarcode, setShowBarcode] = useState(Boolean(barcode));
  const [showSKU, setShowSKU] = useState(false);

  // Variant generator state
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<{ id: string; name: string; qty: string; sell?: string }[]>([]);
  const [fromSize, setFromSize] = useState("");
  const [toSize, setToSize] = useState("");
  const [stepSize, setStepSize] = useState("1");
  const [freeform, setFreeform] = useState("");

  const generateRange = () => {
    const from = parseInt(fromSize, 10);
    const to = parseInt(toSize, 10);
    const step = parseInt(stepSize, 10) || 1;
    if (isNaN(from) || isNaN(to) || from > to) {
      toast.error(tr("Enter valid from/to range"));
      return;
    }
    const added: typeof variants = [];
    for (let i = from; i <= to; i += step) {
      added.push({ id: String(i), name: `Size ${i}`, qty: "0" });
    }
    setVariants((prev) => [...prev, ...added]);
    setFromSize("");
    setToSize("");
  };

  const addFreeformTokens = () => {
    const tokens = freeform
      .split(/[,/ ]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tokens.length) return;
    setVariants((prev) => [...prev, ...tokens.map((t) => ({ id: t, name: `Size ${t}`, qty: "0" }))]);
    setFreeform("");
  };

  const totalVariantQty = useMemo(() => {
    return variants.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
  }, [variants]);

  const save = () => {
    if (!f.name.trim()) {
      toast.error(tr("Enter a product name"));
      return;
    }
    const finalQty = hasVariants && variants.length > 0 ? totalVariantQty : Number(f.qty);

    if (
      run(() => {
        erp.commit((state, c) => {
          const id = erp.uid();
          const p: erp.Product = {
            id,
            name: f.name.trim(),
            buy: Number(f.buy) || 0,
            sell: Number(f.sell) || 0,
            qty: 0,
            createdAt: Date.now(),
            categoryId: f.categoryId || undefined,
            brandId: f.brandId || undefined,
            sku: f.sku.trim() || undefined,
            barcode: f.barcode.trim() || undefined,
            unit: f.unit,
            minStock: Number(f.minStock) || 5,
            variants:
              hasVariants && variants.length > 0
                ? variants.map((v) => ({
                    id: v.id,
                    name: v.name,
                    qty: Number(v.qty) || 0,
                    sell: v.sell ? Number(v.sell) : undefined,
                  }))
                : undefined,
          };
          state.products.unshift(p);
          if (finalQty > 0) {
            c.move(id, "OPENING", finalQty, "Initial registration", c.nextRef("STK"));
          }
          c.audit("PRODUCT CREATED", p.name);
        });
      }, tr("Product registered successfully"))
    ) {
      done();
    }
  };

  return (
    <div className="w-full space-y-3 sm:space-y-3.5">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <h2 className="text-base font-bold text-foreground">{tr("Register New Product")}</h2>
        <div className="flex items-center gap-2">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            onClick={done}
            className="text-xs h-8 px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
          >
            {tr("Cancel")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="primary"
            size="sm"
            onClick={save}
            className="text-xs h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {tr("Save Product")}
          </ShopButton>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-4 shadow-sm">
        {/* ROW 1: Product Name, Quantity, and Unit in the same line on all screens */}
        <div className="grid grid-cols-12 gap-1.5 sm:gap-2">
          <div className="col-span-6">
            <InventoryField label={tr("Product Name")} required>
              <input
                className={inventoryInput}
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder={tr("e.g. Cotton T-Shirt, Milk 1L")}
                required
              />
            </InventoryField>
          </div>
          <div className="col-span-3">
            <InventoryField label={tr("Quantity")}>
              <input
                type="number"
                step="any"
                disabled={hasVariants}
                className={cn(inventoryInput, hasVariants && "opacity-60 bg-muted")}
                value={hasVariants ? totalVariantQty : f.qty}
                onChange={(e) => setF({ ...f, qty: e.target.value })}
              />
            </InventoryField>
          </div>
          <div className="col-span-3">
            <InventoryField label={tr("Unit")}>
              <select className={inventoryInput} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                <option value="Piece">{tr("Piece")}</option>
                <option value="Kg">{tr("Kg")}</option>
                <option value="Gram">{tr("Gram")}</option>
                <option value="Litre">{tr("Litre")}</option>
                <option value="Box">{tr("Box")}</option>
                <option value="Carton">{tr("Carton")}</option>
                <option value="Packet">{tr("Packet")}</option>
              </select>
            </InventoryField>
          </div>
        </div>

        {/* ROW 2: Buying Price & Selling Price below */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Buying Price")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={f.buy}
              onChange={(e) => setF({ ...f, buy: e.target.value })}
            />
          </InventoryField>
          <InventoryField label={tr("Selling Price")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={f.sell}
              onChange={(e) => setF({ ...f, sell: e.target.value })}
            />
          </InventoryField>
        </div>

        {/* ROW 3: Category, Brand, Barcode, SKU & Alert Level all in 1 row */}
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 pt-1 border-t border-border/30">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "text-[10px] sm:text-xs h-7.5 w-full px-0.5 sm:px-2 justify-center",
              showCategory && "bg-muted font-bold",
            )}
            onClick={() => setShowCategory(!showCategory)}
          >
            + {tr("Category")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "text-[10px] sm:text-xs h-7.5 w-full px-0.5 sm:px-2 justify-center",
              showBrand && "bg-muted font-bold",
            )}
            onClick={() => setShowBrand(!showBrand)}
          >
            + {tr("Brand")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "text-[10px] sm:text-xs h-7.5 w-full px-0.5 sm:px-2 justify-center",
              showBarcode && "bg-muted font-bold",
            )}
            onClick={() => setShowBarcode(!showBarcode)}
          >
            + {tr("Barcode")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "text-[10px] sm:text-xs h-7.5 w-full px-0.5 sm:px-2 justify-center",
              showSKU && "bg-muted font-bold",
            )}
            onClick={() => setShowSKU(!showSKU)}
          >
            + {tr("SKU & Alert")}
          </ShopButton>
        </div>

        {/* Expandable Optional Fields */}
        {showCategory && (
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
            <InventoryField label={tr("Category")}>
              <select
                className={inventoryInput}
                value={f.categoryId}
                onChange={(e) => setF({ ...f, categoryId: e.target.value })}
              >
                <option value="">{tr("— No Category —")}</option>
                {s.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </InventoryField>
          </div>
        )}

        {showBrand && (
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
            <InventoryField label={tr("Brand")}>
              <select
                className={inventoryInput}
                value={f.brandId}
                onChange={(e) => setF({ ...f, brandId: e.target.value })}
              >
                <option value="">{tr("— No Brand —")}</option>
                {s.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </InventoryField>
          </div>
        )}

        {showBarcode && (
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
            <BarcodeField value={f.barcode} onChange={(barcode) => setF({ ...f, barcode })} tr={tr} />
          </div>
        )}

        {showSKU && (
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 grid grid-cols-2 gap-2">
            <InventoryField label={tr("SKU / Item Code")}>
              <input
                className={inventoryInput}
                value={f.sku}
                onChange={(e) => setF({ ...f, sku: e.target.value })}
                placeholder="SKU-1001"
              />
            </InventoryField>
            <InventoryField label={tr("Min Stock Alert Level")}>
              <input
                type="number"
                step="1"
                className={inventoryInput}
                value={f.minStock}
                onChange={(e) => setF({ ...f, minStock: e.target.value })}
              />
            </InventoryField>
          </div>
        )}

        {/* Variants / Sizes Section */}
        <div className="pt-2 border-t border-border/30 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-border text-primary focus:ring-primary w-4 h-4"
              checked={hasVariants}
              onChange={(e) => {
                const next = e.target.checked;
                setHasVariants(next);
                if (!next) setVariants([]);
              }}
            />
            <span className="text-xs font-semibold text-foreground">
              {tr("This product has sizes / variants (S, M, L, 44–60, etc.)")}
            </span>
          </label>

          {hasVariants && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border/40 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Numeric range generator */}
                <div className="p-2 rounded bg-background/60 border border-border/30 space-y-1.5">
                  <p className="font-semibold text-foreground">{tr("Generate Numeric Range (e.g. 44 to 60)")}</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={cn(inventoryInput, "h-7 text-xs")}
                      placeholder={tr("From")}
                      value={fromSize}
                      onChange={(e) => setFromSize(e.target.value)}
                    />
                    <input
                      className={cn(inventoryInput, "h-7 text-xs")}
                      placeholder={tr("To")}
                      value={toSize}
                      onChange={(e) => setToSize(e.target.value)}
                    />
                    <input
                      className={cn(inventoryInput, "h-7 text-xs w-14")}
                      placeholder={tr("Step")}
                      value={stepSize}
                      onChange={(e) => setStepSize(e.target.value)}
                    />
                    <ShopButton type="button" size="sm" className="h-7 text-xs shrink-0" onClick={generateRange}>
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>

                {/* Freeform text generator */}
                <div className="p-2 rounded bg-background/60 border border-border/30 space-y-1.5">
                  <p className="font-semibold text-foreground">{tr("Add Custom Sizes (comma or space separated)")}</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={cn(inventoryInput, "h-7 text-xs")}
                      placeholder="S, M, L, XL, 2XL"
                      value={freeform}
                      onChange={(e) => setFreeform(e.target.value)}
                    />
                    <ShopButton type="button" size="sm" className="h-7 text-xs shrink-0" onClick={addFreeformTokens}>
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>
              </div>

              {/* Variant Rows Table */}
              {variants.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-1">
                    <span>{tr("Size / Variant")}</span>
                    <div className="flex items-center gap-4">
                      <span>{tr("Opening Qty")}</span>
                      <span>{tr("Sell Price (Opt)")}</span>
                      <span className="w-6"></span>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    {variants.map((v, i) => (
                      <div
                        key={v.id + i}
                        className="flex items-center justify-between gap-2 p-1.5 rounded bg-background/80 border border-border/30 text-xs"
                      >
                        <input
                          className={cn(inventoryInput, "h-7 text-xs font-semibold max-w-[120px]")}
                          value={v.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVariants((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: val } : x)));
                          }}
                        />
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            className={cn(inventoryInput, "h-7 text-xs w-20 text-right")}
                            placeholder="0"
                            value={v.qty}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVariants((prev) => prev.map((x, idx) => (idx === i ? { ...x, qty: val } : x)));
                            }}
                          />
                          <input
                            type="number"
                            step="any"
                            className={cn(inventoryInput, "h-7 text-xs w-24 text-right")}
                            placeholder={f.sell || "Default"}
                            value={v.sell || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVariants((prev) => prev.map((x, idx) => (idx === i ? { ...x, sell: val } : x)));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setVariants((prev) => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 px-1 font-bold text-foreground border-t border-border/20">
                    <span>{tr("Total Opening Stock across all sizes")}:</span>
                    <span className="tabular-nums text-sm">
                      {totalVariantQty} {f.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function InlineProductPicker({
  s,
  value,
  onChange,
  tr,
  label,
  required = true,
}: {
  s: erp.ErpState;
  value: string;
  onChange: (id: string) => void;
  tr: (t: string) => string;
  label?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdQty, setNewProdQty] = useState("0");
  const [newProdUnit, setNewProdUnit] = useState("Piece");
  const [newProdBuy, setNewProdBuy] = useState("0");
  const [newProdSell, setNewProdSell] = useState("0");

  const selectedProduct = s.products.find((p) => p.id === value);
  const rows = inventoryProducts(s, q);

  const handleQuickAdd = () => {
    if (!newProdName.trim()) {
      toast.error(tr("Product name is required"));
      return;
    }
    const newId = erp.uid();
    const created = run(() => {
      erp.commit((state, c) => {
        const prod: erp.Product = {
          id: newId,
          name: newProdName.trim(),
          buy: Number(newProdBuy) || 0,
          sell: Number(newProdSell) || 0,
          qty: 0,
          createdAt: Date.now(),
          unit: newProdUnit,
          minStock: 5,
        };
        state.products.push(prod);
        const initQty = Number(newProdQty) || 0;
        if (initQty > 0) {
          prod.qty = initQty;
          c.move(newId, "OPENING", initQty, "Opening stock balance", c.nextRef("STK"));
        }
      });
    }, tr("Product registered & selected"));

    if (created) {
      onChange(newId);
      setShowAddModal(false);
      setOpen(false);
      setQ("");
    }
  };

  return (
    <div className="relative w-full">
      <InventoryField label={label ?? tr("Select Product")} required={required}>
        <div className="relative flex items-center">
          {selectedProduct ? (
            <div
              className={cn(inventoryInput, "flex items-center justify-between pr-2 cursor-pointer")}
              onClick={() => setOpen(true)}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-foreground truncate">{selectedProduct.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 font-mono">
                  ({selectedProduct.qty} {selectedProduct.unit || "pcs"})
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                  setQ("");
                  setOpen(true);
                }}
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground"
                title={tr("Change product")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative w-full">
              <input
                type="text"
                className={cn(inventoryInput, "pr-10")}
                placeholder={tr("Select, search or scan product...")}
                value={q}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </InventoryField>

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl p-1.5 max-h-60 overflow-y-auto space-y-1">
          {rows.length > 0 ? (
            rows.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQ("");
                }}
                className={cn(
                  "w-full text-start px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs hover:bg-primary/10 transition-colors",
                  value === p.id && "bg-primary/15 font-bold text-primary",
                )}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-muted-foreground text-[11px] shrink-0 font-mono">
                  {p.qty} {p.unit || "pcs"}
                </span>
              </button>
            ))
          ) : (
            <div className="p-2 text-center text-xs text-muted-foreground">{tr("No existing product found")}</div>
          )}

          {/* Quick Add Option */}
          <div className="pt-1 border-t border-border/50">
            <button
              type="button"
              onClick={() => {
                setNewProdName(q.trim());
                setNewProdQty("0");
                setNewProdUnit("Piece");
                setNewProdBuy("0");
                setNewProdSell("0");
                setShowAddModal(true);
                setOpen(false);
              }}
              className="w-full text-start px-2.5 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/10 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>{q.trim() ? `${tr("Add new product")} "${q.trim()}"` : tr("Register New Product")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Inline Quick Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="font-bold text-sm text-foreground">{tr("Quick Register Product")}</span>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Product Name */}
              <InventoryField label={tr("Product Name")} required>
                <input
                  className={inventoryInput}
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder={tr("e.g. Sugar 1kg, Milk 1L")}
                  autoFocus
                />
              </InventoryField>

              {/* Quantity & Unit in 1 row */}
              <div className="grid grid-cols-2 gap-2">
                <InventoryField label={tr("Quantity")} required>
                  <input
                    type="number"
                    step="any"
                    className={inventoryInput}
                    value={newProdQty}
                    onChange={(e) => setNewProdQty(e.target.value)}
                    placeholder="0"
                  />
                </InventoryField>
                <InventoryField label={tr("Unit of Measurement")} required>
                  <select
                    className={inventoryInput}
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                  >
                    {["Piece", "kg", "g", "L", "ml", "box", "packet", "carton", "pair", "set"].map((u) => (
                      <option key={u} value={u}>
                        {tr(u)}
                      </option>
                    ))}
                  </select>
                </InventoryField>
              </div>

              {/* Buying & Selling Price in 1 row */}
              <div className="grid grid-cols-2 gap-2">
                <InventoryField label={tr("Buying Price")}>
                  <input
                    type="number"
                    step="any"
                    className={inventoryInput}
                    value={newProdBuy}
                    onChange={(e) => setNewProdBuy(e.target.value)}
                    placeholder="0"
                  />
                </InventoryField>
                <InventoryField label={tr("Selling Price")}>
                  <input
                    type="number"
                    step="any"
                    className={inventoryInput}
                    value={newProdSell}
                    onChange={(e) => setNewProdSell(e.target.value)}
                    placeholder="0"
                  />
                </InventoryField>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <ShopButton
                variant="bare"
                type="button"
                onClick={() => setShowAddModal(false)}
                className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                {tr("Cancel")}
              </ShopButton>
              <ShopButton
                variant="primary"
                type="button"
                onClick={handleQuickAdd}
                className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                {tr("Save & Select")}
              </ShopButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 2.3 Stock In Screen */
function StockInScreen({ s, tr }: Ctx) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [ref, setRef] = useState("");
  const [location, setLocation] = useState("Main Warehouse");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select a product"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter a valid quantity"));
      return;
    }
    const detail = [supplier, ref, location, batch ? `Batch: ${batch}` : "", expiry ? `Exp: ${expiry}` : "", notes]
      .filter(Boolean)
      .join(" • ");

    if (run(() => erp.stockIn(pid, qNum, detail || tr("Stock Received")), tr("Stock received successfully"))) {
      setQty("");
      setCost("");
      setRef("");
      setNotes("");
      setBatch("");
      setExpiry("");
    }
  };

  const cancel = () => {
    setPid("");
    setQty("");
    setCost("");
    setSupplier("");
    setRef("");
    setNotes("");
  };

  return (
    <div className="w-full space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("Stock In — Record Received Goods")}
        </h2>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            onClick={cancel}
            className="text-xs h-8 px-2.5 sm:px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
          >
            {tr("Cancel")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            className="text-xs h-8 px-3 sm:px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {tr("Save Stock In")}
          </ShopButton>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Row 1: Select Product + Search or Scan Product in 1 row */}
        <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />

        {/* Row 2: Supplier / Vendor + Quantity Received + Cost Price */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Supplier / Vendor")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={tr("Supplier...")}
            />
          </InventoryField>
          <InventoryField label={tr("Quantity Received")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Cost Price")}>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
        </div>

        {/* Row 3: Location / Warehouse + Invoice Number + Batch / Lot Number */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Location / Warehouse")}>
            <select className={inventoryInput} value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="Main Warehouse">{tr("Main Warehouse")}</option>
              <option value="Front Store">{tr("Front Store")}</option>
              <option value="Backroom">{tr("Backroom")}</option>
              <option value="Shelf A">{tr("Shelf A")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Invoice Number")}>
            <input
              className={inventoryInput}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="INV-001"
            />
          </InventoryField>
          <InventoryField label={tr("Batch / Lot Number")}>
            <input
              className={inventoryInput}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="LOT-2026A"
            />
          </InventoryField>
        </div>

        {/* Row 4: Expiry Date + Notes */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Expiry Date (Optional)")}>
            <input type="date" className={inventoryInput} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </InventoryField>
          <InventoryField label={tr("Notes")}>
            <input
              className={inventoryInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr("Delivery notes, condition...")}
            />
          </InventoryField>
        </div>
      </div>
    </div>
  );
}

/** 2.4 Stock Out Screen */
function StockOutScreen({ s, tr }: Ctx) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Damaged");
  const [notes, setNotes] = useState("");

  const reasons = [
    "Damaged",
    "Expired",
    "Broken",
    "Lost or missing",
    "Sample or demonstration",
    "Internal use",
    "Other",
  ];

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select a product"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter a valid quantity"));
      return;
    }
    const detail = `${reason}${notes ? ` • ${notes}` : ""}`;
    if (run(() => erp.stockOut(pid, qNum, detail), tr("Stock out recorded successfully"))) {
      setQty("");
      setNotes("");
    }
  };

  const cancel = () => {
    setPid("");
    setQty("");
    setNotes("");
  };

  return (
    // With:
    <div className="w-full space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("Stock Out — Non-Sale Write-Off")}
        </h2>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            onClick={cancel}
            className="text-xs h-8 px-2.5 sm:px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
          >
            {tr("Cancel")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            className="text-xs h-8 px-3 sm:px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {tr("Record Stock Out")}
          </ShopButton>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Row 1: Select Product + Search or Scan Product in 1 row */}
        <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />

        {/* Row 2: Quantity Written Off * + Reason Category * in 1 row */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Quantity Written Off")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Reason Category")} required>
            <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </select>
          </InventoryField>
        </div>

        {/* Row 3: Description / Notes */}
        <InventoryField label={tr("Description / Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Reason for write-off, incident details...")}
          />
        </InventoryField>
      </div>
    </div>
  );
}
/** 2.5 Stock History */
function StockHistoryScreen({ s, tr }: Ctx) {
  const [filterType, setFilterType] = useState("all");
  const [q, setQ] = useState("");

  const moves = useMemo(() => {
    return s.movements.filter((m) => {
      const matchType = filterType === "all" || m.type === filterType;
      const p = s.products.find((prod) => prod.id === m.productId);
      const matchQ =
        !q.trim() ||
        (p?.name && p.name.toLowerCase().includes(q.toLowerCase())) ||
        (m.source && m.source.toLowerCase().includes(q.toLowerCase()));
      return matchType && matchQ;
    });
  }, [s.movements, s.products, filterType, q]);

  const typeColor = (t: string) => {
    switch (t) {
      case "SALE":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
      case "IN":
      case "OPENING":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "ADJUST":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
      case "TRANSFER":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(inventoryInput, "pl-8 text-xs")}
            placeholder={tr("Search by product or reference...")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
          {["all", "IN", "SALE", "OUT", "ADJUST", "TRANSFER"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap",
                filterType === t ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground",
              )}
            >
              {t === "all" ? tr("All Movements") : t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card/65 backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="p-2.5 bg-muted/40 border-b border-border/40 text-[11px] font-bold text-muted-foreground flex justify-between">
          <span>{tr("Stock Audit Trail")}</span>
          <span>
            {moves.length} {tr("entries")}
          </span>
        </div>

        {moves.length ? (
          <div className="divide-y divide-border/30 max-h-[640px] overflow-y-auto">
            {moves.map((m) => {
              const p = s.products.find((prod) => prod.id === m.productId);
              const isPositive = m.qty > 0;
              return (
                <div
                  key={m.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-muted/40 transition-colors min-h-[36px]"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase shrink-0",
                        typeColor(m.type),
                      )}
                    >
                      {m.type}
                    </span>
                    <span className="font-bold text-foreground text-xs truncate max-w-[160px] sm:max-w-xs">
                      {p?.name || tr("Unknown Item")}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{m.source}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        "font-extrabold text-xs tabular-nums text-right min-w-[45px]",
                        isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {isPositive ? `+${m.qty}` : m.qty}
                    </span>

                    <span className="text-[10px] text-muted-foreground tabular-nums min-w-[65px] text-right hidden sm:inline">
                      {tr("Bal")}: {m.next} {p?.unit || "pcs"}
                    </span>

                    <span className="text-[10px] text-muted-foreground tabular-nums min-w-[80px] text-right">
                      {dt(m.at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6">
            <Empty>{tr("No stock movements found")}</Empty>
          </div>
        )}
      </div>
    </div>
  );
}

/** 2.6 Adjustments Screen */
function AdjustmentsScreen({ s, tr }: Ctx) {
  const [pid, setPid] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("Physical stock count");
  const [notes, setNotes] = useState("");

  const p = s.products.find((item) => item.id === pid);
  const sysQty = p?.qty ?? 0;
  const countNum = Number(counted);
  const diff = counted !== "" ? countNum - sysQty : 0;

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select a product"));
      return;
    }
    if (counted === "") {
      toast.error(tr("Enter physical counted quantity"));
      return;
    }
    const detail = `${reason}${notes ? ` • ${notes}` : ""}`;
    if (run(() => erp.adjustStock(pid, countNum, detail), tr("Stock adjusted successfully"))) {
      setCounted("");
      setNotes("");
    }
  };

  const cancel = () => {
    setPid("");
    setCounted("");
    setNotes("");
  };

  return (
    <div className="w-full space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <h2 className="text-base font-bold text-foreground">{tr("Stock Adjustment — Physical Count Correction")}</h2>
        <div className="flex items-center gap-2">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            onClick={cancel}
            className="text-xs h-8 px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
          >
            {tr("Cancel")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            className="text-xs h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {tr("Save Adjustment")}
          </ShopButton>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Row 1: Select Product + Search or Scan Product in 1 row */}
        <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />

        {/* Row 2: System Quantity + Physical Counted Quantity + Reason * in 1 row */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("System Quantity")}>
            <input className={cn(inventoryInput, "bg-muted font-bold")} readOnly value={p ? p.qty : "—"} />
          </InventoryField>
          <InventoryField label={tr("Corrected Quantity")} required>
            <input
              type="number"
              step="any"
              min="0"
              className={inventoryInput}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Reason")} required>
            <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="Physical stock count">{tr("Physical count")}</option>
              <option value="Damaged goods discovered">{tr("Damaged goods")}</option>
              <option value="Lost or missing inventory">{tr("Lost / missing")}</option>
              <option value="Discrepancy correction">{tr("Discrepancy")}</option>
              <option value="Other">{tr("Other")}</option>
            </select>
          </InventoryField>
        </div>

        {counted !== "" && p && (
          <div className="p-2 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{tr("Variance (Difference)")}:</span>
            <span
              className={cn(
                "font-extrabold text-xs sm:text-sm tabular-nums",
                diff === 0
                  ? "text-foreground"
                  : diff > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
              )}
            >
              {diff > 0 ? `+${diff}` : diff} {p.unit || "pcs"}
            </span>
          </div>
        )}

        {/* Row 3: Notes on its own */}
        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Audit explanation...")}
          />
        </InventoryField>
      </div>
    </div>
  );
}
/* =========================================================================
   3. RETURNS & TRANSFERS
   ========================================================================= */

/** 3.1 Customer Returns */
function CustomerReturnsScreen({ s, tr }: Ctx) {
  const [saleRef, setSaleRef] = useState("");
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Faulty or not working");
  const [condition, setCondition] = useState("Good (Resalable)");
  const [resolution, setResolution] = useState("Refund");
  const [outcome, setOutcome] = useState("Return to available stock");

  const resetForm = () => {
    setQty("");
    setSaleRef("");
    setPid("");
  };

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select a product to return"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter return quantity"));
      return;
    }

    const detail = `Customer Return • ${saleRef || "Direct"} • ${reason} • ${condition} • ${resolution}`;

    if (
      run(() => {
        erp.commit((state, c) => {
          if (outcome === "Return to available stock") {
            const p = state.products.find((x) => x.id === pid);
            if (p) p.qty += qNum;
            c.move(pid, "RETURN", qNum, detail, c.nextRef("RET"));
          } else {
            c.audit("RETURN QUARANTINED", `${pid} • ${qNum} • ${detail}`);
          }
        });
      }, tr("Customer return processed"))
    ) {
      resetForm();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Header with right-aligned Cancel & Save buttons */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("Customer Returns — Receive Returned Goods")}
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={resetForm}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
          >
            {tr("Save")}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        {/* Row 1: Receipt Ref + Product Returned in 1 row across all screens */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Original Sale / Receipt Ref (Optional)")}>
            <input
              className={inventoryInput}
              value={saleRef}
              onChange={(e) => setSaleRef(e.target.value)}
              placeholder="REC-00123"
            />
          </InventoryField>
          <InlineProductPicker label={tr("Product Returned")} s={s} value={pid} onChange={setPid} tr={tr} />
        </div>

        {/* Row 2: Quantity Returned + Reason + Inspection Condition in 1 row across all screens */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Quantity Returned")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Reason for Return")}>
            <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="Faulty or not working">{tr("Faulty or not working")}</option>
              <option value="Wrong product supplied">{tr("Wrong product supplied")}</option>
              <option value="Wrong size, colour or variant">{tr("Wrong size, colour or variant")}</option>
              <option value="Damaged product">{tr("Damaged product")}</option>
              <option value="Customer changed mind">{tr("Customer changed mind")}</option>
              <option value="Other">{tr("Other")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Inspection Condition")}>
            <select className={inventoryInput} value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="Good (Resalable)">{tr("Good (Resalable)")}</option>
              <option value="Damaged">{tr("Damaged")}</option>
              <option value="Faulty">{tr("Faulty")}</option>
              <option value="Needs Inspection">{tr("Needs Further Inspection")}</option>
            </select>
          </InventoryField>
        </div>

        {/* Row 3: Resolution + Inventory Outcome in 1 row across all screens */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Resolution")}>
            <select className={inventoryInput} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="Refund">{tr("Refund Cash / M-Pesa")}</option>
              <option value="Exchange">{tr("Exchange with another product")}</option>
              <option value="Store Credit">{tr("Store Credit")}</option>
              <option value="Reject">{tr("Reject Return")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Inventory Outcome")}>
            <select className={inventoryInput} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="Return to available stock">{tr("Return to Available Stock (Restock)")}</option>
              <option value="Move to damaged stock">{tr("Quarantine / Move to Damaged (Do Not Restock)")}</option>
            </select>
          </InventoryField>
        </div>
      </div>
    </div>
  );
}

/** 3.2 Supplier Returns */
function SupplierReturnsScreen({ s, tr }: Ctx) {
  const [supplier, setSupplier] = useState("");
  const [purchaseRef, setPurchaseRef] = useState("");
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Damaged on delivery");
  const [resolution, setResolution] = useState("Supplier Credit Note");

  const resetForm = () => {
    setQty("");
    setPurchaseRef("");
    setSupplier("");
    setPid("");
  };

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select product"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter valid quantity"));
      return;
    }
    const detail = `Supplier Return • ${supplier || "Supplier"} • ${purchaseRef || "PO"} • ${reason} • ${resolution}`;
    if (run(() => erp.stockOut(pid, qNum, detail), tr("Supplier return dispatched"))) {
      resetForm();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Header with right-aligned Cancel & Save buttons */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("Supplier Returns — Return Goods to Supplier")}
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={resetForm}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
          >
            {tr("Save")}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        {/* Row 1: Purchase Order Ref + Supplier + Product to Return in 1 row across all screens */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Purchase Order Ref")}>
            <input
              className={inventoryInput}
              value={purchaseRef}
              onChange={(e) => setPurchaseRef(e.target.value)}
              placeholder="PO-0089"
            />
          </InventoryField>
          <InventoryField label={tr("Supplier")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier name"
            />
          </InventoryField>
          <InlineProductPicker label={tr("Product to Return")} s={s} value={pid} onChange={setPid} tr={tr} />
        </div>

        {/* Row 2: Quantity + Reason + Supplier Resolution in 1 row across all screens */}
        <div className="grid grid-cols-3 gap-2">
          <InventoryField label={tr("Quantity Being Returned")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Reason")}>
            <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="Damaged on delivery">{tr("Damaged on delivery")}</option>
              <option value="Faulty or not working">{tr("Faulty or not working")}</option>
              <option value="Wrong product delivered">{tr("Wrong product delivered")}</option>
              <option value="Expired goods">{tr("Expired goods")}</option>
              <option value="Other">{tr("Other")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Supplier Resolution")}>
            <select className={inventoryInput} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="Supplier Credit Note">{tr("Supplier Credit Note")}</option>
              <option value="Replacement Goods">{tr("Replacement Goods")}</option>
              <option value="Refund">{tr("Cash / Bank Refund")}</option>
              <option value="Awaiting Response">{tr("Awaiting Supplier Response")}</option>
            </select>
          </InventoryField>
        </div>
      </div>
    </div>
  );
}

/** 3.3 New Transfer */
function NewTransferScreen({ s, tr, shop }: Ctx) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [to, setTo] = useState("Branch 1");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setQty("");
    setNotes("");
    setPid("");
  };

  const submit = () => {
    if (!pid) {
      toast.error(tr("Select product"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter valid quantity"));
      return;
    }
    if (run(() => erp.createTransfer(pid, qNum, to, shop), tr("Transfer created and dispatched"))) {
      resetForm();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Header with right-aligned Cancel & Save buttons */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("New Transfer — Move Stock Between Locations")}
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={resetForm}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
          >
            {tr("Save")}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        {/* Row 1: From Location + To Location in 1 row across all screens */}
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("From Location")}>
            <input className={cn(inventoryInput, "bg-muted")} readOnly value={shop} />
          </InventoryField>
          <InventoryField label={tr("To Location")} required>
            <input
              className={inventoryInput}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Destination shop / warehouse"
            />
          </InventoryField>
        </div>

        {/* Row 2: Product + Quantity in 1 row across all screens */}
        <div className="grid grid-cols-2 gap-2">
          <InlineProductPicker label={tr("Product")} s={s} value={pid} onChange={setPid} tr={tr} />

          <InventoryField label={tr("Quantity")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
        </div>

        {/* Row 3: Notes in last row across all screens */}
        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Vehicle, driver, transfer reason...")}
          />
        </InventoryField>
      </div>
    </div>
  );
}

/** 3.4 Transfer History */
function TransferHistoryScreen({ s, tr }: Ctx) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">{tr("Transfer Audit Trail")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/30">
          {s.transfers.length ? (
            s.transfers.map((t) => {
              const p = s.products.find((prod) => prod.id === t.productId);
              return (
                <div
                  key={t.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-muted/40 transition-colors min-h-[36px]"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0",
                        t.status === "RECEIVED" && "bg-emerald-500/15 text-emerald-600",
                        t.status === "SENT" && "bg-amber-500/15 text-amber-600",
                        t.status === "PENDING" && "bg-blue-500/15 text-blue-600",
                        t.status === "CANCELLED" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.status}
                    </span>
                    <span className="font-bold text-foreground text-xs truncate max-w-[160px] sm:max-w-xs">
                      {p?.name || tr("Product")}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                      {t.ref} · {t.from} → {t.to}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-extrabold text-xs text-foreground tabular-nums">
                      {t.qty} {p?.unit || "pcs"}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">{dt(t.at)}</span>
                    {t.status === "SENT" && (
                      <ShopButton
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => run(() => erp.receiveTransfer(t.id), tr("Transfer marked as received"))}
                      >
                        {tr("Receive")}
                      </ShopButton>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>{tr("No transfer records found")}</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. CONFIGURATION
   ========================================================================= */

/** 4.1 Product Setup */
function ProductSetupScreen({ s, tr }: Ctx) {
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [variantsEnabled, setVariantsEnabled] = useState(true);

  const activeCategory = s.categories.find((c) => c.id === selectedCatId);
  const activeBrand = s.brands.find((b) => b.id === selectedBrandId);

  const filteredCategories = s.categories.filter((c) => c.name.toLowerCase().includes(catSearch.toLowerCase().trim()));
  const filteredBrands = s.brands.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase().trim()));

  const handleAddCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = run(() => erp.addNamed("categories", trimmed), tr("Category added"));
    if (res) {
      setCatSearch("");
      setCatOpen(false);
      const created = s.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (created) setSelectedCatId(created.id);
    }
  };

  const handleAddBrand = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = run(() => erp.addNamed("brands", trimmed), tr("Brand added"));
    if (res) {
      setBrandSearch("");
      setBrandOpen(false);
      const created = s.brands.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());
      if (created) setSelectedBrandId(created.id);
    }
  };

  return (
    <div className="w-full space-y-3">
      <h2 className="text-base font-bold text-foreground">{tr("Product Setup & Master Catalog Configuration")}</h2>

      {/* Row 1: Categories & Brands side-by-side in searchable comboboxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Categories Searchable Dropdown */}
        <Box title={tr("Categories")} sub={tr("Search or add category")}>
          <div className="relative">
            <div className="relative flex items-center">
              <input
                type="text"
                className={cn(inventoryInput, "pr-8 text-xs")}
                placeholder={activeCategory ? activeCategory.name : tr("Search or choose a category...")}
                value={catSearch}
                onChange={(e) => {
                  setCatSearch(e.target.value);
                  setCatOpen(true);
                }}
                onFocus={() => setCatOpen(true)}
              />
              <button
                type="button"
                onClick={() => setCatOpen((v) => !v)}
                className="absolute right-2 text-muted-foreground hover:text-foreground text-xs"
              >
                ▼
              </button>
            </div>

            {catOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCatOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl z-20 p-1 text-xs space-y-0.5">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((c) => {
                      const count = s.products.filter((p) => p.categoryId === c.id).length;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={cn(
                            "w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between hover:bg-muted transition-colors",
                            selectedCatId === c.id && "bg-muted font-bold text-primary",
                          )}
                          onClick={() => {
                            setSelectedCatId(c.id);
                            setCatSearch("");
                            setCatOpen(false);
                          }}
                        >
                          <span>{c.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {count} {tr("items")}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-2 text-center text-muted-foreground">{tr("No matching category")}</div>
                  )}

                  {catSearch.trim() &&
                    !s.categories.some((c) => c.name.toLowerCase() === catSearch.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => handleAddCategory(catSearch)}
                        className="w-full text-left px-2.5 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 font-semibold border-t border-border/40 flex items-center justify-between"
                      >
                        <span>
                          + {tr("Add")} "{catSearch.trim()}"
                        </span>
                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                          {tr("Save")}
                        </span>
                      </button>
                    )}
                </div>
              </>
            )}
          </div>
        </Box>

        {/* Brands Searchable Dropdown */}
        <Box title={tr("Brands")} sub={tr("Search or add brand")}>
          <div className="relative">
            <div className="relative flex items-center">
              <input
                type="text"
                className={cn(inventoryInput, "pr-8 text-xs")}
                placeholder={activeBrand ? activeBrand.name : tr("Search or choose a brand...")}
                value={brandSearch}
                onChange={(e) => {
                  setBrandSearch(e.target.value);
                  setBrandOpen(true);
                }}
                onFocus={() => setBrandOpen(true)}
              />
              <button
                type="button"
                onClick={() => setBrandOpen((v) => !v)}
                className="absolute right-2 text-muted-foreground hover:text-foreground text-xs"
              >
                ▼
              </button>
            </div>

            {brandOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBrandOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl z-20 p-1 text-xs space-y-0.5">
                  {filteredBrands.length > 0 ? (
                    filteredBrands.map((b) => {
                      const count = s.products.filter((p) => p.brandId === b.id).length;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className={cn(
                            "w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between hover:bg-muted transition-colors",
                            selectedBrandId === b.id && "bg-muted font-bold text-primary",
                          )}
                          onClick={() => {
                            setSelectedBrandId(b.id);
                            setBrandSearch("");
                            setBrandOpen(false);
                          }}
                        >
                          <span>{b.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {count} {tr("items")}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-2 text-center text-muted-foreground">{tr("No matching brand")}</div>
                  )}

                  {brandSearch.trim() &&
                    !s.brands.some((b) => b.name.toLowerCase() === brandSearch.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => handleAddBrand(brandSearch)}
                        className="w-full text-left px-2.5 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 font-semibold border-t border-border/40 flex items-center justify-between"
                      >
                        <span>
                          + {tr("Add")} "{brandSearch.trim()}"
                        </span>
                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                          {tr("Save")}
                        </span>
                      </button>
                    )}
                </div>
              </>
            )}
          </div>
        </Box>
      </div>

      {/* Row 2: Units of Measurement & Variants side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Box title={tr("Units of Measurement")} sub={tr("Standard units for buying & selling")}>
          <div className="flex flex-wrap gap-1">
            {["Piece", "Kg", "Gram", "Litre", "Millilitre", "Box", "Carton", "Packet", "Metre"].map((u) => (
              <span
                key={u}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-foreground font-medium"
              >
                {tr(u)}
              </span>
            ))}
          </div>
        </Box>

        <Box title={tr("Product Variants & Attributes")} sub={tr("Enable or disable variant matrix")}>
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr("Enable Size & Color Variants")}</p>
              <p className="text-[10px] text-muted-foreground">
                {tr("Allows Add Product to generate multi-size matrices")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={variantsEnabled}
              onChange={(e) => setVariantsEnabled(e.target.checked)}
              className="rounded"
            />
          </label>
        </Box>
      </div>
    </div>
  );
}

/** 4.2 Stock Setup */
function StockSetupScreen({ tr }: Ctx) {
  const [preventNegative, setPreventNegative] = useState(true);
  const [requireReason, setRequireReason] = useState(true);
  const [batchTracking, setBatchTracking] = useState(false);
  const [minStockDefault, setMinStockDefault] = useState("5");

  return (
    <div className="w-full space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Stock Setup & Warehouse Rules")}</h2>

      {/* Warehouses & Locations */}
      <Box title={tr("Warehouses & Storage Locations")} sub={tr("Locations where physical inventory is stored")}>
        <div className="flex flex-wrap gap-1.5">
          {["Main Warehouse", "Shop Floor", "Storage Room", "Shelf A1"].map((loc) => (
            <span key={loc} className="text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground font-medium">
              {tr(loc)}
            </span>
          ))}
        </div>
      </Box>

      {/* Stock Management Rules */}
      <Box title={tr("Stock Management Safeguards")} sub={tr("Strict business rules for inventory movements")}>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr("Prevent Negative Stock")}</p>
              <p className="text-[10px] text-muted-foreground">
                {tr("Stops sales and non-sale stock reductions if stock reaches zero")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={preventNegative}
              onChange={(e) => setPreventNegative(e.target.checked)}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr("Require Reason for Stock Adjustments")}</p>
              <p className="text-[10px] text-muted-foreground">
                {tr("Forces staff to document discrepancies during cycle counts")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={requireReason}
              onChange={(e) => setRequireReason(e.target.checked)}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr("Batch & Expiry Date Tracking")}</p>
              <p className="text-[10px] text-muted-foreground">
                {tr("Enables FEFO and batch expiry tracking on Stock In")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={batchTracking}
              onChange={(e) => setBatchTracking(e.target.checked)}
              className="rounded"
            />
          </label>

          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr("Default Reorder Level Alert")}</p>
              <p className="text-[10px] text-muted-foreground">
                {tr("Minimum threshold before triggering low-stock warning")}
              </p>
            </div>
            <input
              type="number"
              className={cn(inventoryInput, "w-20 text-right")}
              value={minStockDefault}
              onChange={(e) => setMinStockDefault(e.target.value)}
            />
          </div>
        </div>
      </Box>
    </div>
  );
}

/** Read-only product details popup opened from All Products */
function ProductDetailSheet({
  p,
  s,
  money,
  tr,
  isOwner = true,
  onClose,
}: {
  p: erp.Product;
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (t: string) => string;
  isOwner?: boolean;
  onClose: () => void;
}) {
  const cat = s.categories.find((c) => c.id === p.categoryId)?.name;
  const brand = s.brands.find((b) => b.id === p.brandId)?.name;

  const cards: { label: string; value: string }[] = [];

  // 1. Quantity always shown
  cards.push({ label: tr("Quantity"), value: `${p.qty} ${p.unit ?? "pcs"}`.trim() });

  // 2. Buying price & Stock value hidden if not owner
  if (isOwner) {
    if (p.buy !== undefined && p.buy !== null) {
      cards.push({ label: tr("Buying price"), value: money(p.buy) });
    }
    cards.push({ label: tr("Stock value"), value: money(p.qty * (p.buy || 0)) });
  }

  // 3. Selling price (if set)
  if (p.sell !== undefined && p.sell !== null && p.sell > 0) {
    cards.push({ label: tr("Selling price"), value: money(p.sell) });
  }

  // 4. Category (only if exists)
  if (cat && cat.trim() && cat !== "—") {
    cards.push({ label: tr("Category"), value: cat });
  }

  // 5. Brand (only if exists)
  if (brand && brand.trim() && brand !== "—") {
    cards.push({ label: tr("Brand"), value: brand });
  }

  // 6. Barcode (only if exists)
  if (p.barcode && p.barcode.trim()) {
    cards.push({ label: tr("Barcode"), value: p.barcode });
  }

  // 7. SKU (only if exists)
  if (p.sku && p.sku.trim()) {
    cards.push({ label: tr("SKU"), value: p.sku });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="inventory-box w-full sm:max-w-md rounded-2xl p-4 space-y-3.5 bg-card/95 border border-border shadow-xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Product name on the top left, 'X' icon on the top right */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
          <h3 className="font-bold text-foreground text-sm sm:text-base truncate">{p.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label={tr("Close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Detail Cards - only items that actually exist */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border/50 bg-background/50 p-2.5 space-y-0.5">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">{c.label}</p>
              <p className="font-semibold text-foreground truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Variants list if product has variants */}
        {p.variants && p.variants.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border/30">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              {tr("Variants / Sizes")} ({p.variants.length})
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1 divide-y divide-border/20">
              {p.variants.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-1 text-xs">
                  <span className="font-medium text-foreground">{v.name}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>
                      {v.qty} {p.unit || "pcs"}
                    </span>
                    {v.sell ? <span className="font-semibold text-foreground">{money(v.sell)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
