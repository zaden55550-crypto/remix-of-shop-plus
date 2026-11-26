import { clean } from "@/lib/format";
import { useFeature } from "@/lib/use-features";
import { WholesaleFields, readWholesale, wholesaleDraft } from "@/components/shopbook/wholesale-fields";
import { GasCylinders } from "@/components/shopbook/gas-cylinders";
import { BreakdownPage, PrescriptionsPage } from "@/components/shopbook/trade-docs";
import { ReorderPanel, ShopPrices, StockCount, VoiceAdd } from "@/components/shopbook/shop-tools-panels";
import { ExpiryList } from "@/components/shopbook/expiry-list";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useScreenFit } from "@/lib/fill-screen";
import { wholeFigures } from "@/lib/exact-amount";
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
  Database,
  Ban,
  Upload,
  Boxes,
} from "lucide-react";
import { findByCurrency } from "@/lib/world-data";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { store, canOpen, APPS, type Account } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { GlassPage } from "@/components/shopbook/glass-page";
import { KPI_COLOR } from "@/components/shopbook/kpi";
import { usePeriod } from "@/lib/period";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import { revealTab } from "@/lib/fit-text";
import * as erp from "@/lib/erp";
import { lastBackup } from "@/lib/backup";
import { startView, viewSearch } from "@/lib/deep-link";
import { download } from "@/lib/download";
import * as fin from "@/lib/finance";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { useShopErp } from "@/components/shopbook/product-search";
import { ProductListHead, ProductRow } from "@/components/shopbook/product-catalog";
import { AttributePicker, BarcodeInput, ImageChooser, NamedSearch, ProductWorkspace, PwField } from "@/components/shopbook/product-workspace";
import { ProductSetup } from "@/components/shopbook/product-setup";
import { activeAttributes, countLabel, unitNames } from "@/lib/catalog";
import { useSettings } from "@/lib/settings-config";
import { connectedShops, isActiveLocation, listLocations, storageStock, type StorageStock } from "@/lib/locations";
import { ListScreen, type Col } from "@/components/shopbook/purchase-ui";
import { BarcodeLabels } from "@/components/shopbook/daily-tools";
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
      { title: "Inventory — DataQuill Solutions" },
      {
        name: "description",
        content: "Products, stock levels, stock in/out, customer and supplier returns, transfers and configuration.",
      },
      { property: "og:title", content: "Inventory — DataQuill Solutions" },
      { property: "og:description", content: "The single source of truth for products and stock in DataQuill Solutions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: viewSearch,
  component: Inventory,
});

