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
          size === "xs" && "text-xs",
          size === "sm" && "text-sm",
          size === "md" && (isHuge ? "text-sm" : isLarge ? "text-base" : "text-lg"),
          size === "lg" && (isHuge ? "text-base" : isLarge ? "text-lg" : "text-xl"),
        )}
      >
        {formatted}
      </span>
      {curr && (
        <span
          className={cn(
            "font-semibold text-muted-foreground/75 shrink-0 select-none",
            size === "xs" && "text-[8px]",
            size === "sm" && "text-[9px]",
            size === "md" && "text-[10px]",
            size === "lg" && "text-xs",
          )}
        >
          {curr}
        </span>
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
  }, [nav, tr]);

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

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground font-medium flex flex-col items-center justify-center gap-1">
      <ArchiveX className="w-6 h-6 stroke-1 text-muted-foreground/60 mb-1" />
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
      {/* 4 Fluid KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[11px] font-semibold text-muted-foreground">{tr("Total Products")}</span>
          <Amt value={totalProducts} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[11px] font-semibold text-muted-foreground">{tr("Stock Value (Cost)")}</span>
          <Amt value={totalStockVal} curr={cur} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[11px] font-semibold text-muted-foreground">{tr("Low Stock")}</span>
          <Amt value={lowStock.length} {...(lowStock.length > 0 ? { tone: "warn" as const } : {})} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[11px] font-semibold text-muted-foreground">{tr("Out of Stock")}</span>
          <Amt value={outOfStock.length} {...(outOfStock.length > 0 ? { tone: "bad" as const } : {})} size="lg" />
        </div>
      </div>

      {/* Low Stock Replenishment List */}
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
          <Empty>{tr("All products are well stocked")}</Empty>
        )}
      </Box>

      {/* Recent Activity Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Box title={tr("Recent Stock In")} sub={tr("Goods received into inventory")}>
          {recentIn.length ? (
            <div className="divide-y divide-border/30">
              {recentIn.map((m) => (
                <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-foreground">
                      {s.products.find((p) => p.id === m.productId)?.name || "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {dt(m.at)} · {m.source}
                    </p>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{m.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{tr("No recent receipts")}</Empty>
          )}
        </Box>

        <Box title={tr("Recent Stock Out")} sub={tr("Non-sale inventory removals")}>
          {recentOut.length ? (
            <div className="divide-y divide-border/30">
              {recentOut.map((m) => (
                <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-foreground">
                      {s.products.find((p) => p.id === m.productId)?.name || "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {dt(m.at)} · {m.reason || m.type}
                    </p>
                  </div>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{m.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{tr("No non-sale write-offs")}</Empty>
          )}
        </Box>
      </div>
    </div>
  );
}

/* =========================================================================
   2. PRODUCTS & STOCK
   ========================================================================= */

/** 2.1 All Products */
function ProductList({ s, money, tr, shop, onUnknown }: Ctx & { onUnknown: (code: string) => void }) {
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

      {/* Product List Table */}
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/30">
          {filtered.length ? (
            filtered.map((p) => {
              const categoryName = s.categories.find((c) => c.id === p.categoryId)?.name;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-foreground text-sm tracking-tight truncate">{p.name}</p>
                      <Status p={p} />
                      {p.variants && p.variants.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-medium text-muted-foreground">
                          {p.variants.length} {tr("sizes")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {categoryName ? `${categoryName} · ` : ""}
                      {p.sku ? `SKU: ${p.sku} · ` : ""}
                      {tr("Buy")}: {money(p.buy)} · {tr("Sell")}: {money(p.sell)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-sm text-foreground tabular-nums">
                      {p.qty} <span className="text-[10px] font-normal text-muted-foreground">{p.unit || "pcs"}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">{money(p.qty * p.sell)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>{tr("No products found")}</Empty>
          )}
        </div>
      </div>

      {/* Product Detail Sheet */}
      {selectedProduct && (
        <ProductDetailSheet p={selectedProduct} s={s} money={money} tr={tr} onClose={() => setSelectedProduct(null)} />
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
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Register New Product")}</h2>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-4 shadow-sm">
        {/* Name */}
        <InventoryField label={tr("Product Name")} required>
          <input
            className={inventoryInput}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder={tr("e.g. Cotton T-Shirt, Milk 1L")}
            required
          />
        </InventoryField>

        {/* 1-ROW: Buying, Selling, Quantity, Unit */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

        {/* Collapsible Optional Controls Bar */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/30">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowCategory(!showCategory)}
          >
            + {tr("Category")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowBrand(!showBrand)}
          >
            + {tr("Brand")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowBarcode(!showBarcode)}
          >
            + {tr("Barcode")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowSKU(!showSKU)}
          >
            + {tr("SKU & Alert Level")}
          </ShopButton>
        </div>

        {/* Collapsible Fields */}
        {showCategory && (
          <InventoryField label={tr("Category")}>
            <select
              className={inventoryInput}
              value={f.categoryId}
              onChange={(e) => setF({ ...f, categoryId: e.target.value })}
            >
              <option value="">{tr("Select Category")}</option>
              {s.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </InventoryField>
        )}

        {showBrand && (
          <InventoryField label={tr("Brand")}>
            <select
              className={inventoryInput}
              value={f.brandId}
              onChange={(e) => setF({ ...f, brandId: e.target.value })}
            >
              <option value="">{tr("Select Brand")}</option>
              {s.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </InventoryField>
        )}

        {showBarcode && (
          <InventoryField label={tr("Barcode")}>
            <BarcodeField value={f.barcode} onChange={(val) => setF({ ...f, barcode: val })} tr={tr} />
          </InventoryField>
        )}

        {showSKU && (
          <div className="grid grid-cols-2 gap-2">
            <InventoryField label={tr("SKU / Code")}>
              <input
                className={inventoryInput}
                value={f.sku}
                onChange={(e) => setF({ ...f, sku: e.target.value })}
                placeholder="SKU-1001"
              />
            </InventoryField>
            <InventoryField label={tr("Min Stock Alert")}>
              <input
                type="number"
                className={inventoryInput}
                value={f.minStock}
                onChange={(e) => setF({ ...f, minStock: e.target.value })}
              />
            </InventoryField>
          </div>
        )}

        {/* Product Variants Toggle */}
        <div className="pt-2 border-t border-border/30">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => setHasVariants(e.target.checked)}
              className="rounded"
            />
            <span>{tr("This product has sizes / variants")}</span>
          </label>

          {hasVariants && (
            <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border/40 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Numeric range generator */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {tr("Size Range (e.g. 38 to 45)")}
                  </span>
                  <div className="flex gap-1">
                    <input
                      placeholder="From"
                      className={cn(inventoryInput, "h-7 text-xs")}
                      value={fromSize}
                      onChange={(e) => setFromSize(e.target.value)}
                    />
                    <input
                      placeholder="To"
                      className={cn(inventoryInput, "h-7 text-xs")}
                      value={toSize}
                      onChange={(e) => setToSize(e.target.value)}
                    />
                    <ShopButton size="sm" className="h-7 text-xs px-2" onClick={generateRange}>
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>

                {/* Freeform sizes */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {tr("Freeform (e.g. S, M, L, XL)")}
                  </span>
                  <div className="flex gap-1">
                    <input
                      placeholder="S, M, L, XL"
                      className={cn(inventoryInput, "h-7 text-xs")}
                      value={freeform}
                      onChange={(e) => setFreeform(e.target.value)}
                    />
                    <ShopButton size="sm" className="h-7 text-xs px-2" onClick={addFreeformTokens}>
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>
              </div>

              {/* Variant rows */}
              {variants.length > 0 && (
                <div className="divide-y divide-border/30 max-h-48 overflow-y-auto pt-1">
                  {variants.map((v) => (
                    <div key={v.id} className="py-1.5 flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-foreground w-20">{v.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{tr("Qty")}:</span>
                        <input
                          type="number"
                          className={cn(inventoryInput, "h-6 w-16 text-center text-xs")}
                          value={v.qty}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVariants((cur) => cur.map((x) => (x.id === v.id ? { ...x, qty: val } : x)));
                          }}
                        />
                      </div>
                      <ShopButton
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setVariants((cur) => cur.filter((x) => x.id !== v.id))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ShopButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-border/40">
          <ShopButton variant="primary" className="flex-1" onClick={save}>
            {tr("Save Product")}
          </ShopButton>
          <ShopButton variant="outline" onClick={done}>
            {tr("Cancel")}
          </ShopButton>
        </div>
      </div>
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

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Stock In — Record Received Goods")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
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
              placeholder="Optional"
            />
          </InventoryField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Supplier")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier name"
            />
          </InventoryField>
          <InventoryField label={tr("Purchase / Receipt Ref")}>
            <input
              className={inventoryInput}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="PO-00123"
            />
          </InventoryField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Warehouse / Location")}>
            <select className={inventoryInput} value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="Main Warehouse">{tr("Main Warehouse")}</option>
              <option value="Shop Floor">{tr("Shop Floor")}</option>
              <option value="Storage Room">{tr("Storage Room")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Batch # (Optional)")}>
            <input
              className={inventoryInput}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="B-2026-X"
            />
          </InventoryField>
        </div>

        <InventoryField label={tr("Expiry Date (Optional)")}>
          <input type="date" className={inventoryInput} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </InventoryField>

        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Delivery notes, condition, etc.")}
          />
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Save Stock In")}
        </ShopButton>
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
    if (run(() => erp.stockOut(pid, qNum, detail), tr("Stock reduction recorded"))) {
      setQty("");
      setNotes("");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Stock Out — Non-Sale Write-Off")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Quantity Removed")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Reason")} required>
            <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </select>
          </InventoryField>
        </div>

        <InventoryField label={tr("Description / Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Reason for write-off, incident details...")}
          />
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Record Stock Out")}
        </ShopButton>
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

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <InventorySearch q={q} setQ={setQ} tr={tr} placeholder="Search by product or ref..." />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="inventory-input text-xs w-40"
        >
          <option value="all">{tr("All Transactions")}</option>
          <option value="STOCK IN">{tr("Stock In")}</option>
          <option value="STOCK OUT">{tr("Stock Out")}</option>
          <option value="SALE">{tr("Sales")}</option>
          <option value="RETURN">{tr("Returns")}</option>
          <option value="ADJUSTMENT">{tr("Adjustments")}</option>
          <option value="TRANSFER OUT">{tr("Transfers")}</option>
        </select>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/30">
          {moves.length ? (
            moves.slice(0, 100).map((m) => {
              const p = s.products.find((prod) => prod.id === m.productId);
              return (
                <div
                  key={m.id}
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-foreground text-sm tracking-tight">
                        {p?.name || tr("Unknown Product")}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-muted text-foreground">
                        {m.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {dt(m.at)} · {m.source} · {m.reason || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "font-extrabold text-sm tabular-nums",
                        m.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tr("Balance")}: {m.next}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>{tr("No movement history recorded")}</Empty>
          )}
        </div>
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

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Stock Adjustment — Physical Count Correction")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("System Quantity")}>
            <input className={cn(inventoryInput, "bg-muted font-bold")} readOnly value={p ? p.qty : "—"} />
          </InventoryField>
          <InventoryField label={tr("Physical Counted Quantity")} required>
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
        </div>

        {counted !== "" && p && (
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{tr("Variance (Difference)")}:</span>
            <span
              className={cn(
                "font-extrabold text-sm tabular-nums",
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

        <InventoryField label={tr("Reason")} required>
          <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Physical stock count">{tr("Physical stock count")}</option>
            <option value="Damaged goods discovered">{tr("Damaged goods discovered")}</option>
            <option value="Lost or missing inventory">{tr("Lost or missing inventory")}</option>
            <option value="Discrepancy correction">{tr("Discrepancy correction")}</option>
            <option value="Other">{tr("Other")}</option>
          </select>
        </InventoryField>

        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Audit explanation...")}
          />
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Save Adjustment")}
        </ShopButton>
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
      setQty("");
      setSaleRef("");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Customer Returns — Receive Returned Goods")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <InventoryField label={tr("Original Sale / Receipt Ref (Optional)")}>
          <input
            className={inventoryInput}
            value={saleRef}
            onChange={(e) => setSaleRef(e.target.value)}
            placeholder="REC-00123"
          />
        </InventoryField>

        <InventoryField label={tr("Product Returned")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
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
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Inspection Condition")}>
            <select className={inventoryInput} value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="Good (Resalable)">{tr("Good (Resalable)")}</option>
              <option value="Damaged">{tr("Damaged")}</option>
              <option value="Faulty">{tr("Faulty")}</option>
              <option value="Needs Inspection">{tr("Needs Further Inspection")}</option>
            </select>
          </InventoryField>
          <InventoryField label={tr("Resolution")}>
            <select className={inventoryInput} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="Refund">{tr("Refund Cash / M-Pesa")}</option>
              <option value="Exchange">{tr("Exchange with another product")}</option>
              <option value="Store Credit">{tr("Store Credit")}</option>
              <option value="Reject">{tr("Reject Return")}</option>
            </select>
          </InventoryField>
        </div>

        <InventoryField label={tr("Inventory Outcome")}>
          <select className={inventoryInput} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="Return to available stock">{tr("Return to Available Stock (Restock)")}</option>
            <option value="Move to damaged stock">{tr("Quarantine / Move to Damaged (Do Not Restock)")}</option>
          </select>
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Process Customer Return")}
        </ShopButton>
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
      setQty("");
      setPurchaseRef("");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Supplier Returns — Return Goods to Supplier")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Supplier")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier name"
            />
          </InventoryField>
          <InventoryField label={tr("Purchase Order Ref")}>
            <input
              className={inventoryInput}
              value={purchaseRef}
              onChange={(e) => setPurchaseRef(e.target.value)}
              placeholder="PO-0089"
            />
          </InventoryField>
        </div>

        <InventoryField label={tr("Product to Return")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
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
        </div>

        <InventoryField label={tr("Supplier Resolution")}>
          <select className={inventoryInput} value={resolution} onChange={(e) => setResolution(e.target.value)}>
            <option value="Supplier Credit Note">{tr("Supplier Credit Note")}</option>
            <option value="Replacement Goods">{tr("Replacement Goods")}</option>
            <option value="Refund">{tr("Cash / Bank Refund")}</option>
            <option value="Awaiting Response">{tr("Awaiting Supplier Response")}</option>
          </select>
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Dispatch Supplier Return")}
        </ShopButton>
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
      setQty("");
      setNotes("");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("New Transfer — Move Stock Between Locations")}</h2>
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
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

        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

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

        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Vehicle, driver, transfer reason...")}
          />
        </InventoryField>

        <ShopButton variant="primary" className="w-full mt-2" onClick={submit}>
          {tr("Create & Dispatch Transfer")}
        </ShopButton>
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
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground text-sm tracking-tight">
                        {p?.name || tr("Product")}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                          t.status === "RECEIVED" && "bg-emerald-500/15 text-emerald-600",
                          t.status === "SENT" && "bg-amber-500/15 text-amber-600",
                          t.status === "PENDING" && "bg-blue-500/15 text-blue-600",
                          t.status === "CANCELLED" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {t.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t.ref} · {t.from} → {t.to} · {dt(t.at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-foreground tabular-nums">
                      {t.qty} {p?.unit || "pcs"}
                    </span>
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
  const [newCat, setNewCat] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [variantsEnabled, setVariantsEnabled] = useState(true);

  const addCategory = () => {
    if (!newCat.trim()) return;
    if (run(() => erp.addNamed("categories", newCat.trim()), tr("Category added"))) {
      setNewCat("");
    }
  };

  const addBrand = () => {
    if (!newBrand.trim()) return;
    if (run(() => erp.addNamed("brands", newBrand.trim()), tr("Brand added"))) {
      setNewBrand("");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Product Setup & Master Catalog Configuration")}</h2>

      {/* Categories */}
      <Box title={tr("Categories")} sub={tr("Group products for easy selling and reporting")}>
        <div className="flex gap-2 mb-3">
          <input
            className={cn(inventoryInput, "text-xs")}
            placeholder={tr("New category name...")}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <ShopButton size="sm" onClick={addCategory}>
            {tr("Add Category")}
          </ShopButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.categories.map((c) => (
            <span key={c.id} className="text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground font-medium">
              {c.name}
            </span>
          ))}
        </div>
      </Box>

      {/* Brands */}
      <Box title={tr("Brands")} sub={tr("Manage registered manufacturers and labels")}>
        <div className="flex gap-2 mb-3">
          <input
            className={cn(inventoryInput, "text-xs")}
            placeholder={tr("New brand name...")}
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
          />
          <ShopButton size="sm" onClick={addBrand}>
            {tr("Add Brand")}
          </ShopButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.brands.map((b) => (
            <span key={b.id} className="text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground font-medium">
              {b.name}
            </span>
          ))}
        </div>
      </Box>

      {/* Units of Measurement */}
      <Box title={tr("Units of Measurement")} sub={tr("Standard units for buying and selling")}>
        <div className="flex flex-wrap gap-1.5">
          {["Piece", "Kg", "Gram", "Litre", "Millilitre", "Box", "Carton", "Packet", "Metre"].map((u) => (
            <span
              key={u}
              className="text-xs px-2.5 py-1 rounded-lg bg-muted/60 border border-border/40 text-foreground"
            >
              {tr(u)}
            </span>
          ))}
        </div>
      </Box>

      {/* Product Variants & Attributes Toggle */}
      <Box title={tr("Product Variants & Attributes")} sub={tr("Enable or disable variant matrix on registration")}>
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
  );
}

/** 4.2 Stock Setup */
function StockSetupScreen({ tr }: Ctx) {
  const [preventNegative, setPreventNegative] = useState(true);
  const [requireReason, setRequireReason] = useState(true);
  const [batchTracking, setBatchTracking] = useState(false);
  const [minStockDefault, setMinStockDefault] = useState("5");

  return (
    <div className="max-w-3xl mx-auto space-y-4">
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
              className={cn(inventoryInput, "w-20 text-center h-8 text-xs")}
              value={minStockDefault}
              onChange={(e) => setMinStockDefault(e.target.value)}
            />
          </div>
        </div>
      </Box>
    </div>
  );
}

/* =========================================================================
   DETAIL MODAL
   ========================================================================= */

function ProductDetailSheet({
  p,
  s,
  money,
  tr,
  onClose,
}: {
  p: erp.Product;
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (t: string) => string;
  onClose: () => void;
}) {
  const category = s.categories.find((c) => c.id === p.categoryId)?.name || "—";
  const brand = s.brands.find((b) => b.id === p.brandId)?.name || "—";
  const recentMoves = s.movements.filter((m) => m.productId === p.id).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in">
      <div className="w-full max-w-md bg-background border-l border-border h-full flex flex-col p-4 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{p.name}</h3>
            <p className="text-xs text-muted-foreground">
              SKU: {p.sku || "—"} · Barcode: {p.barcode || "—"}
            </p>
          </div>
          <ShopButton variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full">
            <X className="w-4 h-4" />
          </ShopButton>
        </div>

        <div className="py-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-card/65 border border-border/40">
              <span className="text-muted-foreground">{tr("Available Stock")}</span>
              <p className="font-extrabold text-base text-foreground mt-0.5">
                {p.qty} <span className="text-xs font-normal text-muted-foreground">{p.unit || "pcs"}</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-card/65 border border-border/40">
              <span className="text-muted-foreground">{tr("Stock Status")}</span>
              <div className="mt-1">
                <Status p={p} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-card/65 border border-border/40">
              <span className="text-muted-foreground">{tr("Buying Price")}</span>
              <p className="font-bold text-sm text-foreground mt-0.5">{money(p.buy)}</p>
            </div>
            <div className="p-3 rounded-lg bg-card/65 border border-border/40">
              <span className="text-muted-foreground">{tr("Selling Price")}</span>
              <p className="font-bold text-sm text-foreground mt-0.5">{money(p.sell)}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-card/65 border border-border/40 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Category")}:</span>
              <span className="font-semibold text-foreground">{category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Brand")}:</span>
              <span className="font-semibold text-foreground">{brand}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Reorder Level")}:</span>
              <span className="font-semibold text-foreground">{p.minStock ?? 5}</span>
            </div>
          </div>

          {/* Size Variants */}
          {p.variants && p.variants.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground">{tr("Size Breakdown")}</h4>
              <div className="rounded-lg border border-border/40 overflow-hidden divide-y divide-border/30">
                {p.variants.map((v) => (
                  <div key={v.id} className="p-2 flex justify-between">
                    <span className="font-medium text-foreground">{v.name}</span>
                    <span className="font-bold text-foreground">{v.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Movements for this Product */}
          <div className="space-y-1.5 pt-2">
            <h4 className="font-bold text-foreground">{tr("Recent Movements")}</h4>
            {recentMoves.length ? (
              <div className="rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden">
                {recentMoves.map((m) => (
                  <div key={m.id} className="p-2 flex justify-between">
                    <div>
                      <p className="font-medium text-foreground">{m.type}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {dt(m.at)} · {m.source}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        m.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-[11px]">{tr("No movements logged yet")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
