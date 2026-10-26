import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Percent,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import { performance, position } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { METHOD_LABEL, empty, type Method, type Sale, type ErpState } from "@/lib/erp";
import { chartSeries } from "@/lib/chart-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SHOPBOOK ERP" },
      { name: "description", content: "Overview of sales, inventory, and finances." },
      { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
      { property: "og:description", content: "Executive overview of sales, inventory, and finances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

/** Compact number formatter for small screens */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "0";
  // Eliminate -0, negative zero representations, and floating near-zero
  if (Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString();
}

/** Fluid amount with subscript currency tag */
function Amt({
  value,
  curr,
  tone,
  size = "sm",
  className,
}: {
  value: number;
  curr?: string;
  tone?: "good" | "warn" | "bad" | undefined;
  size?: "2xs" | "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const safeVal = Object.is(value, -0) || Math.abs(value) < 0.0001 ? 0 : value;
  const numStr = compactFmt(safeVal);
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";

  const sizeClass = {
    "2xs": "text-[clamp(8px,1.8vw,10px)]",
    xs: "text-[clamp(9.5px,2.2vw,12px)]",
    sm: "text-[clamp(11px,2.6vw,14px)]",
    md: "text-[clamp(13px,3vw,16px)]",
    lg: "text-[clamp(16px,3.8vw,20px)]",
  }[size];

  const subSizeClass = {
    "2xs": "text-[7px]",
    xs: "text-[7.5px]",
    sm: "text-[8.5px]",
    md: "text-[9.5px]",
    lg: "text-[11px]",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-mono font-bold tracking-tight tabular-nums",
        toneClass,
        sizeClass,
        className,
      )}
    >
      <span>{numStr}</span>
      {curr && (
        <span className={cn("ml-0.5 font-sans font-medium uppercase tracking-normal opacity-70", subSizeClass)}>
          {curr}
        </span>
      )}
    </span>
  );
}

/**
 * Format header shop name:
 * For long names, use the first word; if the second word cannot fit, show two dots (..)
 */
function formatHeaderShopName(name: string, maxLen = 14): string {
  const clean = (name || "").trim().toUpperCase();
  if (!clean) return "SHOPBOOK ERP";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return clean.length > maxLen ? `${clean.slice(0, maxLen - 2)}..` : clean;
  }
  const first = words[0];
  const second = words[1];
  if (first.length >= maxLen - 2) {
    return `${first.slice(0, maxLen - 2)}..`;
  }
  const combined = `${first} ${second}`;
  if (words.length === 2 && combined.length <= maxLen) {
    return combined;
  }
  const availableForSecond = maxLen - first.length - 1;
  if (availableForSecond >= 4 && words.length === 2) {
    return `${first} ${second.slice(0, availableForSecond - 2)}..`;
  }
  // If second word cannot fit, show first word and two dots
  return `${first} ..`;
}