/** 4-Menu Architecture matching specification */
const MENUS = {
  overview: [],
  "products & stock": ["All Products", "Add Product", "Stock In", "Stock Out", "Stock History", "Adjustments", "Expiry", "Gas Cylinders", "Breakdown", "Prescriptions", "Stock Count", "Reorder", "Shop Prices", "Quick Add", "Labels"],
  "returns & transfers": ["Customer Returns", "Supplier Returns", "New Transfer", "Transfer History", "Warehouse Stock"],
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

const activeStorage = (s: erp.ErpState) => s.locations.filter((l) => erp.isStorageLocation(l) && isActiveLocation(l));

const dt = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const OTHER_LOCATION = "__other_location__";
function inventoryLocations(s: erp.ErpState, shop: string, branches: { name: string }[]) {
  const seen = new Set<string>();
  return [shop, ...listLocations(s).filter(isActiveLocation).map((l) => l.name), ...branches.map((branch) => branch.name)]
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Compact number formatter: full numbers with commas on big screens; elsewhere M for >=1M, B for >=1B */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n) || Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  if (!wholeFigures() && abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (!wholeFigures() && abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
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
        data-fit-text
        className={cn(
          "font-extrabold tracking-tight tabular-nums truncate",
          toneClass,
          size === "xs" && "text-xs",
          size === "sm" && "text-sm",
          size === "md" && (isHuge ? "text-sm" : isLarge ? "text-base" : "text-lg"),
          // Fluid on phones: a fixed 20px hid digits ("56....") in four narrow cards at 320px.
          size === "lg" &&
            (isHuge ? "text-[clamp(12px,3.2vw,16px)]" : isLarge ? "text-[clamp(13px,3.6vw,18px)]" : "text-[clamp(14px,4vw,20px)]"),
        )}
      >
        {formatted}
      </span>
      {symbol && (
        <sup
          className={cn(
            "font-semibold shrink-0 select-none ml-0.5 relative top-0 leading-tight",
            toneClass,
            size === "xs" && "text-[10px]",
            size === "sm" && "text-[10px]",
            size === "md" && "text-[10px]",
            size === "lg" && "text-[11px]",
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
  const [acct, setAcct] = useState<Account | null>(null);
  // Tablets, laptops and desktops: the whole Inventory screen on one full screen (src/lib/fill-screen.ts).
  const screenRef = useRef<HTMLElement>(null);
  useScreenFit(screenRef, { min: 0.6, scroller: ".inventory-content" }); // min 1: text keeps its size, long content scrolls inside
  // A Dashboard link may name the starting tab and a product filter (?menu=…&sub=…&filter=LOW).
  const search = Route.useSearch();
  const [start] = useState(() => startView(MENUS, search, "overview"));
  const [menu, setMenu] = useState<Menu>(start[0] as Menu);
  const [sub, setSub] = useState<string>(start[1]);
  const [linkFilter, setLinkFilter] = useState(search.filter ?? "all");
  const [prefillBarcode, setPrefill] = useState("");
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [registering, setRegistering] = useState<{ kind: "categories" | "brands"; name: string } | null>(null);
  const per = usePeriod(null);

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

  const s = useShopErp();
  // Gas cylinder exchange: its Gas Cylinders page shows only while the feature is on.
  const gasOn = useFeature("gas");
  const breakdownOn = useFeature("breakdown"), rxOn = useFeature("prescriptions");
  const cur = acct?.currency || "USD";
  const currencyLabel = /^[A-Za-z]{3,5}$/.test(cur) ? cur.toLocaleLowerCase() : cur;
  const money = (n: number) =>
    `${currencyLabel} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const go = (m: Menu, sm?: string) => {
    setLinkFilter("all");
    setMenu(m);
    setSub(sm ?? MENUS[m][0] ?? "");
  };

  const ctx: Ctx = {
    s,
    money,
    tr,
    go,
    cur,
    acct,
    since: per.range.from,
    until: per.range.to,
    shop: acct?.shopName || "Main Shop",
    onUnknown: (code: string) => {
      setPrefill(code);
      go("products & stock", "Add Product");
    },
    showProducts: (filter: string) => {
      go("products & stock", "All Products");
      setLinkFilter(filter);
    },
  };


  // Like the other apps: wait for the device account, so the server render (no device data) matches.
  if (!acct) return <main className="shop-app inventory-app inventory-screen app-screen flex flex-col min-h-screen" />;

  return (
    <main ref={screenRef} className="shop-app inventory-app inventory-screen app-screen fit-screen flex flex-col min-h-screen">
      {/* 1. The shared app header (the Dashboard's), with Inventory's working date filter */}
      <header className="sticky top-0 z-30">
        <GlobalApplicationHeader
          title="Inventory"
          shop={acct?.shopName || ""}
          moduleFirst
          period={menu === "overview" || sub === "Stock History" || sub === "Transfer History" ? per : undefined}
        />
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
          // Add Product opens from the button on All Products, which stays the lit tab behind it.
          <Tabs small items={[...MENUS[menu]].filter((k: string) => k !== "Add Product" && (k !== "Gas Cylinders" || gasOn) && (k !== "Breakdown" || breakdownOn) && (k !== "Prescriptions" || rxOn))} value={sub === "Add Product" ? "All Products" : sub} onChange={setSub} label={(k) => tr(k)} />
        )}
      </nav>

      {/* 3. The working canvas stays behind each workflow, just as it does in Purchases. */}
      <section className="inventory-content flex-1">
        {menu === "overview" || menu === "returns & transfers" || menu === "configuration" ? (
          <Overview {...ctx} />
        ) : (
          <ProductWorkspace
            key={linkFilter}
            s={s}
            tr={tr}
            money={ctx.money}
            shop={ctx.shop}
            initialStatus={linkFilter}
            onAdd={() => setSub("Add Product")}
            onUnknown={(code) => {
              setPrefill(code);
              setSub("Add Product");
            }}
          />
        )}
      </section>

      {/* Inventory forms and histories use the same translucent, blurred page as Add Purchase. */}
      {menu === "products & stock" && sub === "Add Product" && (
        <GlassPage label={tr("Register New Product")} onClose={() => go("products & stock", "All Products")}>
          <AddProduct
            {...ctx}
            barcode={prefillBarcode}
            draft={addDraft}
            onRegister={(kind, name, draft) => {
              setAddDraft(draft);
              setRegistering({ kind, name });
              setMenu("configuration");
              setSub("Product Setup");
            }}
            done={() => {
              setAddDraft(null);
              setPrefill("");
              setSub("All Products");
            }}
          />
        </GlassPage>
      )}
      {menu === "products & stock" && sub === "Stock In" && (
        <GlassPage label={tr("Stock In — Record Received Goods")} onClose={() => go("products & stock", "All Products")}>
          <StockInScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "products & stock" && sub === "Stock Out" && (
        <GlassPage label={tr("Stock Out — Non-Sale Write-Off")} onClose={() => go("products & stock", "All Products")}>
          <StockOutScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "products & stock" && sub === "Stock History" && (
        <GlassPage label={tr("Stock Audit Trail")} onClose={() => go("products & stock", "All Products")}>
          <StockHistoryScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "products & stock" && sub === "Adjustments" && (
        <GlassPage label={tr("Stock Adjustment — Physical Count Correction")} onClose={() => go("products & stock", "All Products")}>
          <AdjustmentsScreen {...ctx} />
        </GlassPage>
      )}

      {menu === "products & stock" && (sub === "Stock Count" || sub === "Reorder" || sub === "Shop Prices" || sub === "Quick Add" || sub === "Labels") && (
        <GlassPage label={tr(sub)} onClose={() => go("products & stock", "All Products")}>
          {sub === "Stock Count" ? <StockCount s={s} /> : sub === "Reorder" ? <ReorderPanel s={s} /> : sub === "Shop Prices" ? <ShopPrices s={s} money={money} /> : sub === "Labels" ? <BarcodeLabels s={s} money={money} /> : <VoiceAdd />}
        </GlassPage>
      )}

      {menu === "products & stock" && sub === "Breakdown" && (
        <GlassPage label={tr("Breakdown")} onClose={() => go("products & stock", "All Products")}>
          <BreakdownPage s={s} money={money} />
        </GlassPage>
      )}

      {menu === "products & stock" && sub === "Prescriptions" && (
        <GlassPage label={tr("Prescriptions")} onClose={() => go("products & stock", "All Products")}>
          <PrescriptionsPage s={s} />
        </GlassPage>
      )}

      {menu === "products & stock" && sub === "Gas Cylinders" && (
        <GlassPage label={tr("Gas Cylinders")} onClose={() => go("products & stock", "All Products")}>
          <GasCylinders s={s} money={money} />
        </GlassPage>
      )}

      {menu === "products & stock" && sub === "Expiry" && (
        <GlassPage label={tr("Expiry — Batches Expired or Expiring Soon")} onClose={() => go("products & stock", "All Products")}>
          <ExpiryList tr={tr} money={ctx.money} />
        </GlassPage>
      )}

      {menu === "returns & transfers" && sub === "Customer Returns" && (
        <GlassPage label={tr("Customer Returns — Receive Returned Goods")} onClose={() => go("overview")}>
          <CustomerReturnsScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "returns & transfers" && sub === "Supplier Returns" && (
        <GlassPage label={tr("Supplier Returns — Return Goods to Supplier")} onClose={() => go("overview")}>
          <SupplierReturnsScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "returns & transfers" && sub === "New Transfer" && (
        <GlassPage label={tr("New Transfer — Move Stock Between Locations")} onClose={() => go("overview")}>
          <NewTransferScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "returns & transfers" && sub === "Transfer History" && (
        <GlassPage label={tr("Transfer Audit Trail")} onClose={() => go("overview")}>
          <TransferHistoryScreen {...ctx} />
        </GlassPage>
      )}
      {menu === "returns & transfers" && sub === "Warehouse Stock" && (
        <GlassPage label={tr("Warehouse Stock")} onClose={() => go("overview")}>
          <WarehouseStockScreen {...ctx} />
        </GlassPage>
      )}

      {menu === "configuration" && sub === "Product Setup" && (
        <GlassPage label={tr("Product Setup")} onClose={() => go("products & stock", "All Products")}>
          <ProductSetup
            {...ctx}
            registering={registering}
            onRegistered={(id) => {
              const kind = registering?.kind;
              if (id && kind && addDraft) setAddDraft({ ...addDraft, f: { ...addDraft.f, [kind === "categories" ? "categoryId" : "brandId"]: id } });
              setRegistering(null);
              setMenu("products & stock");
              setSub("Add Product");
            }}
          />
        </GlassPage>
      )}
      {menu === "configuration" && sub === "Stock Setup" && (
        <GlassPage label={tr("Stock Setup & Warehouse Rules")} onClose={() => go("products & stock", "All Products")}>
          <StockSetupScreen {...ctx} />
        </GlassPage>
      )}
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
  /** Start of the header date filter; history lists show records from here on. */
  since: number;
  until: number;
  onUnknown?: (code: string) => void;
  /** Opens All Products with a status filter (all, LOW, OUT, ATTENTION). */
  showProducts: (filter: string) => void;
};
type Range = "today" | "week" | "month" | "all";
function rangeStart(r: Range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "today") return d.getTime();
  if (r === "week") return d.getTime() - 6 * 864e5;
  if (r === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return 0;
}
/** Stock History filter groups → the movement types each one covers. */
const MOVE_GROUPS: Record<string, erp.MoveType[]> = {
  IN: ["OPENING", "PURCHASE", "STOCK IN", "RETURN"],
  SALE: ["SALE"],
  OUT: ["STOCK OUT"],
  ADJUST: ["ADJUSTMENT"],
  TRANSFER: ["TRANSFER OUT", "TRANSFER IN", "TRANSFER CANCEL"],
};
/** CSV text: quotes doubled and a leading =+-@ neutralised, so names can't break columns or run as spreadsheet formulas. */
const csv = (rows: unknown[][]) =>
  rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`).join(",")).join("\n");
const groupOf = (t: erp.MoveType) => Object.keys(MOVE_GROUPS).find((g) => MOVE_GROUPS[g]!.includes(t)) ?? "";
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
          ref={value === k ? revealTab : null}
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

function Status({ p, className }: { p: erp.Product; className?: string }) {
  const st = erp.stockStatus(p);
  return (
    <span
      data-status={st}
      className={cn(
        "px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider shrink-0",
        className,
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

function Overview({ s, tr, go, cur, since, until, showProducts }: Ctx) {
  const totalStockVal = s.products.reduce((acc, p) => acc + (p.qty || 0) * (p.buy || 0), 0);
  const lowStock = s.products.filter((p) => erp.stockStatus(p) === "LOW");
  const outOfStock = s.products.filter((p) => erp.stockStatus(p) === "OUT");

  // Panels hold up to 12 rows and scroll inside themselves, so the page layout never changes.
  const recentIn = s.movements.filter((m) => m.at >= since && m.at <= until && m.qty > 0).slice(0, 12);
  const recentOut = s.movements.filter((m) => m.at >= since && m.at <= until && m.qty < 0 && m.type !== "SALE").slice(0, 12);
  const name = (id: string) => s.products.find((p) => p.id === id)?.name || tr("Deleted product");

  // Same four cards in one row on every screen; each opens the product list behind its figure.
  const kpis = [
    { label: "Total Products", icon: Package, tone: KPI_COLOR.info, value: compactFmt(s.products.filter((p) => !p.archived).length), curr: "", open: () => showProducts("all") },
    { label: "Stock Value", icon: Database, tone: KPI_COLOR.good, value: compactFmt(totalStockVal), curr: toCurrencySymbol(cur), open: () => showProducts("all") },
    { label: "Low Stock", icon: TriangleAlert, tone: KPI_COLOR.warn, value: compactFmt(lowStock.length), curr: "", open: () => showProducts("LOW") },
    { label: "Out of Stock", icon: Ban, tone: KPI_COLOR.bad, value: compactFmt(outOfStock.length), curr: "", open: () => showProducts("OUT") },
  ];

  const activity = (p: {
    title: string;
    sub: string;
    icon: typeof Package;
    tone: string;
    rows: erp.Movement[];
    meta: (m: erp.Movement) => string;
    empty: string;
  }) => (
    <section className="inventory-box inv-panel" style={{ "--tone": p.tone } as CSSProperties}>
      <div className="inv-panel-head">
        <span className="inv-icon">
          <p.icon />
        </span>
        <div className="inv-panel-title">
          <h3>{tr(p.title)}</h3>
          <p>{tr(p.sub)}</p>
        </div>
      </div>
      {p.rows.length ? (
        <ul className="inv-rows">
          {p.rows.map((m) => (
            <li key={m.id} className="inv-row">
              <span className="inv-dot" />
              <span className="inv-name" title={name(m.productId)}>
                {name(m.productId)}
              </span>
              <span className="inv-meta" title={p.meta(m)}>
                {p.meta(m)}
              </span>
              <span className="inv-qty">
                <i className={m.qty > 0 ? "inv-sign is-in" : "inv-sign is-out"}>{m.qty > 0 ? "+" : "-"}</i>
                {Math.abs(m.qty)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty compact>{tr(p.empty)}</Empty>
      )}
    </section>
  );

  return (
    <div className="inv-overview app-overview">
      {/* 1. Four KPI cards in one row on every screen */}
      <div className="inv-kpis app-overview-metrics">
        {kpis.map((k) => (
          <button key={k.label} type="button" className="dash-kpi" style={{ "--tone": k.tone } as CSSProperties} onClick={k.open}>
            <span className="dash-kpi-icon">
              <k.icon />
            </span>
            <span className="dash-kpi-body">
              <span className="dash-kpi-label">{tr(k.label)}</span>
              <span className="dash-money dash-kpi-value" data-fit-text="money">
                {k.curr && <small>{k.curr}</small>}
                {k.value}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* 2. Recent Stock In | Recent Stock Out — two columns on every screen */}
      <div className="inv-activity app-overview-panels">
        {activity({
          title: "Recent Stock In",
          sub: "Goods received into inventory",
          icon: Download,
          tone: "#22c55e",
          rows: recentIn,
          meta: (m) => [dt(m.at), m.source].filter(Boolean).join(" · "),
          empty: "No recent receipts",
        })}
        {activity({
          title: "Recent Stock Out",
          sub: "Non-sale inventory removals",
          icon: Upload,
          tone: "#f43f5e",
          rows: recentOut,
          meta: (m) => [dt(m.at), m.reason || m.type].filter(Boolean).join(" · "),
          empty: "No non-sale write-offs",
        })}
      </div>

      {/* 3. Stock needs attention (low and out together) — full width below */}
      <section className="inventory-box inv-panel app-overview-featured" style={{ "--tone": "#f59e0b" } as CSSProperties}>
        <div className="inv-panel-head">
          <span className="inv-icon">
            <Boxes />
          </span>
          <div className="inv-panel-title">
            <h3>{tr("Stock needs attention")}</h3>
            <p>{tr("Low-stock and out-of-stock products requiring replenishment")}</p>
          </div>
        </div>
        {lowStock.length || outOfStock.length ? (
          <ul className="inv-rows inv-low">
            {[...outOfStock, ...lowStock].map((p) => (
              <li key={p.id} className="inv-row">
                <div className="inv-low-text">
                  <p className="inv-name">{p.name}</p>
                  <p className="inv-meta">
                    {tr("Available")}: {countLabel(s, p.qty, p.unit)} · {tr("Reorder level")}: {p.minStock ?? erp.DEFAULT_MIN_STOCK}
                  </p>
                </div>
                <Status p={p} className="inv-status" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="inv-empty">
            <CheckCircle2 />
            <span>{tr("All products are well stocked")}</span>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================================
   2. PRODUCTS & STOCK
   ========================================================================= */

/** 2.2 Add Product */
/** An unfinished Add Product form, kept while its category or brand is being registered. */
type AddDraft = {
  f: { name: string; buy: string; sell: string; qty: string; categoryId: string; brandId: string; sku: string; barcode: string; unit: string; pieces: string; description: string; image: string };
  ticks: { category: boolean; brand: boolean; sku: boolean; barcode: boolean };
  hasVariants: boolean;
  variants: { id: string; name: string; qty: string; sell?: string }[];
  attributes: Record<string, string[]>;
  showAttributes: boolean;
};

function AddProduct({ s, tr, barcode, done, draft, onRegister }: Ctx & { barcode: string; done: () => void; draft: AddDraft | null; onRegister: (kind: "categories" | "brands", name: string, draft: AddDraft) => void }) {
  const blank = {
    name: "",
    buy: "0",
    sell: "0",
    qty: "0",
    categoryId: "",
    brandId: "",
    sku: "",
    barcode: barcode || "",
    unit: "Piece",
    pieces: "1",
    description: "",
    image: "",
  };
  const [f, setF] = useState(draft?.f ?? blank);
  // Wholesale & retail prices: an optional wholesale price from a set quantity (shown while the feature is on).
  const levels = useFeature("priceLevels");
  const [ws, setWs] = useState(() => wholesaleDraft());
  const noTicks = { category: false, brand: false, sku: false, barcode: Boolean(barcode) };
  const [ticks, setTicks] = useState(draft?.ticks ?? noTicks);
  /** Unticking clears that detail, so what isn't ticked is never saved. */
  const tick = (k: keyof typeof ticks, on: boolean) => {
    setTicks({ ...ticks, [k]: on });
    if (!on) setF({ ...f, ...{ category: { categoryId: "" }, brand: { brandId: "" }, sku: { sku: "" }, barcode: { barcode: "" } }[k] });
  };
  const usedBy = (value: string, key: "sku" | "barcode") => {
    const code = value.trim().toLowerCase();
    return code ? s.products.find((p) => p[key]?.toLowerCase() === code) : undefined;
  };
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const saving = useRef(false);
  const [attributes, setAttributes] = useState<Record<string, string[]>>(draft?.attributes ?? {});
  const [showAttributes, setShowAttributes] = useState(draft?.showAttributes ?? false);

  // Variant generator state
  const [hasVariants, setHasVariants] = useState(draft?.hasVariants ?? false);
  const [variants, setVariants] = useState<{ id: string; name: string; qty: string; sell?: string }[]>(draft?.variants ?? []);
  const [fromSize, setFromSize] = useState("");
  const [toSize, setToSize] = useState("");
  const [stepSize, setStepSize] = useState("1");
  const [freeform, setFreeform] = useState("");

  const generateRange = () => {
    const from = parseInt(fromSize, 10);
    const to = parseInt(toSize, 10);
    const step = parseInt(stepSize, 10) || 1;
    // A zero/negative step never reaches `to` and froze the page; a size range above 200 rows is a typo.
    if (isNaN(from) || isNaN(to) || from > to || step <= 0 || (to - from) / step >= 200) {
      toast.error(tr("Enter valid from/to range"));
      return;
    }
    const added: typeof variants = [];
    for (let i = from; i <= to; i += step) {
      added.push({ id: String(i), name: `Size ${i}`, qty: "0" });
    }
    addVariants(added);
    setFromSize("");
    setToSize("");
  };

  const addFreeformTokens = () => {
    const tokens = freeform
      .split(/[,/ ]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tokens.length) return;
    addVariants(tokens.map((t) => ({ id: t, name: `Size ${t}`, qty: "0" })));
    setFreeform("");
  };

  /** Sizes already listed are skipped so one size can't hold two separate stock rows. */
  const addVariants = (rows: typeof variants) =>
    setVariants((prev) => {
      const seen = new Set(prev.map((v) => v.name.trim().toLowerCase()));
      return [...prev, ...rows.filter((v) => !seen.has(v.name.toLowerCase()) && seen.add(v.name.toLowerCase()))];
    });

  const totalVariantQty = useMemo(() => {
    return variants.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
  }, [variants]);

  const save = (another = false) => {
    if (saving.current) return; // a second click while saving never creates a second product
    if (!f.name.trim()) {
      toast.error(tr("Enter a product name"));
      return;
    }
    const pieces = Number(f.pieces);
    if (!Number.isInteger(pieces) || pieces < 1) {
      toast.error(tr("Pieces must be a whole number of 1 or more"));
      return;
    }
    const withVariants = hasVariants && variants.length > 0;
    const finalQty = withVariants ? totalVariantQty : Number(f.qty);
    if (Number(f.qty) < 0 || variants.some((v) => Number(v.qty) < 0)) {
      toast.error(tr("Quantity can't be negative"));
      return;
    }
    const wholesale = readWholesale(ws, f.unit, s.units);
    if (!wholesale.ok) {
      toast.error(tr(wholesale.message));
      return;
    }
    // addProduct checks any supplied identifiers and records opening stock as a movement.
    saving.current = true;
    const made = run(() =>
      erp.addProduct({
        name: f.name,
        buy: Number(f.buy) || 0,
        sell: Number(f.sell) || 0,
        qty: finalQty || 0,
        categoryId: f.categoryId || undefined,
        brandId: f.brandId || undefined,
        sku: f.sku,
        barcode: f.barcode,
        unit: f.unit,
        pieces,
        description: f.description.trim() || undefined,
        image: f.image || undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
        ...(levels && wholesale.value ? { wholesale: wholesale.value } : {}),
        variants: withVariants
          ? variants.map((v, i) => ({
              id: `${i + 1}-${v.id}`,
              name: v.name.trim(),
              qty: Number(v.qty) || 0,
              sell: v.sell ? Number(v.sell) : undefined,
            }))
          : undefined,
      }),
      tr("Product registered successfully"),
    );
    saving.current = false;
    if (!made) return;
    if (!another) {
      done();
      return;
    }
    setF({ ...blank, barcode: "" });
    setTicks({ category: false, brand: false, sku: false, barcode: false });
    setHasVariants(false);
    setVariants([]);
    setAttributes({});
    setShowAttributes(false);
  };

  return (
    <div className="inventory-box dash-panel pw-page pw-form">
      <div className="pw-page-head">
        <span />
        <h2>{tr("Register New Product")}</h2>
        <span />
      </div>
      <div className="fluid-form space-y-2.5">
        <div className="pw-row6a">
          <PwField label={tr("Product Name")} required>
            <input className={inventoryInput} value={f.name} onChange={set("name")} placeholder={tr("e.g. Cotton T-Shirt, Milk 1L")} required />
          </PwField>
          <PwField label={tr("Unit")}>
            <select className={inventoryInput} value={f.unit} onChange={set("unit")}>
              {unitNames(s, f.unit).map((u) => (
                <option key={u} value={u}>
                  {tr(u)}
                </option>
              ))}
            </select>
          </PwField>
          <PwField label={tr("Pieces")}>
            <input type="number" min="1" step="1" className={inventoryInput} value={f.pieces} onChange={set("pieces")} />
          </PwField>
          <PwField label={tr("Opening Stock")}>
            <input
              type="number"
              min="0"
              step="any"
              disabled={hasVariants}
              className={inventoryInput}
              value={hasVariants ? totalVariantQty : f.qty}
              onChange={set("qty")}
            />
          </PwField>
          <PwField label={tr("Buying Price")} required>
            <input type="number" min="0" step="any" className={inventoryInput} value={f.buy} onChange={set("buy")} />
          </PwField>
          <PwField label={tr("Selling Price")} required>
            <input type="number" min="0" step="any" className={inventoryInput} value={f.sell} onChange={set("sell")} />
          </PwField>
          {levels && <WholesaleFields value={ws} onChange={setWs} sell={f.sell} Field={PwField} />}
        </div>

        <div className="pw-ticks">
          {(["category", "brand", "sku", "barcode"] as const).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={ticks[k]} onChange={(e) => tick(k, e.target.checked)} />
              <span>{tr({ category: "Category", brand: "Brand", sku: "SKU", barcode: "Barcode" }[k])}</span>
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.checked);
                if (!e.target.checked) setVariants([]);
              }}
            />
            <span>{tr("Variant")}</span>
          </label>
          {activeAttributes(s).length > 0 && (
            <label>
              <input type="checkbox" checked={showAttributes} onChange={(e) => { setShowAttributes(e.target.checked); if (!e.target.checked) setAttributes({}); }} />
              <span>{tr("Attributes")}</span>
            </label>
          )}
        </div>
        {showAttributes && <AttributePicker s={s} value={attributes} onChange={setAttributes} tr={tr} />}

        {(ticks.category || ticks.brand || ticks.sku || ticks.barcode) && (
          <div className="pw-tick-details">
            {ticks.category && (
              <div className="pw-tick-detail" role="group" aria-label={tr("Category")}>
                <span>{tr("Category")}</span>
                <NamedSearch kind="categories" value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId })} s={s} tr={tr} onRegister={(name) => onRegister("categories", name, { f, ticks, hasVariants, variants, attributes, showAttributes })} />
              </div>
            )}
            {ticks.brand && (
              <div className="pw-tick-detail" role="group" aria-label={tr("Brand")}>
                <span>{tr("Brand")}</span>
                <NamedSearch kind="brands" value={f.brandId} onChange={(brandId) => setF({ ...f, brandId })} s={s} tr={tr} onRegister={(name) => onRegister("brands", name, { f, ticks, hasVariants, variants, attributes, showAttributes })} />
              </div>
            )}
            {ticks.sku && (
              <label className="pw-tick-detail">
                <span>{tr("SKU")}</span>
                <input className={inventoryInput} aria-label={tr("SKU")} value={f.sku} onChange={set("sku")} />
                {usedBy(f.sku, "sku") && <p className="pw-warn">{tr("Already used by")} {usedBy(f.sku, "sku")?.name}</p>}
              </label>
            )}
            {ticks.barcode && (
              <div className="pw-tick-detail" role="group" aria-label={tr("Barcode")}>
                <span>{tr("Barcode")}</span>
                <BarcodeInput value={f.barcode} onChange={(code) => setF({ ...f, barcode: code })} tr={tr} />
                {usedBy(f.barcode, "barcode") && <p className="pw-warn">{tr("Already used by")} {usedBy(f.barcode, "barcode")?.name}</p>}
              </div>
            )}
          </div>
        )}

        <PwField label={tr("Description (optional)")} wide>
          <textarea className={inventoryInput} rows={2} value={f.description} onChange={set("description")} />
        </PwField>
        <ImageChooser value={f.image} onChange={(image) => setF({ ...f, image })} tr={tr} />

        {/* Variants / Sizes */}
        <div className="space-y-3">
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
      <div className="pw-foot">
        <span />
        <span className="pw-foot-right">
          <button type="button" className="pw-btn" onClick={done}>
            {tr("Cancel")}
          </button>
          <button type="button" className="pw-btn" onClick={() => save(true)}>
            {tr("Save & Add Another")}
          </button>
          <button type="button" className="pw-btn is-primary" onClick={() => save()}>
            {tr("Save Product")}
          </button>
        </span>
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
    // addProduct rejects negative quantities/prices and records opening stock once, as a movement.
    let createdId = "";
    const created = run(() => {
      createdId = erp.addProduct({
        name: newProdName.trim(),
        buy: Number(newProdBuy) || 0,
        sell: Number(newProdSell) || 0,
        qty: Number(newProdQty) || 0,
        unit: newProdUnit,
        minStock: 5,
      }).id;
    }, tr("Product registered & selected"));

    if (created) {
      onChange(createdId);
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
                <span className="inv-product-name font-semibold text-foreground truncate">{selectedProduct.name}</span>
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

      {/* Dropdown list: the shared POS product rows; picking selects the product for this stock action */}
      {open && <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl p-1.5 max-h-60 overflow-y-auto">
          {rows.length > 0 && <ProductListHead tr={tr} />}
          {rows.length > 0 ? (
            rows.map((p) => (
              <ProductRow
                key={p.id}
                p={p}
                tr={tr}
                price={p.sell}
                action="select"
                selected={value === p.id}
                onPick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQ("");
                }}
              />
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
        <div className="glass-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4">
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
                    {unitNames(s, newProdUnit).map((u) => (
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
function StockInScreen({ s, tr, shop }: Ctx) {
  const [settings] = useSettings();
  const locations = inventoryLocations(s, shop, settings.branches);
  const [into, setInto] = useState("");
  const storage = activeStorage(s);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [origin, setOrigin] = useState("");
  const [otherOrigin, setOtherOrigin] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const expiryOn = useFeature("expiry");
  const [lastRef, setLastRef] = useState("");
  const selected = s.products.find((p) => p.id === pid);

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
    const sourceLocation = origin === OTHER_LOCATION ? otherOrigin.trim() : origin.trim();
    if (!sourceLocation) {
      toast.error(tr("Select where the stock came from"));
      return;
    }
    const unitCost = cost.trim() === "" ? undefined : Number(cost);
    const detail = [`${tr("Moved from")}: ${sourceLocation}`, batch.trim() ? `${tr("Batch")}: ${batch.trim()}` : ""]
      .filter(Boolean)
      .join(" • ") || tr("Stock Received");
    let movementRef = "";

    // With an expiry date the batch is recorded on the movement itself, so the Expiry list can follow it.
    const lot = expiry ? { batch: batch.trim() || undefined, expiry } : undefined;
    if (run(() => { movementRef = erp.stockIn(pid, qNum, detail, unitCost, into || undefined, lot); }, tr("Stock received successfully"))) {
      setLastRef(movementRef);
      setQty("");
      setCost("");
      setOrigin("");
      setOtherOrigin("");
      setBatch("");
      setExpiry("");
    }
  };

  const cancel = () => {
    setPid("");
    setQty("");
    setCost("");
    setOrigin("");
    setOtherOrigin("");
    setBatch("");
    setLastRef("");
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
          {tr("Stock In — Record Received Goods")}
        </h2>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ShopButton type="button" variant="outline" size="sm" onClick={cancel} className="text-xs h-8 px-2.5 sm:px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30">
            {tr("Cancel")}
          </ShopButton>
          <ShopButton type="button" variant="primary" size="sm" onClick={submit} className="text-xs h-8 px-3 sm:px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            {tr("Save Stock In")}
          </ShopButton>
        </div>
      </div>

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        <div className="stockin-row form-row3">
          <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
          <InventoryField label={tr("Quantity Received")} required>
            <input type="number" min="0" step="any" className={inventoryInput} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </InventoryField>
          <InventoryField label={tr("Cost Price")}>
            <input type="number" min="0" step="any" className={inventoryInput} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={selected ? String(selected.buy) : "0"} />
          </InventoryField>
        </div>

        <div className="stockin-row form-row3">
          <InventoryField label={tr("Moved From")} required>
            <select className={inventoryInput} value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">{tr("Select shop or store")}</option>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
              <option value={OTHER_LOCATION}>{tr("Other shop or location")}</option>
            </select>
          </InventoryField>
          {origin === OTHER_LOCATION && (
            <InventoryField label={tr("Other location name")} required>
              <input className={inventoryInput} value={otherOrigin} onChange={(e) => setOtherOrigin(e.target.value)} placeholder={tr("Enter shop or store name")} />
            </InventoryField>
          )}
          {storage.length > 0 && (
            <InventoryField label={tr("Receive Into")}>
              <select className={inventoryInput} value={into} onChange={(e) => setInto(e.target.value)}>
                <option value="">{tr("Shop stock")}</option>
                {storage.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </InventoryField>
          )}
          <InventoryField label={tr("Stock In Reference")}>
            <input className={inventoryInput} value={lastRef || tr("Assigned automatically on save")} readOnly aria-live="polite" />
          </InventoryField>
          <InventoryField label={tr("Batch / Lot Number")}>
            <input className={inventoryInput} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={tr("Optional")} />
          </InventoryField>
          {(expiryOn || expiry) && <InventoryField label={tr("Expiry date")}>
            <input type="date" className={inventoryInput} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </InventoryField>}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {tr("Add shops and stores in Business Profile → Branches. Cost price updates the product's buying price; the stock-in reference is generated automatically. Stock quantities are currently shared across locations.")}
        </p>
      </div>
    </div>
  );
}

/** 2.4 Stock Out Screen */
function StockOutScreen({ s, tr }: Ctx) {
  const [from, setFrom] = useState("");
  const storage = activeStorage(s);
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
    if (run(() => erp.stockOut(pid, qNum, detail, from || undefined), tr("Stock out recorded successfully"))) {
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

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Row 1: Product, Quantity, Reason */}
        <div className="stockin-row form-row3">
          {storage.length > 0 && (
            <InventoryField label={tr("Taken From")}>
              <select className={inventoryInput} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">{tr("Shop stock")}</option>
                {storage.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </InventoryField>
          )}
          <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
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

        {/* Row 2: Description / Notes */}
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
function StockHistoryScreen({ s, tr, since, until }: Ctx) {
  const [filterType, setFilterType] = useState("all");
  const [q, setQ] = useState("");

  const moves = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.movements.filter((m) => {
      if (m.at < since || m.at > until) return false;
      if (filterType !== "all" && groupOf(m.type) !== filterType) return false;
      if (!term) return true;
      const p = s.products.find((prod) => prod.id === m.productId);
      return [p?.name, p?.sku, p?.barcode, m.source, m.reason].some((v) => v?.toLowerCase().includes(term));
    });
  }, [s.movements, s.products, filterType, q, since, until]);

  const typeColor = (t: erp.MoveType) => {
    switch (groupOf(t)) {
      case "SALE":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
      case "IN":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "OUT":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
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
        <div className="flex-1 min-w-0">
          <InventorySearch q={q} setQ={setQ} tr={tr} placeholder="Search by product or reference..." />
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

      <div className="inventory-glass-surface rounded-xl border border-border/40 bg-card/65 backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="p-2.5 bg-muted/40 border-b border-border/40 text-[11px] font-bold text-muted-foreground flex items-center justify-between gap-2">
          <span>{tr("Stock Audit Trail")}</span>
          <span className="flex items-center gap-2">
            {moves.length} {tr("entries")}
            <ShopButton
              variant="outline"
              size="sm"
              className="h-6 px-1.5"
              disabled={!moves.length}
              title={tr("Export CSV")}
              aria-label={tr("Export CSV")}
              onClick={() => {
                const rows = moves.map((m) => {
                  const p = s.products.find((x) => x.id === m.productId);
                  return [new Date(m.at).toISOString(), m.type, p?.name ?? "", p?.sku ?? "", m.qty, m.prev, m.next, m.source, m.reason, m.user];
                });
                download(`stock-history-${Date.now()}.csv`, csv([["Date", "Type", "Product", "SKU", "Qty", "Before", "After", "Reference", "Reason", "User"], ...rows]));
                toast.success(tr("Exported CSV"));
              }}
            >
              <Download className="w-3.5 h-3.5" />
            </ShopButton>
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
                        "px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0",
                        typeColor(m.type),
                      )}
                    >
                      {m.type}
                    </span>
                    <span className="font-bold text-foreground text-xs truncate max-w-[160px] sm:max-w-xs">
                      <span className="inv-product-name">{p?.name || tr("Deleted product")}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline" title={m.reason}>
                      {[m.source, m.reason].filter(Boolean).join(" · ")}
                    </span>
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

                    <span className="text-[11px] text-muted-foreground tabular-nums min-w-[65px] text-right hidden sm:inline">
                      {tr("Bal")}: {m.next} {p?.unit || "pcs"}
                    </span>

                    <span className="text-[11px] text-muted-foreground tabular-nums min-w-[80px] text-right">
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

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Row 1: Product, System Quantity, Corrected Quantity, Reason */}
        <div className="stockin-row">
          <InlineProductPicker s={s} value={pid} onChange={setPid} tr={tr} />
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

        {/* Row 2: Notes on its own */}
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
  const [refundMethod, setRefundMethod] = useState<erp.Method>(() => erp.defaultMethod(erp.load()));
  const [outcome, setOutcome] = useState("Return to available stock");

  const ref = saleRef.trim().toLowerCase();
  const sale = ref ? s.sales.find((x) => x.ref.toLowerCase() === ref) : undefined;
  const line = sale?.items.find((i) => i.productId === pid);
  const returnable = line ? erp.roundQty(line.qty - line.returned) : 0;
  const product = s.products.find((p) => p.id === pid);

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

    const detail = `Customer Return • ${sale?.ref || saleRef.trim() || "Direct"} • ${reason} • ${condition} • ${resolution}`;
    const restock = outcome === "Return to available stock";

    // A rejected return sends the goods back to the customer: nothing changes but the audit trail.
    if (resolution === "Reject") {
      if (run(() => erp.commit((_s, c) => c.audit("RETURN REJECTED", `${product?.name ?? pid} • ${qNum} • ${detail}`)), tr("Return rejected — stock unchanged"))) resetForm();
      return;
    }

    if (sale) {
      // Returns against a recorded sale go through the shared Sales return: stock, refund, the sale's returned
      // counter and commission move together, so the same items can't be returned twice from Sales.
      if (!line) {
        toast.error(`${tr("This product is not on sale")} ${sale.ref}`);
        return;
      }
      const method: erp.Method = resolution === "Store Credit" ? "credit" : refundMethod;
      const done = run(
        () =>
          erp.runErpTransaction(() => {
            erp.returnSale(sale.id, [{ productId: pid, qty: qNum }], method);
            erp.commit((_s, c) => c.audit("RETURN DETAILS", detail));
            if (!restock) erp.stockOut(pid, qNum, `Returned not resaleable • ${sale.ref} • ${condition}`);
          }),
        tr("Customer return processed"),
      );
      if (done) resetForm();
      return;
    }

    if (
      run(() => {
        erp.commit((_state, c) => {
          if (restock) {
            // The movement adds the stock; adding it here as well counted every return twice.
            c.move(pid, "RETURN", qNum, detail, c.nextRef("RET"));
          } else {
            c.audit("RETURN QUARANTINED", `${product?.name ?? pid} • ${qNum} • ${detail}`);
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

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        {/* Row 1: Receipt, Product, Quantity, Reason */}
        <div className="stockin-row">
          <InventoryField label={tr("Receipt Ref No")}>
            <input
              className={inventoryInput}
              value={saleRef}
              onChange={(e) => setSaleRef(e.target.value)}
              placeholder="REC-00123"
            />
          </InventoryField>
          <InlineProductPicker label={tr("Product Returned")} s={s} value={pid} onChange={setPid} tr={tr} />
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

        <p
          className={cn(
            "text-[11px] rounded-lg px-2 py-1.5 border",
            sale && line && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            sale && !line && pid && "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
            !(sale && (line || pid)) && "border-border/40 bg-muted/30 text-muted-foreground",
          )}
        >
          {sale
            ? line
              ? `${tr("Linked to sale")} ${sale.ref} · ${tr("can return")} ${returnable} ${product?.unit || "pcs"}`
              : pid
                ? `${tr("This product is not on sale")} ${sale.ref}`
                : `${tr("Linked to sale")} ${sale.ref}`
            : ref
              ? tr("No recorded sale has this receipt. Stock only — no refund will be recorded.")
              : tr("Enter the sale receipt (e.g. S-000012) to record the refund too. Without it, only stock changes.")}
        </p>

        {/* Row 2: Inspection, Resolution, (refund account), Inventory Outcome */}
        <div className="stockin-row form-row-even">
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
          {sale && (resolution === "Refund" || resolution === "Exchange") && (
            <InventoryField label={tr("Refund to")}>
              <select className={inventoryInput} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as erp.Method)}>
                {fin.accounts(s).map((m) => (
                  <option key={m} value={m}>
                    {tr(erp.methodName(m))}
                  </option>
                ))}
              </select>
            </InventoryField>
          )}
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
  const [refundMethod, setRefundMethod] = useState<erp.Method>(() => erp.defaultMethod(erp.load()));

  const ref = purchaseRef.trim().toLowerCase();
  const purchase = ref ? s.purchases.find((x) => x.ref.toLowerCase() === ref) : undefined;
  const line = purchase?.items.find((i) => i.productId === pid);
  const purchaseSupplier = s.suppliers.find((x) => x.id === purchase?.supplierId);

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
    if (purchase) {
      // Against a recorded purchase the shared purchase return moves stock and the money together: a refund
      // into an account, or (credit note, replacement, awaiting) a reduction of what we owe the supplier.
      if (!line) {
        toast.error(`${tr("This product is not on purchase")} ${purchase.ref}`);
        return;
      }
      const method: erp.Method = resolution === "Refund" ? refundMethod : "credit";
      if (run(() => fin.returnPurchase(purchase.id, [{ productId: pid, qty: qNum }], method, `${reason} • ${resolution}`), tr("Supplier return dispatched"))) resetForm();
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

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
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
              className={cn(inventoryInput, purchase && "bg-muted")}
              value={purchase ? (purchaseSupplier?.name ?? tr("No supplier")) : supplier}
              readOnly={!!purchase}
              list="inventory-return-suppliers"
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={tr("Supplier name")}
            />
            <datalist id="inventory-return-suppliers">
              {s.suppliers.map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
          </InventoryField>
          <InlineProductPicker label={tr("Product to Return")} s={s} value={pid} onChange={setPid} tr={tr} />
        </div>

        <p
          className={cn(
            "text-[11px] rounded-lg px-2 py-1.5 border",
            purchase && line && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            purchase && !line && pid && "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
            !(purchase && (line || pid)) && "border-border/40 bg-muted/30 text-muted-foreground",
          )}
        >
          {purchase
            ? line
              ? `${tr("Linked to purchase")} ${purchase.ref} · ${tr("can return")} ${erp.roundQty(line.qty - line.returned)} · ${tr(resolution === "Refund" ? "refund is recorded in the chosen account" : "reduces what you owe the supplier")}`
              : pid
                ? `${tr("This product is not on purchase")} ${purchase.ref}`
                : `${tr("Linked to purchase")} ${purchase.ref}`
            : ref
              ? tr("No recorded purchase has this reference. Stock only — the supplier balance won't change.")
              : tr("Enter the purchase reference (e.g. PO-000004) to update the supplier balance too. Without it, only stock changes.")}
        </p>

        {/* Row 2: Quantity + Reason + Supplier Resolution (+ refund account) in 1 row across all screens */}
        <div className={cn("grid gap-2", purchase && resolution === "Refund" ? "grid-cols-4" : "grid-cols-3")}>
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
          {purchase && resolution === "Refund" && (
            <InventoryField label={tr("Refund to")}>
              <select className={inventoryInput} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as erp.Method)}>
                {fin.accounts(s).map((m) => (
                  <option key={m} value={m}>
                    {tr(erp.methodName(m))}
                  </option>
                ))}
              </select>
            </InventoryField>
          )}
        </div>
      </div>
    </div>
  );
}

/** 3.3 New Transfer */
function NewTransferScreen({ s, tr, shop }: Ctx) {
  const [settings] = useSettings();
  const locations = inventoryLocations(s, shop, settings.branches);
  // Restocking starts from the shop's usual warehouse (Business Setup › Edit) when it has one: from that warehouse to this shop.
  const here = listLocations(s).find((l) => l.id === erp.activeShop(s));
  const usual = here?.defaultWarehouse ? listLocations(s).find((l) => l.id === here.defaultWarehouse)?.name : undefined;
  const startFrom = usual && here ? usual : shop, startTo = usual && here ? here.name : "";
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState(startTo);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setQty("");
    setNotes("");
    setPid("");
    setFrom(startFrom);
    setTo(startTo);
  };

  const submit = () => {
    if (!from || !to) {
      toast.error(tr("Choose both the source and destination locations"));
      return;
    }
    if (from.toLocaleLowerCase() === to.toLocaleLowerCase()) {
      toast.error(tr("Destination must be a different location"));
      return;
    }
    if (!pid) {
      toast.error(tr("Select product"));
      return;
    }
    const qNum = Number(qty);
    if (!qNum || qNum <= 0) {
      toast.error(tr("Enter valid quantity"));
      return;
    }
    // Created and sent in one step, so the stock leaves now; Transfer History marks it received or cancels it.
    const ok = run(
      () =>
        erp.runErpTransaction(() => {
          const t = erp.createTransfer(pid, qNum, to, from, notes);
          erp.sendTransfer(t.id);
        }),
      tr("Transfer created and dispatched"),
    );
    if (ok) resetForm();
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

      <div className="fluid-form rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 p-4 space-y-3 shadow-sm">
        {/* Row 1: From, To, Product, Quantity */}
        <div className="stockin-row form-row-transfer">
          <InventoryField label={tr("From Location")} required>
            <select className={inventoryInput} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(""); }}>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </InventoryField>
          <InventoryField label={tr("To Location")} required>
            <select className={inventoryInput} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{tr(locations.length > 1 ? "Select destination" : "Add another shop in Business Profile")}</option>
              {locations.filter((location) => location !== from).map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </InventoryField>
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

        {/* Row 2: Notes */}
        <InventoryField label={tr("Notes")}>
          <input
            className={inventoryInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr("Vehicle, driver, transfer reason...")}
          />
        </InventoryField>
        <p className="text-[11px] text-muted-foreground">
          {tr(activeStorage(s).length ? "Stock held in a store or warehouse moves only when this transfer is dispatched and then received in Transfer History. Shops share one stock balance." : "Add every shop or store in Business Profile → Branches. Transfers record both locations; stock quantities are currently shared across locations.")}
        </p>
      </div>
    </div>
  );
}

/** Read-only. Viewing moves nothing; a transfer is the only way this stock reaches a shop. */
function WarehouseStockScreen({ s, tr, shop }: Ctx) {
  const columns: Col<StorageStock>[] = [
    { label: "Location", value: (r) => r.location.name }, { label: "Type", value: () => "Warehouse" }, { label: "Product", value: (r) => r.name },
    { label: "Available", value: (r) => `${r.qty}${r.unit ? ` ${r.unit}` : ""}` }, { label: "Connected Shops", value: (r) => connectedShops(s, r.location.id).map((l) => l.name).join(", ") },
  ];
  return (
    <div className="pm-form">
      <p className="pw-note">{tr("You are only viewing this stock. To bring it to a shop, create a New Transfer, then confirm receipt in Transfer History.")}</p>
      <ListScreen title="Warehouse Stock" shop={shop} items={storageStock(s)} columns={columns} idOf={(r) => r.key} money={String} tr={tr} empty="No stock recorded in a store or warehouse yet" ph="Search products..." text={(r) => `${r.name} ${r.location.name}`}
        filters={[{ label: "Location", get: (r) => r.location.name }]} />
    </div>
  );
}

/** 3.4 Transfer History */
function TransferHistoryScreen({ s, tr, since, until }: Ctx) {
  const transfers = s.transfers.filter((t) => t.at >= since && t.at <= until);
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">{tr("Transfer Audit Trail")}</h2>
      <div className="inventory-glass-surface rounded-xl bg-card/65 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/30">
          {transfers.length ? (
            transfers.map((t) => {
              const p = s.products.find((prod) => prod.id === t.productId);
              return (
                <div
                  key={t.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-muted/40 transition-colors min-h-[36px]"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0",
                        t.status === "RECEIVED" && "bg-emerald-500/15 text-emerald-600",
                        t.status === "SENT" && "bg-amber-500/15 text-amber-600",
                        t.status === "PENDING" && "bg-blue-500/15 text-blue-600",
                        t.status === "CANCELLED" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.status}
                    </span>
                    <span className="font-bold text-foreground text-xs truncate max-w-[160px] sm:max-w-xs">
                      <span className="inv-product-name">{p?.name || tr("Product")}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline" title={t.note}>
                      {t.ref} · {t.from} → {t.to}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                    <span className="font-extrabold text-xs text-foreground tabular-nums">
                      {t.qty} {p?.unit || "pcs"}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums hidden sm:inline">{dt(t.at)}</span>
                    {t.status === "PENDING" && (
                      <ShopButton
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => run(() => erp.sendTransfer(t.id), tr("Transfer dispatched"))}
                      >
                        {tr("Send")}
                      </ShopButton>
                    )}
                    {t.status === "SENT" && (
                      <ShopButton
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => run(() => erp.receiveTransfer(t.id), tr("Transfer marked as received"))}
                      >
                        {tr("Receive")}
                      </ShopButton>
                    )}
                    {(t.status === "PENDING" || t.status === "SENT") && (
                      <ShopButton
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 text-rose-600 border-rose-500/30"
                        onClick={() => {
                          if (!window.confirm(tr(t.status === "SENT" ? "Cancel this transfer and return the stock?" : "Cancel this transfer?"))) return;
                          run(() => erp.cancelTransfer(t.id), tr("Transfer cancelled"));
                        }}
                      >
                        {tr("Cancel")}
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

/** 4.2 Stock Setup */
function StockSetupScreen({ tr }: Ctx) {
  // These describe rules the stock engine (erp.ts) always applies; they were toggles that saved nothing.
  const rules: [string, string][] = [
    ["Negative stock is always prevented", "Sales, stock out, transfers and adjustments stop when stock would go below zero"],
    ["Adjustments always need a reason", "Every correction records the previous, new and difference in the audit trail"],
    ["Whole units stay whole", "Pieces, boxes, packets and similar units can't be received, removed or counted in fractions"],
    ["Unique barcodes and SKUs", "A barcode or SKU can belong to one product only"],
    ["Batch and expiry", "Batch/lot and expiry entered on Stock In are kept in the movement note; FEFO tracking is not available yet"],
    [`Default reorder level: ${erp.DEFAULT_MIN_STOCK}`, "Used for low-stock alerts when a product has no level of its own"],
  ];

  return (
    <div className="w-full space-y-4">
      <h2 className="text-base font-bold text-foreground">{tr("Stock Setup & Warehouse Rules")}</h2>

      {/* Locations: names only — stock is one balance per product */}
      <Box title={tr("Warehouses & Storage Locations")} sub={tr("Recorded on the Stock In note")}>
        <div className="flex flex-wrap gap-1.5">
          {["Main Warehouse", "Front Store", "Backroom", "Shelf A"].map((loc) => (
            <span key={loc} className="text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground font-medium">
              {tr(loc)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {tr("Each product keeps one stock balance. Separate stock per location is not available yet.")}
        </p>
      </Box>

      {/* Rules the stock engine always applies */}
      <Box title={tr("Stock Management Safeguards")} sub={tr("Always on for every inventory movement")}>
        <ul className="space-y-2.5">
          {rules.map(([title, detail]) => (
            <li key={title} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{tr(title)}</p>
                <p className="text-[11px] text-muted-foreground">{tr(detail)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Box>
    </div>
  );
}
