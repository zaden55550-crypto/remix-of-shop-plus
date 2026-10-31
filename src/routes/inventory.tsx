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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/inventory")({
  component: Inventory,
});

/* =========================================================================
   TYPES & 4-MENU TAXONOMY
   ========================================================================= */

type MainMenu = "overview" | "products & stock" | "returns & transfers" | "configuration";

const SUBMENUS: Record<MainMenu, string[]> = {
  overview: ["Dashboard", "Low Stock Alerts"],
  "products & stock": [
    "All Products",
    "Add Product",
    "Stock In (Receive)",
    "Stock Out (Write-Off)",
    "Stock History",
    "Stock Adjustments",
  ],
  "returns & transfers": ["Customer Returns", "Supplier Returns", "New Transfer", "Transfer History"],
  configuration: ["Product Setup", "Stock Configuration", "Valuation Report", "Profits Report"],
};

const MENU_LABELS: Record<MainMenu, string> = {
  overview: "Overview",
  "products & stock": "Products & Stock",
  "returns & transfers": "Returns & Transfers",
  configuration: "Configuration",
};

/* =========================================================================
   COMPACT NUMBER & METRIC FORMATTERS
   ========================================================================= */

function compactFmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

function Amt({
  value,
  curr,
  tone = "default",
  size = "md",
}: {
  value: number;
  curr?: string;
  tone?: "default" | "good" | "warn" | "bad";
  size?: "sm" | "md" | "lg";
}) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-rose-600 dark:text-rose-400",
  };
  const sizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base sm:text-lg",
  };

  return (
    <span className={cn("font-bold tracking-tight tabular-nums", tones[tone], sizes[size])}>
      {curr && <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground mr-0.5">{curr}</span>}
      {compactFmt(value)}
    </span>
  );
}

function run(fn: () => boolean, msg: string): boolean {
  const ok = fn();
  if (ok) toast.success(msg);
  else toast.error("Action could not be completed");
  return ok;
}

const inventoryInput =
  "w-full h-8 px-2.5 rounded-lg border border-border/60 bg-background/80 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors";

/* =========================================================================
   MAIN INVENTORY COMPONENT
   ========================================================================= */