/** High-contrast chart tooltip for dark navy background */
function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  money?: (v: number) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border/80 dark:border-white/20 bg-card/95 dark:bg-slate-950/95 backdrop-blur-xl px-2.5 py-1.5 shadow-xl text-xs z-50">
      {label && <p className="font-bold text-foreground mb-1 border-b border-border/40 pb-0.5">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3 font-medium">
            <span className="flex items-center gap-1.5 text-foreground/90">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
              <span>{entry.name}:</span>
            </span>
            <span className="font-mono font-bold text-foreground">{money ? money(entry.value) : entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardView({ account }: { account: NonNullable<ReturnType<typeof useAccount>> }) {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const money = moneyFor(account);

  // Time range offset: 0 = Today, 1 = Yesterday, 7 = 7 days, 30 = 30 days
  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  // Raw ERP state loaded safely
  const rawState = useErp();

  // Normalize state defensively with canonical defaults
  const s: ErpState = useMemo(() => {
    const base = empty();
    if (!rawState) return base;

    const pickList = <T,>(val: any, fallback: T[]): T[] => (Array.isArray(val) ? val : fallback);

    return {
      ...base,
      products: pickList(rawState.products, base.products),
      sales: pickList(rawState.sales, base.sales),
      purchases: pickList(rawState.purchases, base.purchases),
      cash: pickList(rawState.cash, base.cash),
      customers: pickList(rawState.customers, base.customers),
      suppliers: pickList(rawState.suppliers, base.suppliers),
      categories: pickList(rawState.categories, base.categories),
      brands: pickList(rawState.brands, base.brands),
      movements: pickList(rawState.movements, base.movements),
      payments: pickList(rawState.payments, base.payments),
      employees: pickList(rawState.employees, base.employees),
      payrollRuns: pickList(rawState.payrollRuns, base.payrollRuns),
      wageAdvances: pickList(rawState.wageAdvances, base.wageAdvances),
      commissionRules: pickList(rawState.commissionRules, base.commissionRules),
      commissionLedger: pickList(rawState.commissionLedger, base.commissionLedger),
      priceOverrides: pickList(rawState.priceOverrides, base.priceOverrides),
      reconciliations: pickList(rawState.reconciliations, base.reconciliations),
      syncQueue: pickList(rawState.syncQueue, base.syncQueue),
      auditLog: pickList(rawState.auditLog, base.auditLog),
      daySummary: pickList(rawState.daySummary, base.daySummary),
    };
  }, [rawState]);

  // Financial summary metrics calculated safely
  const perf = performance(s, dateRangeOffset);
  const pos = position(s);
  const t = purchaseTotals(s, dateRangeOffset);
  const pnl = profitAndLoss(s, dateRangeOffset);
  const floats = floatBalances(s);

  // 1. Money Position Data
  const moneyPositionData = useMemo(() => {
    const cash = floats?.cash ?? 0;
    const mpesa = floats?.mpesa ?? 0;
    const bank = floats?.bank ?? 0;
    const credit = (pos?.receivables ?? 0) - (pos?.payables ?? 0);
    const total = Math.max(0, cash + mpesa + bank + Math.max(0, credit));

    const items = [
      { name: "Cash", value: Math.max(0, cash), color: "#10b981", raw: cash },
      { name: "M-Pesa", value: Math.max(0, mpesa), color: "#06b6d4", raw: mpesa },
      { name: "Bank", value: Math.max(0, bank), color: "#3b82f6", raw: bank },
      { name: "credit", value: Math.max(0, credit), color: "#f59e0b", raw: credit },
    ];

    return { total, items };
  }, [floats, pos]);

  // 2. Sales vs Purchases 7-Day Series
  const salesVsPurchasesData = useMemo(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);

    const salesSeries = chartSeries(s, "sales", { from: fromStr, to: toStr }, "Daily");
    const purchaseSeries = chartSeries(s, "purchases", { from: fromStr, to: toStr }, "Daily");

    return salesSeries.map((pt, i) => ({
      name: pt.period.slice(5),
      sales: pt.amount,
      purchases: purchaseSeries[i]?.amount ?? 0,
    }));
  }, [s]);

  // 3. Credit & Debt Radar Data
  const creditDebtRadarData = useMemo(() => {
    const rec = pos?.receivables ?? 0;
    const pay = pos?.payables ?? 0;

    return [
      { metric: "Total Bal", owed: rec, owing: pay },
      {
        metric: "Accounts",
        owed: (s.customers || []).filter((c) => (c.balance || 0) > 0).length * 1000,
        owing: (s.suppliers || []).filter((sup) => (sup.balance || 0) > 0).length * 1000,
      },
      { metric: "Avg / Acct", owed: rec > 0 ? rec / 5 : 0, owing: pay > 0 ? pay / 3 : 0 },
      { metric: "Exposure", owed: rec * 0.8, owing: pay * 0.8 },
    ];
  }, [pos, s.customers, s.suppliers]);

  // 4. Cash Flow Summary
  const cashFlowSummary = useMemo(() => {
    const cashIn = perf?.sales ?? 0;
    const cashOut = (t?.purchases ?? 0) + (pnl?.expenses ?? 0);
    const net = cashIn - cashOut;
    return { cashIn, cashOut, net };
  }, [perf, t, pnl]);

  // Needs Attention Counts
  const attention = useMemo(() => {
    const products = s.products || [];
    const customers = s.customers || [];
    const suppliers = s.suppliers || [];
    const cash = s.cash || [];

    const lowStockCount = products.filter((p) => (p?.qty ?? 0) <= (p?.minStock ?? 5)).length;
    const receivablesCount = customers.filter((c) => (c?.balance || 0) > 0).length;
    const payablesCount = suppliers.filter((sup) => (sup?.balance || 0) > 0).length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const hasCashedUp = cash.some(
      (c) => c?.type === "CASH UP" && c?.at && new Date(c.at).toISOString().slice(0, 10) === todayStr,
    );

    return {
      lowStock: lowStockCount,
      receivables: receivablesCount,
      payables: payablesCount,
      cashedUp: hasCashedUp,
    };
  }, [s.products, s.customers, s.suppliers, s.cash]);

  // Dynamic Date Display
  const dateRangeLabel = useMemo(() => {
    if (dateRangeOffset === 0) return tr("Today");
    if (dateRangeOffset === 1) return tr("Yesterday");
    return `${dateRangeOffset} ${tr("days ago")}`;
  }, [dateRangeOffset, tr]);

  // Formatted header shop name (with two-dots fallback for long names)
  const formattedShopName = useMemo(
    () => formatHeaderShopName(account?.shopName || "SHOPBOOK ERP"),
    [account?.shopName],
  );

  // Initials for avatar
  const shopInitials = useMemo(() => {
    const name = account?.shopName || "Shop";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [account?.shopName]);

  // Normalized profit calculation (0 is never negative)
  const cleanProfit = useMemo(() => {
    const raw = pnl?.net ?? 0;
    return Object.is(raw, -0) || Math.abs(raw) < 0.0001 ? 0 : raw;
  }, [pnl?.net]);

  // Render slice labels for money position chart
  const renderMoneySliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.06) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black text-[9px] drop-shadow-sm select-none pointer-events-none"
      >
        <tspan x={x} dy="-0.4em">
          {name}
        </tspan>
        <tspan x={x} dy="1em">
          {(percent * 100).toFixed(0)}%
        </tspan>
      </text>
    );
  };

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background font-sans text-foreground pb-6">
      {/* Background Ambient Orbs */}
      <div className="pointer-events-none fixed -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 dark:bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -right-40 h-96 w-96 rounded-full bg-accent/15 dark:bg-purple-600/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 left-1/3 h-96 w-96 rounded-full bg-primary/10 dark:bg-emerald-600/10 blur-3xl" />

      {/* 1. HEADER (Strict Single Row, Top-Left: Arrow -> Dashboard -> Online, Hairline Border) */}
      <header className="sticky top-0 z-30 w-full border-b-[0.5px] border-border/40 dark:border-white/10 bg-card/85 dark:bg-background/80 backdrop-blur-xl px-2.5 sm:px-4 py-2 transition-colors">
        <div className="flex items-center justify-between gap-1 sm:gap-3 w-full">
          {/* Top Left: Arrow -> App Name ("Dashboard") -> Online pill */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/apps"
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-foreground/90 hover:bg-muted dark:hover:bg-white/10 hover:text-foreground transition-all shrink-0"
              title={tr("Back to Apps")}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="text-[clamp(11px,2.6vw,13px)] font-bold tracking-tight text-foreground">
                {tr("Dashboard")}
              </span>
            </Link>
            <div className="shrink-0 scale-90 sm:scale-95">
              <ConnectionStatus />
            </div>
          </div>

          {/* Center: Shop Name in All-Capitals (using 2-dot format for long names) */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 max-w-[42vw] sm:max-w-none mx-auto px-1">
            <h1
              title={account?.shopName || "SHOPBOOK ERP"}
              className="truncate text-[clamp(11px,2.8vw,14px)] font-black uppercase tracking-wider text-foreground"
            >
              {formattedShopName}
            </h1>
            <span className="truncate text-[clamp(8px,1.8vw,9.5px)] font-medium text-muted-foreground tracking-tight">
              {tr("Retail Shop")}
            </span>
          </div>

          {/* Right Elements: Calendar Popover + Shop Logo/Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Calendar Date Range Popover */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                className="flex items-center gap-1 rounded-full border-[0.5px] border-border/60 dark:border-white/10 bg-card dark:bg-white/5 px-2.5 py-1 text-[clamp(9px,2vw,11px)] font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs backdrop-blur-md transition-all"
                title={tr("Select Date Range")}
              >
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <span>{dateRangeLabel}</span>
              </button>

              {showCalendarPopover && (
                <div className="absolute right-0 mt-2 z-50 w-44 rounded-xl border-[0.5px] border-border/80 dark:border-white/15 bg-card/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border/60 dark:border-white/10 pb-1 mb-1 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tr("Time Range")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCalendarPopover(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                  {[
                    { label: tr("Today"), offset: 0 },
                    { label: tr("Yesterday"), offset: 1 },
                    { label: tr("Last 7 Days"), offset: 7 },
                    { label: tr("Last 30 Days"), offset: 30 },
                  ].map((item) => (
                    <button
                      key={item.offset}
                      type="button"
                      onClick={() => {
                        setDateRangeOffset(item.offset);
                        setShowCalendarPopover(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors",
                        dateRangeOffset === item.offset
                          ? "bg-primary text-primary-foreground font-bold"
                          : "text-foreground hover:bg-muted dark:hover:bg-white/10",
                      )}
                    >
                      <span>{item.label}</span>
                      {dateRangeOffset === item.offset && <span className="text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Shop Logo/Avatar */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowShopMenu(!showShopMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/50 bg-primary/20 text-xs font-black text-foreground shadow-sm hover:scale-105 active:scale-95 transition-all overflow-hidden"
                title={account?.shopName || "Profile"}
              >
                {account?.logo ? (
                  <img src={account.logo} alt={account.shopName} className="h-full w-full object-cover" />
                ) : (
                  <span>{shopInitials}</span>
                )}
              </button>

              {showShopMenu && (
                <div className="absolute right-0 mt-2 z-50 w-48 rounded-xl border-[0.5px] border-border/80 dark:border-white/15 bg-card/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl">
                  <div className="px-2 py-1.5 border-b border-border/60 dark:border-white/10 mb-1">
                    <p className="text-xs font-bold text-foreground truncate">{account?.shopName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{account?.email || account?.phone}</p>
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
                      navigate({ to: "/reports" });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted dark:hover:bg-white/10"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tr("Export Reports")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN DASHBOARD CONTENT */}
      <main className="w-full px-2 sm:px-4 md:px-6 pt-2.5 sm:pt-3 space-y-2 sm:space-y-3">
        {/* KPI ROW: Compact without artificial height gaps, hairline borders */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {[
            { label: "Sales", value: perf?.sales ?? 0, tone: "good" as const },
            { label: "Purchases", value: t?.purchases ?? 0, tone: "bad" as const },
            { label: "Expenses", value: (pnl?.expenses ?? 0) + (pnl?.salaries ?? 0), tone: "warn" as const },
            {
              label: "Profit",
              value: cleanProfit,
              tone: cleanProfit > 0 ? ("good" as const) : cleanProfit < 0 ? ("bad" as const) : undefined,
            },
            { label: "Stock Value", value: pos?.stock ?? 0, tone: undefined },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex flex-col justify-center items-start gap-0.5 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl px-2 py-1.5 sm:px-2.5 sm:py-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
            >
              <span className="truncate text-[clamp(7.5px,1.9vw,9.5px)] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                {tr(kpi.label)}
              </span>
              <Amt value={kpi.value} tone={kpi.tone} size="xs" />
            </div>
          ))}
        </div>

        {/* 3. FOUR FINANCIAL CHARTS GRID (Strict 2-Column on Phone, Hairline Borders) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2.5 md:gap-3">
          {/* Chart 1: Money Position */}
          <div className="flex flex-col justify-between rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Money Position")}
              </span>
              <Amt value={moneyPositionData.total} size="xs" />
            </div>

            {/* Full Circle Pie Chart with slice labels */}
            <div className="h-[105px] sm:h-[120px] w-full shrink-0 my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moneyPositionData.items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={0}
                    outerRadius="82%"
                    paddingAngle={2}
                    isAnimationActive={false}
                    label={renderMoneySliceLabel}
                    labelLine={false}
                  >
                    {moneyPositionData.items.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip money={money} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Single Row Below: Cash, M-Pesa, Bank, Credit with Amount */}
            <div className="grid grid-cols-4 gap-0.5 sm:gap-1 w-full pt-1.5 border-t-[0.5px] border-border/30 dark:border-white/5">
              {moneyPositionData.items.map((item) => (
                <div key={item.name} className="flex flex-col items-center text-center min-w-0">
                  <div className="flex items-center gap-1 justify-center">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-[8px] font-semibold text-muted-foreground capitalize">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-foreground truncate mt-0.5">
                    {compactFmt(item.raw)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases */}
          <div className="flex flex-col justify-between rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Sales vs Purchases")}
              </span>
              <div className="flex items-center gap-1.5 text-[8.5px] font-semibold">
                <span className="flex items-center gap-0.5 text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {tr("Sales")}
                </span>
                <span className="flex items-center gap-0.5 text-rose-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {tr("Purchases")}
                </span>
              </div>
            </div>

            <div className="h-[110px] sm:h-[130px] w-full shrink-0 my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesVsPurchasesData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: "currentColor" }} opacity={0.6} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 8, fill: "currentColor" }}
                    opacity={0.6}
                    tickLine={false}
                    tickFormatter={compactFmt}
                  />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name={tr("Sales")}
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    name={tr("Purchases")}
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="3 3"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between pt-1 border-t-[0.5px] border-border/30 dark:border-white/5 text-[9px]">
              <span className="text-muted-foreground">{tr("Period Total")}</span>
              <span className="font-mono font-bold text-foreground">
                <span className="text-emerald-500">{compactFmt(perf?.sales ?? 0)}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-rose-500">{compactFmt(t?.purchases ?? 0)}</span>
              </span>
            </div>
          </div>

          {/* Chart 3: Credit & Debt Radar */}
          <div className="flex flex-col justify-between rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Credit & Debt")}
              </span>
              <div className="flex items-center gap-1.5 text-[8.5px] font-semibold">
                <span className="flex items-center gap-0.5 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {tr("Owed")}
                </span>
                <span className="flex items-center gap-0.5 text-rose-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {tr("Owing")}
                </span>
              </div>
            </div>

            <div className="h-[110px] sm:h-[130px] w-full shrink-0 my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={creditDebtRadarData} outerRadius="75%">
                  <PolarGrid stroke="currentColor" opacity={0.15} />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 7.5, fill: "currentColor" }} opacity={0.7} />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Radar
                    name={tr("Receivables (Owed)")}
                    dataKey="owed"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.25}
                  />
                  <Radar
                    name={tr("Payables (Owing)")}
                    dataKey="owing"
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between pt-1 border-t-[0.5px] border-border/30 dark:border-white/5 text-[9px]">
              <span className="text-muted-foreground">
                Rec: <span className="font-mono font-bold text-amber-500">{compactFmt(pos?.receivables ?? 0)}</span>
              </span>
              <span className="text-muted-foreground">
                Pay: <span className="font-mono font-bold text-rose-500">{compactFmt(pos?.payables ?? 0)}</span>
              </span>
            </div>
          </div>

          {/* Chart 4: Cash Flow Area */}
          <div className="flex flex-col justify-between rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Cash Flow")}
              </span>
              <span className="text-[9px] font-semibold text-muted-foreground">
                NET: <Amt value={cashFlowSummary.net} tone={cashFlowSummary.net >= 0 ? "good" : "bad"} size="2xs" />
              </span>
            </div>

            <div className="h-[110px] sm:h-[130px] w-full shrink-0 my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesVsPurchasesData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="flowIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: "currentColor" }} opacity={0.6} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 8, fill: "currentColor" }}
                    opacity={0.6}
                    tickLine={false}
                    tickFormatter={compactFmt}
                  />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name={tr("Cash In")}
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#flowIn)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between pt-1 border-t-[0.5px] border-border/30 dark:border-white/5 text-[9px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                In: <span className="font-mono font-bold text-emerald-500">{compactFmt(cashFlowSummary.cashIn)}</span>
              </span>
              <span className="text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Out: <span className="font-mono font-bold text-rose-500">{compactFmt(cashFlowSummary.cashOut)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4. NEEDS ATTENTION: Single Row 4-Pill Grid */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[clamp(10px,2.4vw,12px)] font-black uppercase tracking-wider text-foreground">
              {tr("Needs Attention")}
            </h2>
            <Link to="/reports" className="text-[10px] font-bold text-primary hover:underline">
              {tr("View All")} ›
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            <AttentionCard
              icon={<AlertTriangle className="h-4 w-4 text-emerald-500" />}
              title={tr("Low stock")}
              badge={attention.lowStock === 0 ? tr("Optimal") : `${attention.lowStock} ${tr("Items")}`}
              tone={attention.lowStock === 0 ? "good" : "warn"}
              to="/inventory"
            />
            <AttentionCard
              icon={<Users className="h-4 w-4 text-cyan-500" />}
              title={tr("Receivables")}
              badge={attention.receivables === 0 ? tr("None") : `${attention.receivables} ${tr("Due")}`}
              tone={attention.receivables === 0 ? "good" : "warn"}
              to="/contacts"
            />
            <AttentionCard
              icon={<Building2 className="h-4 w-4 text-emerald-500" />}
              title={tr("Payables")}
              badge={attention.payables === 0 ? tr("Settled") : `${attention.payables} ${tr("Due")}`}
              tone={attention.payables === 0 ? "good" : "warn"}
              to="/expenses"
            />
            <AttentionCard
              icon={<Wallet className="h-4 w-4 text-amber-500" />}
              title={tr("Cash-up")}
              badge={attention.cashedUp ? tr("Done") : tr("Pending")}
              tone={attention.cashedUp ? "good" : "warn"}
              to="/float"
            />
          </div>
        </section>

        {/* 5. RECENT ACTIVITY: Stacked on mobile, side-by-side 2 columns on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
          {/* Recent Sales Table */}
          <Section title={tr("Recent sales")} icon={<ShoppingCart className="h-4 w-4 text-primary" />} to="/sales">
            {(s.sales || [])
              .slice(-5)
              .reverse()
              .map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setViewSale(sale)}
                  className="flex items-center justify-between p-2 rounded-lg bg-card/40 dark:bg-card/30 hover:bg-muted/60 dark:hover:bg-white/5 cursor-pointer transition-colors text-xs border-[0.5px] border-border/20 dark:border-white/5"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-foreground truncate">
                      #{sale.id.slice(-6).toUpperCase()} · {sale.items?.length || 0} {tr("items")}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {new Date(sale.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {METHOD_LABEL[sale.method as Method] || sale.method}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Amt value={sale.total} tone="good" size="xs" />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
          </Section>

          {/* Recent Purchases Table */}
          <Section title={tr("Recent Purchases")} icon={<Truck className="h-4 w-4 text-primary" />} to="/purchases">
            {(s.purchases || [])
              .slice(-5)
              .reverse()
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-card/40 dark:bg-card/30 text-xs border-[0.5px] border-border/20 dark:border-white/5"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-foreground truncate">
                      #{p.id.slice(-6).toUpperCase()} · {p.items?.length || 0} {tr("items")}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {new Date(p.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {p.supplierName || tr("Direct")}
                    </span>
                  </div>
                  <Amt value={p.total} tone="bad" size="xs" />
                </div>
              ))}
          </Section>
        </div>
      </main>

      {/* Sale Receipt Modal */}
      {viewSale && <ReceiptSheet open={!!viewSale} sale={viewSale} onClose={() => setViewSale(null)} />}
    </div>
  );
}

