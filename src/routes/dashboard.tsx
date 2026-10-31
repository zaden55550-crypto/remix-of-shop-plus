import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTheme } from "@/components/shopbook/ui";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Sun,
  Moon,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  UserCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import { performance, position, periodStart, type Period } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { METHOD_LABEL, empty, type Method, type Sale, type ErpState } from "@/lib/erp";
import { chatIcons, trialDaysLeft } from "@/lib/shopbook";
import { findByCurrency } from "@/lib/world-data";
import { BusinessAssistant } from "@/components/shopbook/business-assistant";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SHOPBOOK ERP" },
      { name: "description", content: "Real-time retail business performance overview and analytics." },
      { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
      { property: "og:description", content: "Live financial KPIs, trends, and recent store activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type DashboardPeriod = "Today" | "Week" | "Month" | "Custom";

/** Compact number formatter: full numbers below 1M with commas, M for >=1M, B for >=1B */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n) || Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return Math.round(n).toLocaleString();
}

/** Formats shop name so long multi-word names stay tidy */
function formatHeaderShopName(name: string): string {
  if (!name) return "SHOPBOOK";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]!;
  if (parts[0]!.length >= 12 || `${parts[0]} ${parts[1]}`.length > 18) {
    return `${parts[0]}..`;
  }
  return `${parts[0]} ${parts[1]}${parts.length > 2 ? ".." : ""}`;
}

/** Resolves any global currency code to its exact symbol */
function toCurrencySymbol(code: string): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();

  // 1. Common regional East African notations
  if (upper === "KES" || upper === "KSH" || code === "KSh") return "KSh";
  if (upper === "UGX" || upper === "USH" || code === "USh") return "USh";
  if (upper === "TZS" || upper === "TSH" || code === "TSh") return "TSh";
  if (upper === "RWF" || code === "FRw") return "FRw";
  if (upper === "SOS" || upper === "SH.SO." || code === "Sh.So.") return "Sh.So.";

  // 2. Curated world-data lookup (150+ countries)
  const fromWorld = findByCurrency(upper);
  if (fromWorld?.currencySymbol) return fromWorld.currencySymbol;

  // 3. Global ISO currencies ($ for USD, £ for GBP, € for EUR, ¥ for JPY, ₹ for INR, etc.)
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
    // Graceful fallback
  }

  return code;
}