function Inventory() {
  const navigate = useNavigate();
  const [acct, setAcct] = useState<Account | null>(null);
  const { lang } = useLanguage();
  const tr = (k: string) => translateCurrent(k, lang);
  const { theme, toggleTheme } = useTheme();

  // Navigation State
  const [main, setMain] = useState<MainMenu>("overview");
  const [sub, setSub] = useState<string>("Dashboard");

  // Deep-link barcode or search query passed from search
  const [searchBarcode, setSearchBarcode] = useState<string>("");

  useEffect(() => {
    const a = store.getAccount();
    if (!a) {
      navigate({ to: "/signup" });
      return;
    }
    if (!canOpen(a, "inventory")) {
      toast.error(tr("Inventory requires ShopBook Plus or Business plan"));
      navigate({ to: "/dashboard" });
      return;
    }
    setAcct(a);
  }, []);

  const s = useErp();
  const cur = acct?.currency || "KSh";
  const money = (n: number) => `${cur} ${clean(n)}`;
  const shopName = acct?.shopName || "My Shop";

  // Change main menu and auto-select its first sub-menu
  const changeMain = (m: MainMenu) => {
    setMain(m);
    setSub(SUBMENUS[m][0]);
  };

  // Direct jumper helper
  const go = (m: MainMenu, sName: string) => {
    setMain(m);
    setSub(sName);
  };

  const handleUnknownProduct = (code: string) => {
    setSearchBarcode(code);
    go("products & stock", "Add Product");
  };

  if (!acct) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-200">
      {/* 1. TOP APP BAR */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-xl border-b border-border/40 px-3 sm:px-6 py-2.5 transition-colors">
        <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
          {/* Left: Back + App Name + Shop Name */}
          <div className="flex items-center gap-2 min-w-0">
            <ShopButton
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/dashboard" })}
              className="h-8 px-2 text-xs flex items-center gap-1 shrink-0 rounded-lg hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">{tr("Apps")}</span>
            </ShopButton>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-foreground truncate">
                  {tr("Inventory")}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                  ERP
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">{shopName}</p>
            </div>
          </div>

          {/* Right: Theme Toggle + Connection + User Shop Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <ShopButton
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
              title={theme === "dark" ? tr("Switch to Light Mode") : tr("Switch to Dark Mode")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </ShopButton>

            <ConnectionStatus />

            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center text-xs font-bold shrink-0 ml-1">
              {shopName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* 2. MAIN HORIZONTAL NAVIGATION ROW */}
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-border/30">
          <Tabs
            items={["overview", "products & stock", "returns & transfers", "configuration"]}
            value={main}
            onChange={(k) => changeMain(k as MainMenu)}
            label={(k) => tr(MENU_LABELS[k as MainMenu])}
          />
        </div>

        {/* 3. SELECTED SUB-MENU ROW */}
        <div className="max-w-7xl mx-auto mt-1.5">
          <Tabs items={SUBMENUS[main]} value={sub} onChange={setSub} label={(k) => tr(k)} small />
        </div>
      </header>

      {/* 4. MAIN WORKSPACE CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 overflow-y-auto">
        {/* OVERVIEW SUBVIEWS */}
        {main === "overview" && sub === "Dashboard" && (
          <Overview s={s} money={money} tr={tr} go={go} cur={cur} shop={shopName} />
        )}
        {main === "overview" && sub === "Low Stock Alerts" && (
          <ProductList
            s={s}
            money={money}
            tr={tr}
            shop={shopName}
            onUnknown={handleUnknownProduct}
            forcedStatus="LOW"
          />
        )}

        {/* PRODUCTS & STOCK SUBVIEWS */}
        {main === "products & stock" && sub === "All Products" && (
          <ProductList s={s} money={money} tr={tr} shop={shopName} onUnknown={handleUnknownProduct} />
        )}
        {main === "products & stock" && sub === "Add Product" && (
          <AddProduct
            s={s}
            money={money}
            tr={tr}
            shop={shopName}
            barcode={searchBarcode}
            done={() => {
              setSearchBarcode("");
              setSub("All Products");
            }}
          />
        )}
        {main === "products & stock" && sub === "Stock In (Receive)" && (
          <StockInScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "products & stock" && sub === "Stock Out (Write-Off)" && (
          <StockOutScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "products & stock" && sub === "Stock History" && (
          <StockHistoryScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "products & stock" && sub === "Stock Adjustments" && (
          <AdjustmentsScreen s={s} money={money} tr={tr} shop={shopName} />
        )}

        {/* RETURNS & TRANSFERS SUBVIEWS */}
        {main === "returns & transfers" && sub === "Customer Returns" && (
          <CustomerReturnsScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "returns & transfers" && sub === "Supplier Returns" && (
          <SupplierReturnsScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "returns & transfers" && sub === "New Transfer" && (
          <NewTransferScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "returns & transfers" && sub === "Transfer History" && (
          <TransferHistoryScreen s={s} money={money} tr={tr} shop={shopName} />
        )}

        {/* CONFIGURATION & REPORTS SUBVIEWS */}
        {main === "configuration" && sub === "Product Setup" && (
          <ProductSetupScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "configuration" && sub === "Stock Configuration" && (
          <StockSetupScreen s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "configuration" && sub === "Valuation Report" && (
          <ValuationReport s={s} money={money} tr={tr} shop={shopName} />
        )}
        {main === "configuration" && sub === "Profits Report" && (
          <ProfitReport s={s} money={money} tr={tr} shop={shopName} />
        )}
      </main>
    </div>
  );
}

/* =========================================================================
   UI PRIMITIVES & CONTEXT HELPERS
   ========================================================================= */

type Ctx = {
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (k: string) => string;
  go: (m: MainMenu, sub: string) => void;
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
      {/* 4 Fluid KPI Cards — Single Row across phone and laptop */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">
            {tr("Total Products")}
          </span>
          <Amt value={totalProducts} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">
            {tr("Stock Value (Cost)")}
          </span>
          <Amt value={totalStockVal} curr={cur} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">
            {tr("Low Stock")}
          </span>
          <Amt value={lowStock.length} {...(lowStock.length > 0 ? { tone: "warn" as const } : {})} size="lg" />
        </div>

        <div
          onClick={() => go("products & stock", "All Products")}
          className="cursor-pointer rounded-xl bg-card/75 backdrop-blur-xl border border-border/50 p-2 sm:p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
        >
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">
            {tr("Out of Stock")}
          </span>
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
            onClick={() => go("products & stock", "Stock In (Receive)")}
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
                    onClick={() => go("products & stock", "Stock In (Receive)")}
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
function ProductList({
  s,
  money,
  tr,
  shop,
  onUnknown,
  forcedStatus,
}: Ctx & { onUnknown: (code: string) => void; forcedStatus?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState(forcedStatus || "all");
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
      {/* Row 1: Search & Scan on left + Export CSV on right */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <InventorySearch q={q} setQ={setQ} tr={tr} onScan={onUnknown} />
        </div>
        <ShopButton
          variant="outline"
          size="sm"
          onClick={exportCSV}
          className="h-9 px-3 text-xs shrink-0 flex items-center gap-1.5"
          title={tr("Export CSV")}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">{tr("Export CSV")}</span>
        </ShopButton>
      </div>

      {/* Row 2: Category and Status Filter Dropdowns */}
      <div className="flex gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="inventory-input text-xs flex-1 sm:w-40">
          <option value="all">{tr("All Categories")}</option>
          {s.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="inventory-input text-xs flex-1 sm:w-36"
        >
          <option value="all">{tr("All Status")}</option>
          <option value="OK">{tr("In Stock")}</option>
          <option value="LOW">{tr("Low Stock")}</option>
          <option value="OUT">{tr("Out of Stock")}</option>
        </select>
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

      {/* Squeezed POS-Style Compact Product Rows */}
      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/25">
          {filtered.length ? (
            filtered.map((p) => {
              const categoryName = s.categories.find((c) => c.id === p.categoryId)?.name;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="py-1.5 px-3 flex items-center justify-between text-xs hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-foreground text-xs sm:text-sm tracking-tight truncate">{p.name}</p>
                      <Status p={p} />
                      {p.variants && p.variants.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-medium text-muted-foreground">
                          {p.variants.length} {tr("sizes")}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate mt-0.5">
                      {categoryName ? `${categoryName} · ` : ""}
                      {p.sku ? `SKU: ${p.sku} · ` : ""}
                      {tr("Buy")}: {money(p.buy)} · {tr("Sell")}: {money(p.sell)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-xs sm:text-sm text-foreground tabular-nums">
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
    const buy = parseFloat(f.buy) || 0;
    const sell = parseFloat(f.sell) || 0;
    const finalQty = hasVariants ? totalVariantQty : parseFloat(f.qty) || 0;
    const minStock = parseFloat(f.minStock) || 5;

    if (
      run(() => {
        return erp.commit((state, c) => {
          const id = c.id();
          const p: erp.Product = {
            id,
            name: f.name.trim(),
            buy,
            sell,
            qty: finalQty,
            minStock,
            unit: f.unit,
            categoryId: showCategory && f.categoryId ? f.categoryId : undefined,
            brandId: showBrand && f.brandId ? f.brandId : undefined,
            barcode: showBarcode && f.barcode ? f.barcode.trim() : undefined,
            sku: showSKU && f.sku ? f.sku.trim() : undefined,
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
        {/* ROW 1: Product Name, Quantity, and Unit in the same line */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-6">
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
          <div className="sm:col-span-3">
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
          <div className="sm:col-span-3">
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

        {/* ROW 3: Category, Brand, Barcode, SKU & Alert Level in one row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 border-t border-border/30">
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn("text-xs h-7.5 w-full justify-center", showCategory && "bg-muted font-bold")}
            onClick={() => setShowCategory(!showCategory)}
          >
            + {tr("Category")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn("text-xs h-7.5 w-full justify-center", showBrand && "bg-muted font-bold")}
            onClick={() => setShowBrand(!showBrand)}
          >
            + {tr("Brand")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn("text-xs h-7.5 w-full justify-center", showBarcode && "bg-muted font-bold")}
            onClick={() => setShowBarcode(!showBarcode)}
          >
            + {tr("Barcode")}
          </ShopButton>
          <ShopButton
            type="button"
            variant="outline"
            size="sm"
            className={cn("text-xs h-7.5 w-full justify-center", showSKU && "bg-muted font-bold")}
            onClick={() => setShowSKU(!showSKU)}
          >
            + {tr("SKU & Alert")}
          </ShopButton>
        </div>

        {/* Optional Expandable Panels */}
        {showCategory && (
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/30 space-y-1">
            <InventoryField label={tr("Product Category")}>
              <select
                className={inventoryInput}
                value={f.categoryId}
                onChange={(e) => setF({ ...f, categoryId: e.target.value })}
              >
                <option value="">{tr("Select Category (Optional)")}</option>
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
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/30 space-y-1">
            <InventoryField label={tr("Brand / Manufacturer")}>
              <select
                className={inventoryInput}
                value={f.brandId}
                onChange={(e) => setF({ ...f, brandId: e.target.value })}
              >
                <option value="">{tr("Select Brand (Optional)")}</option>
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
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/30 space-y-1">
            <InventoryField label={tr("Barcode")}>
              <input
                className={inventoryInput}
                value={f.barcode}
                onChange={(e) => setF({ ...f, barcode: e.target.value })}
                placeholder={tr("Scan or enter barcode")}
              />
            </InventoryField>
          </div>
        )}

        {showSKU && (
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/30 grid grid-cols-2 gap-2">
            <InventoryField label={tr("SKU (Stock Keeping Unit)")}>
              <input
                className={inventoryInput}
                value={f.sku}
                onChange={(e) => setF({ ...f, sku: e.target.value })}
                placeholder={tr("e.g. TSH-COT-001")}
              />
            </InventoryField>
            <InventoryField label={tr("Low Stock Alert Level")}>
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

        {/* SIZES & VARIANTS SECTION */}
        <div className="pt-2 border-t border-border/30 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-foreground">{tr("Size Variants")}</p>
              <p className="text-[11px] text-muted-foreground">{tr("Track distinct sizes, quantities, and prices")}</p>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold select-none">
              <input
                type="checkbox"
                checked={hasVariants}
                onChange={(e) => setHasVariants(e.target.checked)}
                className="rounded border-border"
              />
              {tr("Enable Sizes")}
            </label>
          </div>

          {hasVariants && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-3">
              {/* Range & Freeform Generators */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Number Range */}
                <div className="p-2 rounded bg-background/60 border border-border/30 space-y-1.5">
                  <p className="font-semibold text-muted-foreground text-[11px]">
                    {tr("Number Range (e.g. 40 to 46)")}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={cn(inventoryInput, "h-7 text-xs")}
                      placeholder="From"
                      value={fromSize}
                      onChange={(e) => setFromSize(e.target.value)}
                    />
                    <input
                      className={cn(inventoryInput, "h-7 text-xs")}
                      placeholder="To"
                      value={toSize}
                      onChange={(e) => setToSize(e.target.value)}
                    />
                    <input
                      className={cn(inventoryInput, "h-7 text-xs w-16")}
                      placeholder="Step"
                      value={stepSize}
                      onChange={(e) => setStepSize(e.target.value)}
                    />
                    <ShopButton size="sm" type="button" onClick={generateRange} className="h-7 text-xs shrink-0">
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>

                {/* Freeform Tokens */}
                <div className="p-2 rounded bg-background/60 border border-border/30 space-y-1.5">
                  <p className="font-semibold text-muted-foreground text-[11px]">
                    {tr("Custom Sizes (e.g. S, M, L, XL, 2XL)")}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={cn(inventoryInput, "h-7 text-xs flex-1")}
                      placeholder="S, M, L, XL, 2XL"
                      value={freeform}
                      onChange={(e) => setFreeform(e.target.value)}
                    />
                    <ShopButton size="sm" type="button" onClick={addFreeformTokens} className="h-7 text-xs shrink-0">
                      {tr("Add")}
                    </ShopButton>
                  </div>
                </div>
              </div>

              {/* Variant Rows Table */}
              {variants.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground px-1">
                    <span>{tr("Size Name")}</span>
                    <div className="flex items-center gap-4">
                      <span>{tr("Opening Stock")}</span>
                      <span>{tr("Sell Price Override")}</span>
                      <span className="w-4"></span>
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
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
    <div className="max-w-xl mx-auto space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <h2 className="text-base font-bold text-foreground">{tr("Stock In — Record Received Goods")}</h2>
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
            {tr("Save Stock In")}
          </ShopButton>
        </div>
      </div>

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

          <InventoryField label={tr("Unit Cost (Optional)")}>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Supplier price"
            />
          </InventoryField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Supplier / Source")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Nairobi Distributors"
            />
          </InventoryField>

          <InventoryField label={tr("Invoice / Delivery Ref")}>
            <input
              className={inventoryInput}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. INV-2026-081"
            />
          </InventoryField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Receiving Location")}>
            <input
              className={inventoryInput}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Store / Shelf"
            />
          </InventoryField>

          <InventoryField label={tr("Batch / Lot Number")}>
            <input
              className={inventoryInput}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="e.g. BATCH-A1"
            />
          </InventoryField>
        </div>

        <InventoryField label={tr("Expiry Date (Optional)")}>
          <input type="date" className={inventoryInput} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </InventoryField>

        <InventoryField label={tr("Notes / Remarks")}>
          <textarea
            className="w-full h-16 p-2 rounded-lg border border-border/60 bg-background/80 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Add any observations, packaging state, or carrier details")}
          />
        </InventoryField>
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

  const p = s.products.find((x) => x.id === pid);

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
    if (p && qNum > p.qty) {
      toast.error(tr("Quantity exceeds current stock"));
      return;
    }
    const detail = `${reason}${notes ? ` • ${notes}` : ""}`;
    if (run(() => erp.stockOut(pid, qNum, detail), tr("Stock out recorded"))) {
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
    <div className="max-w-xl mx-auto space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <h2 className="text-base font-bold text-foreground">{tr("Stock Out — Non-Sale Write-Off")}</h2>
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
            {tr("Record Stock Out")}
          </ShopButton>
        </div>
      </div>

      <div className="rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        <InventoryField label={tr("Product")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Current Stock")}>
            <input className={cn(inventoryInput, "bg-muted font-bold")} readOnly value={p ? p.qty : "—"} />
          </InventoryField>

          <InventoryField label={tr("Quantity to Remove")} required>
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

        <InventoryField label={tr("Reason for Write-Off")} required>
          <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Damaged">{tr("Damaged Goods")}</option>
            <option value="Expired">{tr("Expired / Outdated")}</option>
            <option value="Lost / Stolen">{tr("Lost / Stolen / Discrepancy")}</option>
            <option value="Personal Use">{tr("Owner Personal Use")}</option>
            <option value="Internal Consumption">{tr("Shop / Office Consumption")}</option>
            <option value="Sample">{tr("Marketing / Free Sample")}</option>
          </select>
        </InventoryField>

        <InventoryField label={tr("Notes / Authorization")}>
          <textarea
            className="w-full h-16 p-2 rounded-lg border border-border/60 bg-background/80 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Authorized by, incident description, or disposal ref")}
          />
        </InventoryField>
      </div>
    </div>
  );
}

/** 2.5 Stock History Screen */
function StockHistoryScreen({ s, tr }: Ctx) {
  const [filterType, setFilterType] = useState<string>("all");

  const moves = useMemo(() => {
    return s.movements.filter((m) => filterType === "all" || m.type === filterType);
  }, [s.movements, filterType]);

  const typeColor = (t: string) => {
    switch (t) {
      case "OPENING":
      case "PURCHASE":
      case "TRANSFER_IN":
      case "RETURN_CUSTOMER":
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
      case "SALE":
      case "TRANSFER_OUT":
      case "RETURN_SUPPLIER":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
      default:
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold text-foreground">{tr("Stock Movement Audit Trail")}</h2>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {["all", "OPENING", "PURCHASE", "SALE", "ADJUST", "TRANSFER_IN", "TRANSFER_OUT"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-semibold transition-colors shrink-0",
                filterType === t
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
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

        <div className="divide-y divide-border/20 max-h-[600px] overflow-y-auto">
          {moves.length ? (
            moves.map((m) => {
              const p = s.products.find((prod) => prod.id === m.productId);
              return (
                <div key={m.id} className="py-1.5 px-3 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-extrabold", typeColor(m.type))}>
                        {m.type}
                      </span>
                      <p className="font-bold text-foreground text-xs sm:text-sm truncate">
                        {p?.name || tr("Unknown Item")}
                      </p>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate mt-0.5">
                      {m.source} · {dt(m.at)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "font-extrabold text-xs sm:text-sm tabular-nums",
                        m.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {tr("Bal")}: {m.next} {p?.unit || "pcs"}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>{tr("No stock movements found")}</Empty>
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

  const cancel = () => {
    setPid("");
    setCounted("");
    setNotes("");
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Header with Title + Red Cancel & Green Save on the right in the same line */}
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
              className={inventoryInput}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="Counted units"
            />
          </InventoryField>
        </div>

        {counted !== "" && (
          <div
            className={cn(
              "p-2 rounded-lg text-xs font-semibold flex items-center justify-between",
              diff === 0 && "bg-muted/50 text-muted-foreground",
              diff > 0 && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
              diff < 0 && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
            )}
          >
            <span>{tr("Stock Discrepancy Variance")}:</span>
            <span className="font-extrabold text-sm tabular-nums">
              {diff > 0 ? `+${diff}` : diff} {p?.unit || "units"}
            </span>
          </div>
        )}

        <InventoryField label={tr("Adjustment Reason")} required>
          <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Physical stock count">{tr("Routine Stock Count Audit")}</option>
            <option value="Shrinkage / Theft">{tr("Unexplained Shrinkage / Theft")}</option>
            <option value="Found Stock">{tr("Found / Unrecorded Stock")}</option>
            <option value="Damaged in Storage">{tr("Damaged in Storage")}</option>
            <option value="Unit Conversion / Packing Error">{tr("Unit Conversion / Packing Error")}</option>
          </select>
        </InventoryField>

        <InventoryField label={tr("Notes / Justification")}>
          <textarea
            className="w-full h-16 p-2 rounded-lg border border-border/60 bg-background/80 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Detailed discrepancy explanation or audit reference")}
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
  const [condition, setCondition] = useState<"RESTOCK" | "DAMAGED">("RESTOCK");
  const [reason, setReason] = useState("Defective item");
  const [refundMethod, setRefundMethod] = useState("Cash");

  const resetForm = () => {
    setQty("");
    setSaleRef("");
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

    if (
      run(() => {
        return erp.commit((state, c) => {
          const detail = `Customer Return • ${saleRef || "Direct"} • ${reason} • Refund: ${refundMethod}`;
          if (condition === "RESTOCK") {
            c.move(pid, "RETURN_CUSTOMER", qNum, detail, c.nextRef("RET"));
          } else {
            c.audit("RETURN DAMAGED", `${pid} qty ${qNum} not restocked (${reason})`);
          }
        });
      }, tr("Customer return processed"))
    ) {
      resetForm();
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-3">
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
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Original Sale Ref / Customer")}>
            <input
              className={inventoryInput}
              value={saleRef}
              onChange={(e) => setSaleRef(e.target.value)}
              placeholder="e.g. REC-1024 or Walk-in"
            />
          </InventoryField>
          <InventoryField label={tr("Refund Method")}>
            <select className={inventoryInput} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              <option value="Cash">{tr("Cash Refund")}</option>
              <option value="M-Pesa">{tr("M-Pesa")}</option>
              <option value="Bank">{tr("Bank Transfer")}</option>
              <option value="Credit">{tr("Store Credit Note")}</option>
              <option value="Exchange">{tr("Direct Exchange (No Cash)")}</option>
            </select>
          </InventoryField>
        </div>

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
          <InventoryField label={tr("Item Condition")} required>
            <select
              className={inventoryInput}
              value={condition}
              onChange={(e) => setCondition(e.target.value as "RESTOCK" | "DAMAGED")}
            >
              <option value="RESTOCK">{tr("Restock to Inventory")}</option>
              <option value="DAMAGED">{tr("Damaged (Do Not Restock)")}</option>
            </select>
          </InventoryField>
        </div>

        <InventoryField label={tr("Return Reason")}>
          <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Defective item">{tr("Defective / Faulty Item")}</option>
            <option value="Wrong size/color">{tr("Wrong Size / Color / Model")}</option>
            <option value="Customer changed mind">{tr("Customer Changed Mind")}</option>
            <option value="Expired">{tr("Expired / Stale")}</option>
          </select>
        </InventoryField>
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
    <div className="max-w-xl mx-auto space-y-3">
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
        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Supplier")}>
            <input
              className={inventoryInput}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Kenya Breweries Ltd"
            />
          </InventoryField>
          <InventoryField label={tr("Original Purchase Order / Inv")}>
            <input
              className={inventoryInput}
              value={purchaseRef}
              onChange={(e) => setPurchaseRef(e.target.value)}
              placeholder="e.g. PO-8891"
            />
          </InventoryField>
        </div>

        <InventoryField label={tr("Product to Return")} required>
          <InventoryProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
        </InventoryField>

        <div className="grid grid-cols-2 gap-2">
          <InventoryField label={tr("Quantity to Return")} required>
            <input
              type="number"
              step="any"
              className={inventoryInput}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </InventoryField>
          <InventoryField label={tr("Resolution Expected")} required>
            <select className={inventoryInput} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="Supplier Credit Note">{tr("Supplier Credit Note")}</option>
              <option value="Cash Refund">{tr("Cash / Bank Refund")}</option>
              <option value="Replacement Pending">{tr("Replacement Goods Pending")}</option>
            </select>
          </InventoryField>
        </div>

        <InventoryField label={tr("Reason for Return")}>
          <select className={inventoryInput} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Damaged on delivery">{tr("Damaged on Delivery / Packaging Compromised")}</option>
            <option value="Expired">{tr("Received Near Expiry or Expired")}</option>
            <option value="Wrong item shipped">{tr("Wrong Item / Incorrect Spec Shipped")}</option>
            <option value="Over-supplied">{tr("Over-Supplied Beyond Purchase Order")}</option>
          </select>
        </InventoryField>
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
    <div className="max-w-xl mx-auto space-y-3">
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
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
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

  const activeCategory = s.categories.find((c) => c.id === selectedCatId);
  const activeBrand = s.brands.find((b) => b.id === selectedBrandId);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Product Setup & Master Catalog Configuration")}</h2>

      {/* Categories Dropdown & Quick Add */}
      <Box title={tr("Categories")} sub={tr("Select and manage registered product categories")}>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              className={cn(inventoryInput, "text-xs flex-1")}
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
            >
              <option value="">
                {tr("Choose a Category...")} ({s.categories.length})
              </option>
              {s.categories.map((c) => {
                const count = s.products.filter((p) => p.categoryId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} {tr("products")})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex gap-2 pt-1 border-t border-border/30">
            <input
              className={cn(inventoryInput, "text-xs flex-1")}
              placeholder={tr("Add new category name...")}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <ShopButton size="sm" onClick={addCategory}>
              {tr("Add Category")}
            </ShopButton>
          </div>

          {activeCategory && (
            <p className="text-[11px] text-muted-foreground pt-1">
              {tr("Selected")}: <span className="font-semibold text-foreground">{activeCategory.name}</span>
            </p>
          )}
        </div>
      </Box>

      {/* Brands Dropdown & Quick Add */}
      <Box title={tr("Brands")} sub={tr("Select and manage registered manufacturers and labels")}>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              className={cn(inventoryInput, "text-xs flex-1")}
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
            >
              <option value="">
                {tr("Choose a Brand...")} ({s.brands.length})
              </option>
              {s.brands.map((b) => {
                const count = s.products.filter((p) => p.brandId === b.id).length;
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} ({count} {tr("products")})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex gap-2 pt-1 border-t border-border/30">
            <input
              className={cn(inventoryInput, "text-xs flex-1")}
              placeholder={tr("Add new brand name...")}
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
            />
            <ShopButton size="sm" onClick={addBrand}>
              {tr("Add Brand")}
            </ShopButton>
          </div>

          {activeBrand && (
            <p className="text-[11px] text-muted-foreground pt-1">
              {tr("Selected")}: <span className="font-semibold text-foreground">{activeBrand.name}</span>
            </p>
          )}
        </div>
      </Box>

      {/* Units of Measurement */}
      <Box title={tr("Units of Measurement")} sub={tr("Standard units for buying and selling")}>
        <div className="flex flex-wrap gap-1.5">
          {["Piece", "Kg", "Gram", "Litre", "Millilitre", "Box", "Carton", "Packet", "Metre"].map((u) => (
            <span
              key={u}
              className="text-xs px-2.5 py-1 rounded-lg bg-muted/60 border border-border/40 text-foreground font-medium"
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
  onClose,
}: {
  p: erp.Product;
  s: erp.ErpState;
  money: (n: number) => string;
  tr: (t: string) => string;
  onClose: () => void;
}) {
  const cat = s.categories.find((c) => c.id === p.categoryId)?.name;
  const brand = s.brands.find((b) => b.id === p.brandId)?.name;
  const rows: [string, string][] = [
    [tr("Quantity"), `${p.qty} ${p.unit ?? ""}`.trim()],
    [tr("Buying price"), money(p.buy)],
    [tr("Selling price"), money(p.sell)],
    [tr("Stock value"), money(p.qty * p.buy)],
    [tr("Category"), cat ?? "—"],
    [tr("Brand"), brand ?? "—"],
    [tr("Barcode"), p.barcode || "—"],
    [tr("SKU"), p.sku || "—"],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="inventory-box w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold truncate">{p.name}</h3>
          <ShopButton variant="outline" onClick={onClose}>
            {tr("Close")}
          </ShopButton>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-2">
              <p className="text-[10px] text-muted-foreground">{k}</p>
              <p className="font-semibold truncate">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