function Section({ title, icon, to, children }: { title: string; icon: ReactNode; to: string; children: ReactNode }) {
  const { tr } = useLanguage();
  return (
    <div className="rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2.5 sm:p-3 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between pb-2 mb-1.5 border-b-[0.5px] border-border/30 dark:border-white/5">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
        </div>
        <Link to={to} className="text-[10px] font-bold text-primary hover:underline">
          {tr("View")} ›
        </Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AttentionCard({
  icon,
  title,
  badge,
  tone,
  to,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  tone: "good" | "warn" | "bad";
  to: string;
}) {
  const navigate = useNavigate();
  const toneBg =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
        : "bg-rose-500/10 text-rose-500 border-rose-500/20";

  return (
    <button
      type="button"
      onClick={() => navigate({ to })}
      className="flex flex-col items-center justify-center p-2 rounded-xl border-[0.5px] border-border/40 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl hover:bg-muted/80 dark:hover:bg-white/10 transition-all text-center gap-1 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
    >
      <div className="p-1 rounded-lg bg-muted/60 dark:bg-white/5">{icon}</div>
      <span className="truncate text-[clamp(8px,1.9vw,10px)] font-bold text-muted-foreground w-full">{title}</span>
      <span className={cn("truncate text-[clamp(8px,1.9vw,10.5px)] font-black w-full", toneBg.split(" ")[1])}>
        {badge}
      </span>
    </button>
  );
}

function Dashboard() {
  const account = useAccount("basic");
  if (!account) return null;
  return <DashboardView account={account} />;
}