/** Currency formatter component with responsive typography and superscript currency */
function Amt({
  value,
  curr = "KSh",
  tone,
  size = "xs",
  className,
}: {
  value: number;
  curr?: string;
  tone?: "good" | "warn" | "bad" | "info" | undefined;
  size?: "2xs" | "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const numStr = compactFmt(value);
  const symbol = curr ? toCurrencySymbol(curr) : undefined;
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-rose-500"
        : tone === "warn"
          ? "text-amber-500"
          : tone === "info"
            ? "text-sky-500"
            : "text-foreground";

  const isLong = numStr.length >= 6;
  const numSize =
    size === "2xs"
      ? "text-[9.5px]"
      : size === "xs"
        ? isLong
          ? "text-[clamp(8px,2.1vw,11px)] sm:text-xs"
          : "text-[clamp(9.5px,2.5vw,12.5px)] sm:text-sm"
        : size === "sm"
          ? isLong
            ? "text-[clamp(11px,2.6vw,13.5px)] sm:text-sm"
            : "text-xs sm:text-sm"
          : size === "md"
            ? "text-sm sm:text-base"
            : "text-base sm:text-lg";

  return (
    <span
      className={cn(
        "inline-flex items-start gap-0.5 font-bold font-mono tracking-tight leading-none",
        toneClass,
        className,
      )}
    >
      <span className={cn("font-black", numSize)}>{numStr}</span>
      {symbol && (
        <sup
          className={cn(
            "font-bold shrink-0 select-none ml-0.5 relative top-0 leading-tight",
            toneClass,
            size === "2xs" && "text-[6px]",
            size === "xs" && "text-[7px]",
            size === "sm" && "text-[8px]",
            size === "md" && "text-[8.5px]",
            size === "lg" && "text-[9.5px]",
          )}
        >
                {symbol && (
        <sup
          className={cn(
            "font-bold shrink-0 select-none ml-0.5 relative top-0 leading-tight",
            tone === "info" && "text-sky-500 dark:text-sky-400",
            tone === "good" && "text-emerald-500 dark:text-emerald-400",
            tone === "warn" && "text-amber-500 dark:text-amber-400",
            tone === "bad" && "text-rose-500 dark:text-rose-400",
            !tone && "text-foreground",
            size === "xs" && "text-[7px]",
            size === "sm" && "text-[8px]",
            size === "md" && "text-[9px]",
            size === "lg" && "text-[10px]",
          )}
        >
          {symbol}
        </sup>
      )}


/** Reusable Glass Card Tooltip for Charts */
function ChartTooltip({ active, payload, label, curr = "KSh" }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-2.5 py-1.5 shadow-xl text-[11px] text-popover-foreground z-50">
      {label && <div className="font-bold text-muted-foreground mb-1 text-[10px]">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 font-medium" style={{ color: p.color || p.fill }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
              {p.name}:
            </span>
            <span className="font-mono font-bold">
              {curr.toLowerCase()} {compactFmt(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Custom SVG Label renderer for solid center-meeting Pie charts */
function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.58;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[7.5px] sm:text-[8.5px] font-black tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] pointer-events-none select-none"
    >
      <tspan x={x} dy="-0.45em">
        {name}
      </tspan>
      <tspan x={x} dy="1em">
        {Math.round(percent * 100)}%
      </tspan>
    </text>
  );
}

export default function Dashboard() {
  const account = useAccount("basic");
  const erpState = useErp();
  const s: ErpState = erpState || empty();
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();

  // Period state defaulting always to "Today"
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>("Today");
  const [customFrom, setCustomFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [showCustomInputs, setShowCustomInputs] = useState(false);

  // State drawers & modals
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showShopBot, setShowShopBot] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [showAlertsAccordion, setShowAlertsAccordion] = useState(false);

  const cur = account?.currency || "KSh";
  const money = moneyFor(cur);

  // Compute active date boundaries [fromMs, toMs]
  const dateWindow = useMemo(() => {
    if (selectedPeriod === "Custom") {
      const start = new Date(customFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
      const fromMs = isNaN(start.getTime()) ? Date.now() : start.getTime();
      const toMs = isNaN(end.getTime()) ? Date.now() : Math.max(fromMs, end.getTime());
      return { from: fromMs, to: toMs };
    }
    const fromMs = periodStart(selectedPeriod as Period);
    return { from: fromMs, to: Date.now() };
  }, [selectedPeriod, customFrom, customTo]);

  // Performance for the selected period, read from the shared ERP snapshot
  const perf = useMemo(() => {
    const p = performance(s, dateWindow.from, dateWindow.to);
    const t = purchaseTotals(s, dateWindow.from, dateWindow.to);
    const profit = p.grossProfit - t.expenses;
    return {
      sales: p.sales,
      purchases: t.purchases,
      expenses: t.expenses,
      profit,
      margin: p.sales > 0 ? Math.round((p.grossProfit / p.sales) * 100) : 0,
    };
  }, [s, dateWindow]);

  // Balance position snapshot
  const pos = useMemo(() => {
    const base = position(s);
    const fb = floatBalances(s);
    return {
      ...base,
      cash: fb.cash,
      mpesa: fb.mpesa,
      bank: fb.bank,
      netCash: fb.cash + fb.mpesa + fb.bank,
    };
  }, [s]);

  // Total stock inventory valuation
  const totalStockValuation = pos.stock;

  // Daily chart series for the selected period
  const charts = useMemo(() => {
    const from = dateWindow.from;
    const to = dateWindow.to;
    const day = 864e5;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.min(31, Math.ceil((to - start.getTime()) / day)));
    const buckets = Array.from({ length: days }, (_, i) => {
      const a = start.getTime() + i * day;
      const label = new Date(a).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return { a, b: a + day, label };
    });
    const sum = <T,>(rows: T[], at: (r: T) => number, val: (r: T) => number, a: number, b: number) =>
      rows.reduce((acc, r) => {
        const t = at(r);
        return t >= a && t < b ? acc + val(r) : acc;
      }, 0);
    const salesVsPurchases = buckets.map(({ a, b, label }) => ({
      label,
      sales: sum(
        s.sales,
        (x) => x.at,
        (x) => x.total,
        a,
        b,
      ),
      purchases: sum(
        s.purchases,
        (x) => x.at,
        (x) => x.total,
        a,
        b,
      ),
    }));
    const moneyRows = s.payments.filter((p) => p.kind !== "TRANSFER" && p.kind !== "OPENING");
    const cashInOut = buckets.map(({ a, b, label }) => ({
      label,
      in: sum(
        moneyRows,
        (x) => x.at,
        (x) => Math.max(0, x.amount),
        a,
        b,
      ),
      out: sum(
        moneyRows,
        (x) => x.at,
        (x) => Math.max(0, -x.amount),
        a,
        b,
      ),
    }));
    const hasSp = salesVsPurchases.some((x) => x.sales || x.purchases);
    const hasCio = cashInOut.some((x) => x.in || x.out);
    return { salesVsPurchases: hasSp ? salesVsPurchases : [], cashInOut: hasCio ? cashInOut : [] };
  }, [s, dateWindow]);

  // Chart 1: Money Position (Cash, M-Pesa, Bank, Credit)
  const moneyPositionData = useMemo(() => {
    const list = [
      { name: "Cash", value: Math.max(0, pos.cash), color: "#10b981" },
      { name: "M-Pesa", value: Math.max(0, pos.mpesa), color: "#06b6d4" },
      { name: "Bank", value: Math.max(0, pos.bank), color: "#3b82f6" },
      { name: "Credit", value: Math.max(0, pos.receivables), color: "#f59e0b" },
    ];
    return list.filter((item) => item.value > 0);
  }, [pos]);

  // Chart 4: Receivables vs Payables (Solid Pie Meeting at Center)
  const debtPositionData = useMemo(() => {
    const toReceive = Math.max(0, pos.receivables || 0);
    const toPay = Math.max(0, pos.payables || 0);

    const items = [
      { name: tr("To Receive"), value: toReceive, color: "#10b981" },
      { name: tr("To Pay"), value: toPay, color: "#ef4444" },
    ];
    return items.filter((x) => x.value > 0);
  }, [pos.receivables, pos.payables, tr]);

  // Needs Attention Counts & Totals
  const lowStockCount = pos.low + pos.out;
  const posCashUpPendingCount = pos.cashUpPending ? 1 : 0;
  const pendingApprovalsCount = 0;
  const syncIssuesCount = 0;

  // Real Days Left in Trial
  const daysLeft = useMemo(() => {
    return trialDaysLeft(account);
  }, [account]);

  // Format date range indicator
  const dateRangeLabel = useMemo(() => {
    const today = new Date();
    if (selectedPeriod === "Today") {
      return today.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    if (selectedPeriod === "Week") {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      return `${past.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${today.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    }
    if (selectedPeriod === "Month") {
      return today.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    }
    return `${new Date(customFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(customTo).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }, [selectedPeriod, customFrom, customTo]);

  // Actionable Alerts Items
  const actionableAlerts = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      desc: string;
      tone: "bad" | "warn";
      actionLabel: string;
      to: string;
    }> = [];

    if (pos.receivables > 0) {
      items.push({
        id: "receivables",
        title: `${cur} ${compactFmt(pos.receivables)} ${tr("uncollected customer debt")}`,
        desc: tr("Outstanding credit awaiting collection from customer accounts."),
        tone: "warn",
        actionLabel: tr("View Debtors"),
        to: "/contacts",
      });
    }

    if (pos.payables > 0) {
      items.push({
        id: "payables",
        title: `${cur} ${compactFmt(pos.payables)} ${tr("unpaid supplier purchases")}`,
        desc: tr("Pending balances owed to suppliers for goods purchased on credit."),
        tone: "bad",
        actionLabel: tr("View Suppliers"),
        to: "/purchases",
      });
    }

    if (lowStockCount > 0) {
      items.push({
        id: "lowstock",
        title: `${lowStockCount} ${tr("products below reorder level")}`,
        desc: tr("Stock is running out. Generate a purchase order to prevent lost sales."),
        tone: "warn",
        actionLabel: tr("Reorder Now"),
        to: "/inventory",
      });
    }

    return items;
  }, [pos.receivables, pos.payables, lowStockCount, cur, tr]);

  // Shop Initials for Avatar
  const shopInitials = useMemo(() => {
    const name = account?.shopName || "SHOPBOOK";
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [account?.shopName]);

  const activePeriodLabel = useMemo(() => {
    if (selectedPeriod === "Today") return tr("Today");
    if (selectedPeriod === "Week") return tr("7 Days");
    if (selectedPeriod === "Month") return tr("This Month");
    return tr("Custom");
  }, [selectedPeriod, tr]);

  return (
    <div className="relative min-h-screen w-full text-foreground pb-20 font-sans select-none antialiased bg-background bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.08),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.05),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.10),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.07),transparent_70%)] bg-fixed">
      {/* 1. TOP UNIFIED COMPACT HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 dark:border-white/10 bg-background/80 dark:bg-slate-950/80 backdrop-blur-xl px-2 sm:px-4 py-2 transition-all shadow-xs">
        <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-7xl mx-auto">
          {/* Left Elements: Back to Apps + Connection Status */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/apps"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 dark:border-white/10 bg-card/80 dark:bg-white/5 backdrop-blur-md px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all"
              title={tr("Back to Apps")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="font-bold">{tr("Apps")}</span>
            </Link>

            <span className="text-muted-foreground/40 text-xs hidden sm:inline">|</span>
            <div className="scale-90 sm:scale-95 origin-left">
              <ConnectionStatus />
            </div>
          </div>

          {/* Center: Shop Name with Dashboard subtitle directly underneath */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 mx-auto px-1">
            <h1 className="truncate text-xs sm:text-sm md:text-base font-bold text-foreground">
              {formatHeaderShopName(account?.shopName || "SHOPBOOK")}
            </h1>
            <span className="truncate text-[9px] sm:text-[10px] font-medium text-muted-foreground tracking-tight">
              {tr("Dashboard")}
            </span>
          </div>

          {/* Right Elements: Theme Toggle + Calendar Icon + Shop Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Theme Toggle (Sun in Dark Mode, Moon in Light Mode) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 dark:border-white/10 bg-card/80 dark:bg-white/5 backdrop-blur-md text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all cursor-pointer"
              title={dark ? tr("Switch to Light Mode") : tr("Switch to Dark Mode")}
              aria-label="Toggle theme"
            >
              {dark ? (
                <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Calendar Popover (Icon Only) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowCalendarPopover(!showCalendarPopover);
                  setShowShopMenu(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 dark:border-white/10 bg-card/80 dark:bg-white/5 backdrop-blur-md text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all cursor-pointer"
                title={`${tr("Calendar / Period")}: ${activePeriodLabel}`}
                aria-label="Select period"
              >
                <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
              </button>

              {showCalendarPopover && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl border border-border/60 dark:border-white/10 bg-popover/95 backdrop-blur-xl p-2.5 shadow-2xl dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60 text-xs font-bold text-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      {tr("Select Period")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCalendarPopover(false)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Period Choices */}
                  <div className="space-y-1">
                    {[
                      { id: "Today" as DashboardPeriod, label: tr("Today") },
                      { id: "Week" as DashboardPeriod, label: tr("7 Days") },
                      { id: "Month" as DashboardPeriod, label: tr("This Month") },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedPeriod(item.id);
                          setShowCustomInputs(false);
                          setShowCalendarPopover(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer",
                          selectedPeriod === item.id && !showCustomInputs
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-foreground hover:bg-muted dark:hover:bg-white/10",
                        )}
                      >
                        <span>{item.label}</span>
                        {selectedPeriod === item.id && !showCustomInputs && <span className="text-[10px]">✓</span>}
                      </button>
                    ))}

                    {/* Custom Option */}
                    <button
                      type="button"
                      onClick={() => setShowCustomInputs(!showCustomInputs)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer",
                        selectedPeriod === "Custom"
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "text-foreground hover:bg-muted dark:hover:bg-white/10",
                      )}
                    >
                      <span>{tr("Custom Range")}</span>
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", showCustomInputs && "rotate-180")}
                      />
                    </button>
                  </div>

                  {/* Expandable Custom Date Inputs */}
                  {showCustomInputs && (
                    <div className="pt-2 border-t border-border/50 dark:border-white/10 space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">{tr("From")}</label>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="w-full rounded-md border border-border/60 bg-background/80 dark:bg-slate-900/80 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground">{tr("To")}</label>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="w-full rounded-md border border-border/60 bg-background/80 dark:bg-slate-900/80 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPeriod("Custom");
                          setShowCalendarPopover(false);
                        }}
                        className="w-full rounded-lg bg-primary py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer text-center"
                      >
                        {tr("Apply Dates")}
                      </button>
                    </div>
                  )}

                  <div className="pt-1 border-t border-border/40 text-[10px] font-mono text-muted-foreground text-center">
                    {dateRangeLabel}
                  </div>
                </div>
              )}
            </div>

            {/* Shop Initials Circle Avatar Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowShopMenu(!showShopMenu);
                  setShowCalendarPopover(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/40 text-[11px] font-black shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={account?.shopName || "Shop Menu"}
              >
                {shopInitials}
              </button>

              {showShopMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-border/60 dark:border-white/10 bg-popover/90 backdrop-blur-xl p-2 shadow-2xl dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] space-y-1">
                  <div className="px-2 py-1 border-b border-border/60 mb-1">
                    <div className="text-xs font-bold text-foreground truncate">{account?.shopName}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-between mt-0.5">
                      <span className="capitalize">{account?.plan || "Basic"} Plan</span>
                      <Link to="/plans" className="text-primary hover:underline font-semibold">
                        {tr("Manage")}
                      </Link>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowShopMenu(false);
                      navigate({ to: "/settings" });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted dark:hover:bg-white/10"
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tr("Business Profile")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowShopMenu(false);
                      navigate({ to: "/settings" });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted dark:hover:bg-white/10"
                  >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tr("Business Switcher")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-3 pt-2 space-y-2 sm:space-y-2.5">
        {/* 2. TRIAL BANNER (Visible while on trial with real days left) */}
        {account?.plan === "trial" && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 backdrop-blur-xl p-2 sm:px-3 sm:py-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-base sm:text-lg">👑</span>
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-bold text-foreground">
                  {tr("Trial")} - {daysLeft} {daysLeft === 1 ? tr("day left") : tr("days left")}
                </span>
                <span className="text-[10px] text-muted-foreground">{tr("Upgrade to keep using SHOPLY")}</span>
              </div>
            </div>
            <Link
              to="/plans"
              className="rounded-lg bg-orange-500 hover:bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors shrink-0"
            >
              {tr("Upgrade")}
            </Link>
          </div>
        )}

        {/* 3. FIVE KPI CARDS (Liquid Glass with Top Specular Glow) */}
        {/* 3. FIVE KPI CARDS (Liquid Glass with Top Specular Glow) */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {/* 1. Sales */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0">
            <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">{tr("Sales")}</span>
            <div className="my-0.5 truncate">
              <Amt value={perf?.sales ?? 0} curr={cur} tone="good" size="xs" />
            </div>
          </div>

          {/* 2. Purchases */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0">
            <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
              {tr("Purchases")}
            </span>
            <div className="my-0.5 truncate">
              <Amt value={perf?.purchases ?? 0} curr={cur} size="xs" />
            </div>
          </div>

          {/* 3. Expenses */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0">
            <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
              {tr("Expenses")}
            </span>
            <div className="my-0.5 truncate">
              <Amt value={perf?.expenses ?? 0} curr={cur} tone="bad" size="xs" />
            </div>
          </div>

          {/* 4. Profit */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0">
            <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">{tr("Profit")}</span>
            <div className="my-0.5 truncate">
              <Amt value={Math.max(0, perf?.profit ?? 0)} curr={cur} tone="good" size="xs" />
            </div>
          </div>

          {/* 5. Stock Value */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-w-0">
            <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
              <span className="sm:hidden">{tr("Stock")}</span>
              <span className="hidden sm:inline">{tr("Stock Value")}</span>
            </span>
            <div className="my-0.5 truncate">
              <Amt value={totalStockValuation} curr={cur} size="xs" />
            </div>
          </div>
        </div>

        {/* 4. FOUR FINANCIAL CHARTS (Strict 2x2 grid on mobile, 4-column row on desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
          {/* Chart 1: Money Position (Solid Pie Meeting at Center + Clean Account Balances) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money Position")}</span>
              <span className="text-[9px] font-mono font-bold text-emerald-500 truncate">
                {compactFmt(pos.netCash)}
              </span>
            </div>

            <div className="h-28 sm:h-32 w-full mt-1">
              {moneyPositionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={moneyPositionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius="85%"
                      paddingAngle={0}
                      dataKey="value"
                      labelLine={false}
                      label={renderPieLabel}
                      isAnimationActive={false}
                    >
                      {moneyPositionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip curr={cur} />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center p-2">
                  <span className="text-xs font-semibold text-muted-foreground">{tr("No Balances")}</span>
                  <span className="text-[9px] text-muted-foreground/80 mt-0.5">{tr("Record float or sales")}</span>
                </div>
              )}
            </div>

            {/* Bottom Balance Rows: Payment Type + Plain Account Balance */}
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-border/30 text-[9px] sm:text-[10px]">
              <div className="flex items-center justify-between min-w-0">
                <span className="text-muted-foreground truncate">{tr("Cash")}</span>
                <span className="font-mono font-bold text-foreground truncate">{compactFmt(pos.cash)}</span>
              </div>
              <div className="flex items-center justify-between min-w-0">
                <span className="text-muted-foreground truncate">{tr("M-Pesa")}</span>
                <span className="font-mono font-bold text-foreground truncate">{compactFmt(pos.mpesa)}</span>
              </div>
              <div className="flex items-center justify-between min-w-0">
                <span className="text-muted-foreground truncate">{tr("Bank")}</span>
                <span className="font-mono font-bold text-foreground truncate">{compactFmt(pos.bank)}</span>
              </div>
              <div className="flex items-center justify-between min-w-0">
                <span className="text-muted-foreground truncate">{tr("Credit")}</span>
                <span className="font-mono font-bold text-foreground truncate">{compactFmt(pos.receivables)}</span>
              </div>
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases (Dual Line Trend Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Sales vs Purchases")}
              </span>
              <div className="flex items-center gap-1.5 text-[8.5px]">
                <span className="flex items-center gap-0.5 text-emerald-500 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />S
                </span>
                <span className="flex items-center gap-0.5 text-rose-500 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />P
                </span>
              </div>
            </div>

            <div className="h-28 sm:h-32 w-full mt-1">
              {charts.salesVsPurchases.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.salesVsPurchases} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="currentColor" opacity={0.4} />
                    <YAxis tick={{ fontSize: 8 }} stroke="currentColor" opacity={0.4} tickFormatter={compactFmt} />
                    <Tooltip content={<ChartTooltip curr={cur} />} />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      name={tr("Sales")}
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="purchases"
                      name={tr("Purchases")}
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {tr("No Trends Yet")}
                </div>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between pt-1 border-t border-border/30 text-[9px] sm:text-[10px]">
              <span className="text-muted-foreground">{tr("Sales Margin")}</span>
              <span className="font-mono font-bold text-emerald-500">{perf?.margin ?? 0}%</span>
            </div>
          </div>

          {/* Chart 3: Money In vs Out (Grouped Bar Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money In vs Out")}</span>
              <div className="flex items-center gap-1.5 text-[8.5px]">
                <span className="flex items-center gap-0.5 text-cyan-500 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                  In
                </span>
                <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Out
                </span>
              </div>
            </div>

            <div className="h-28 sm:h-32 w-full mt-1">
              {charts.cashInOut.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.cashInOut} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="currentColor" opacity={0.4} />
                    <YAxis tick={{ fontSize: 8 }} stroke="currentColor" opacity={0.4} tickFormatter={compactFmt} />
                    <Tooltip content={<ChartTooltip curr={cur} />} />
                    <Bar
                      dataKey="in"
                      name={tr("Money In")}
                      fill="#06b6d4"
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="out"
                      name={tr("Money Out")}
                      fill="#f59e0b"
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {tr("No Cash Flows Yet")}
                </div>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between pt-1 border-t border-border/30 text-[9px] sm:text-[10px]">
              <span className="text-muted-foreground">{tr("Net Flow")}</span>
              <span className={cn("font-mono font-bold", pos.netCash >= 0 ? "text-cyan-500" : "text-rose-500")}>
                {compactFmt(pos.netCash)}
              </span>
            </div>
          </div>

          {/* Chart 4: Receivables vs Payables (Solid Pie Meeting at Center + Clean Legend) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Credit & Debt")}</span>
              <span className="text-[9px] font-mono font-bold text-muted-foreground truncate">
                {pos.receivables >= pos.payables ? "+Net Credit" : "-Net Debt"}
              </span>
            </div>

            <div className="h-28 sm:h-32 w-full mt-1">
              {debtPositionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={debtPositionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius="85%"
                      paddingAngle={0}
                      dataKey="value"
                      labelLine={false}
                      label={renderPieLabel}
                      isAnimationActive={false}
                    >
                      {debtPositionData.map((entry, index) => (
                        <Cell key={`cell-debt-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip curr={cur} />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center p-2">
                  <span className="text-xs font-semibold text-emerald-500">{tr("No Debt")}</span>
                  <span className="text-[9px] text-muted-foreground/80 mt-0.5">{tr("All accounts settled")}</span>
                </div>
              )}
            </div>

            {/* Bottom Balance Rows for Receivables and Payables */}
            <div className="mt-1 flex items-center justify-between pt-1 border-t border-border/30 text-[9px] sm:text-[10px]">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">{tr("To Receive")}:</span>
                <span className="font-mono font-bold text-emerald-500">{compactFmt(pos.receivables)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="text-muted-foreground">{tr("To Pay")}:</span>
                <span className="font-mono font-bold text-rose-500">{compactFmt(pos.payables)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. ALWAYS-VISIBLE NEEDS ATTENTION (3 columns, 2 rows, same line with 1-tap navigation, glass tiles) */}
        <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">{tr("Needs Attention")}</span>
            <span className="text-[10px] text-muted-foreground font-medium">{tr("Live Status")}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {/* 1. Low Stock -> /inventory */}
            <button
              type="button"
              onClick={() => navigate({ to: "/inventory" })}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Low Stock")}
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-xs sm:text-sm shrink-0",
                  lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {lowStockCount}
              </span>
            </button>

            {/* 2. Receivables -> /contacts */}
            <button
              type="button"
              onClick={() => navigate({ to: "/contacts" })}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Receivables")}
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-xs sm:text-sm shrink-0",
                  pos.receivables > 0 ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {compactFmt(pos.receivables)}
              </span>
            </button>

            {/* 3. Payables -> /purchases */}
            <button
              type="button"
              onClick={() => navigate({ to: "/purchases" })}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Payables")}
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-xs sm:text-sm shrink-0",
                  pos.payables > 0 ? "text-rose-500" : "text-muted-foreground",
                )}
              >
                {compactFmt(pos.payables)}
              </span>
            </button>

            {/* 4. POS Cash-up -> /pos */}
            <button
              type="button"
              onClick={() => navigate({ to: "/pos" })}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("POS Cash-up")}
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-xs sm:text-sm shrink-0",
                  posCashUpPendingCount > 0 ? "text-amber-500" : "text-emerald-500",
                )}
              >
                {posCashUpPendingCount > 0 ? "Pending" : "Done"}
              </span>
            </button>

            {/* 5. Pending Approvals -> /settings */}
            <button
              type="button"
              onClick={() => navigate({ to: "/settings" })}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Approvals")}
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm text-muted-foreground shrink-0">
                {pendingApprovalsCount}
              </span>
            </button>

            {/* 6. Sync Issues -> trigger sync action */}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shopbook-sync-now"));
              }}
              className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-1.5 sm:p-2 text-start hover:bg-card/90 dark:hover:bg-white/10 transition-all cursor-pointer min-w-0"
            >
              <span className="text-[9.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Sync Issues")}
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-xs sm:text-sm shrink-0",
                  syncIssuesCount > 0 ? "text-rose-500" : "text-emerald-500",
                )}
              >
                {syncIssuesCount > 0 ? syncIssuesCount : "OK"}
              </span>
            </button>
          </div>
        </div>

        {/* 6. ACTIONABLE ALERTS & OVERDUE (Collapsible glass dropdown, closed by default) */}
        <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowAlertsAccordion(!showAlertsAccordion)}
            className="flex w-full items-center justify-between p-2.5 text-start hover:bg-card/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">{tr("Actionable Alerts")}</span>
              <span className="rounded-full bg-amber-500/20 text-amber-500 px-1.5 py-0.2 text-[10px] font-bold">
                {actionableAlerts.length}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>{showAlertsAccordion ? tr("Hide") : tr("Show")}</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", showAlertsAccordion && "rotate-180")}
              />
            </div>
          </button>

          {showAlertsAccordion && (
            <div className="px-2.5 pb-2.5 pt-0 border-t border-border/40 dark:border-white/10 space-y-1.5">
              {actionableAlerts.length > 0 ? (
                actionableAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 dark:border-white/5 bg-background/50 dark:bg-white/5 backdrop-blur-md p-2"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-xs font-bold text-foreground truncate">{alert.title}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{alert.desc}</span>
                    </div>
                    <Link
                      to={alert.to}
                      className="shrink-0 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-2 py-1 text-[10px] font-bold shadow-xs transition-colors"
                    >
                      {alert.actionLabel}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="py-2 text-center text-xs text-muted-foreground">{tr("No urgent alerts right now")}</div>
              )}
            </div>
          )}
        </div>

        {/* 7. RECENT STORE ACTIVITY (Glass Cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 sm:gap-2">
          {/* Recent Sales Column */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground truncate">{tr("Recent Sales")}</span>
              <Link to="/sales" className="text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
              </Link>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {(s.sales || []).slice(0, 5).map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setViewSale(sale)}
                  className="flex items-center justify-between rounded-lg border border-border/30 dark:border-white/5 bg-background/40 dark:bg-white/5 backdrop-blur-md px-2 py-1.5 hover:bg-card/80 transition-colors cursor-pointer"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">
                      {s.customers.find((c) => c.id === sale.customerId)?.name || sale.ref || tr("Cash Sale")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(Object.keys(sale.pay) as Method[])
                        .filter((m) => sale.pay[m] > 0)
                        .map((m) => METHOD_LABEL[m])
                        .join(" + ")}{" "}
                      • {new Date(sale.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs text-emerald-500 shrink-0">
                    +{compactFmt(sale.total)}
                  </span>
                </div>
              ))}
              {(!s.sales || s.sales.length === 0) && (
                <div className="py-4 text-center text-xs text-muted-foreground">{tr("No sales recorded yet")}</div>
              )}
            </div>
          </div>

          {/* Recent Purchases Column */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground truncate">{tr("Recent Purchases")}</span>
              <Link to="/purchases" className="text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
              </Link>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {(s.purchases || []).slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border/30 dark:border-white/5 bg-background/40 dark:bg-white/5 backdrop-blur-md px-2 py-1.5 hover:bg-card/80 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">
                      {s.suppliers.find((x) => x.id === p.supplierId)?.name || p.ref || tr("Purchase Order")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.items?.length || 0} {tr("items")} • {new Date(p.at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs text-rose-500 shrink-0">-{compactFmt(p.total)}</span>
                </div>
              ))}
              {(!s.purchases || s.purchases.length === 0) && (
                <div className="py-4 text-center text-xs text-muted-foreground">{tr("No purchases recorded yet")}</div>
              )}
            </div>
          </div>

          {/* Recent Cash & Float Moves Column */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground truncate">{tr("Cash Moves")}</span>
              <Link to="/float" className="text-[10px] font-bold text-primary hover:underline">
                {tr("Till Float")}
              </Link>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {(s.payments || [])
                .filter((pm) => pm.kind === "DEPOSIT" || pm.kind === "WITHDRAWAL")
                .slice(0, 5)
                .map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between rounded-lg border border-border/30 dark:border-white/5 bg-background/40 dark:bg-white/5 backdrop-blur-md px-2 py-1.5"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-foreground truncate">
                        {pm.kind === "DEPOSIT" ? tr("Cash In") : tr("Cash Out")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{METHOD_LABEL[pm.method]}</span>
                    </div>
                    <span
                      className={cn(
                        "font-mono font-bold text-xs shrink-0",
                        pm.kind === "DEPOSIT" ? "text-cyan-500" : "text-amber-500",
                      )}
                    >
                      {pm.kind === "DEPOSIT" ? "+" : "-"}
                      {compactFmt(Math.abs(pm.amount))}
                    </span>
                  </div>
                ))}
              {(!s.payments ||
                s.payments.filter((p) => p.kind === "DEPOSIT" || p.kind === "WITHDRAWAL").length === 0) && (
                <div className="py-4 text-center text-xs text-muted-foreground">{tr("No cash moves yet")}</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 8. FLOATING SHOPBOT ICON BUTTON (Elevated bottom-8 right-4, icon-only, no circle) */}
      <div className="fixed bottom-8 sm:bottom-10 right-4 sm:right-6 z-40 transition-transform active:scale-95 drop-shadow-xl">
        <button
          type="button"
          onClick={() => setShowShopBot(true)}
          className="flex items-center justify-center p-0 bg-transparent border-0 cursor-pointer focus:outline-none"
          title={tr("ShopBot AI Assistant")}
        >
          <img src={chatIcons.light} alt="ShopBot" className="h-9 w-9 object-contain dark:hidden" />
          <img src={chatIcons.dark} alt="ShopBot" className="h-9 w-9 object-contain hidden dark:block" />
        </button>
      </div>

      {/* 9. SHOPBOT LIVE INTERACTIVE ASSISTANT MODAL */}
      <BusinessAssistant
        open={showShopBot}
        onClose={() => setShowShopBot(false)}
        shop={account?.shopName || "Shop"}
        currency={account?.currency || "KSh"}
        icon={chatIcons.light}
      />

      {/* 10. RECEIPT PREVIEW MODAL */}
      {viewSale && (
        <ReceiptSheet
          sale={viewSale}
          s={s}
          money={money}
          tr={tr}
          shop={account?.shopName || "Shop"}
          onClose={() => setViewSale(null)}
        />
      )}
    </div>
  );
}
