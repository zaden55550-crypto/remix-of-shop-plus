import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronLeft,
  Download,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
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
      { name: "description", content: "Real-time retail business performance overview and analytics." },
      { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
      { property: "og:description", content: "Live financial KPIs, trends, and recent store activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

/** Compact number formatter for small screens */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n) || Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString();
}

/** Formats shop name so long multi-word names stay on one line on small screens */
function formatHeaderShopName(name: string): string {
  if (!name) return "SHOPBOOK";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]!.toUpperCase();
  if (parts[0]!.length >= 10 || `${parts[0]} ${parts[1]}`.length > 15) {
    return `${parts[0]!.toUpperCase()}..`;
  }
  return `${parts[0]!.toUpperCase()} ${parts[1]!.toUpperCase()}${parts.length > 2 ? ".." : ""}`;
}

/** Currency formatter component with small subscript currency code */
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

  const numSize =
    size === "2xs"
      ? "text-[10px]"
      : size === "xs"
        ? "text-xs sm:text-sm"
        : size === "sm"
          ? "text-sm sm:text-base"
          : size === "md"
            ? "text-base sm:text-lg"
            : "text-lg sm:text-xl";

  const currSize =
    size === "2xs"
      ? "text-[7px]"
      : size === "xs"
        ? "text-[8px] sm:text-[9px]"
        : size === "sm"
          ? "text-[9px] sm:text-[10px]"
          : "text-[10px] sm:text-xs";

  return (
    <span className={cn("inline-flex items-baseline font-mono font-extrabold tracking-tight", toneClass, className)}>
      <span className={numSize}>{numStr}</span>
      <span className={cn("ml-0.5 font-sans font-semibold text-muted-foreground/75 lowercase", currSize)}>{curr}</span>
    </span>
  );
}

/** High contrast chart tooltip */
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
    <div className="rounded-xl border border-white/20 bg-slate-950/95 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur-xl">
      {label && <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</div>}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const val = entry.value ?? 0;
          const name = entry.name || entry.dataKey || "Value";
          const color = entry.color || entry.payload?.fill || entry.stroke || "#10B981";
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs font-bold">
              <span className="h-2 w-2 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
              <span className="text-slate-200">{name}:</span>
              <span className="font-mono text-emerald-400 font-extrabold">{money ? money(val) : compactFmt(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const account = useAccount("basic");
  if (!account) return null;
  return <DashboardView account={account} />;
}

function DashboardView({ account }: { account: NonNullable<ReturnType<typeof useAccount>> }) {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const money = moneyFor(account.currency);

  const erpRaw = useErp();
  const s: ErpState = useMemo(() => {
    const base = empty();
    if (!erpRaw || typeof erpRaw !== "object") return base;
    const clean: Partial<ErpState> = {};
    for (const key of Object.keys(base) as (keyof ErpState)[]) {
      if (Array.isArray(base[key])) {
        clean[key] = Array.isArray((erpRaw as any)[key]) ? (erpRaw as any)[key] : base[key];
      } else if (typeof base[key] === "object" && base[key] !== null) {
        clean[key] =
          typeof (erpRaw as any)[key] === "object" && (erpRaw as any)[key] !== null ? (erpRaw as any)[key] : base[key];
      }
    }
    return { ...base, ...clean };
  }, [erpRaw]);

  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const perf = useMemo(() => performance(s, 0), [s]);
  const pos = useMemo(() => position(s), [s]);
  const pnl = useMemo(() => profitAndLoss(s), [s]);
  const t = useMemo(() => purchaseTotals(s), [s]);
  const balances = useMemo(() => floatBalances(s), [s]);

  // 1. Money Position Breakdown
  const moneyPosition = useMemo(() => {
    const mpesa = balances.mpesa ?? 0;
    const cash = balances.cash ?? 0;
    const bank = balances.bank ?? 0;
    const credit = (s.customers || []).reduce((acc, c) => acc + (c?.balance && c.balance > 0 ? c.balance : 0), 0);
    const total = mpesa + cash + bank + credit;

    const items = [
      { name: "M-Pesa", value: Math.max(0, mpesa), raw: mpesa, color: "#10B981" },
      { name: "Cash", value: Math.max(0, cash), raw: cash, color: "#3B82F6" },
      { name: "Bank", value: Math.max(0, bank), raw: bank, color: "#8B5CF6" },
      { name: "Credit", value: Math.max(0, credit), raw: credit, color: "#F59E0B" },
    ];

    return { total, items };
  }, [balances, s.customers]);

  // 2. Sales vs Purchases Trend
  const trendSeries = useMemo(() => {
    try {
      const now = new Date();
      const past = new Date(now.getTime() - 6 * 86400000);
      const toStr = now.getTime();
      const fromStr = new Date(past.getFullYear(), past.getMonth(), past.getDate()).getTime();

      const salesData = chartSeries(s, "sales", { from: fromStr, to: toStr }, "Daily");
      const purchasesData = chartSeries(s, "purchases", { from: fromStr, to: toStr }, "Daily");

      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const result = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dayKey = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        const dayLabel = days[d.getDay()]!;

        const sItem = (salesData || []).find((p: any) => p?.period === dayKey || p?.label === dayKey);
        const pItem = (purchasesData || []).find((p: any) => p?.period === dayKey || p?.label === dayKey);

        result.push({
          day: dayLabel,
          sales: sItem?.value ?? (i === 0 ? (perf?.sales ?? 0) : 0),
          purchases: pItem?.value ?? (i === 0 ? (t?.purchases ?? 0) : 0),
        });
      }
      return result;
    } catch {
      return [
        { day: "Mon", sales: 0, purchases: 0 },
        { day: "Tue", sales: 0, purchases: 0 },
        { day: "Wed", sales: 0, purchases: 0 },
        { day: "Thu", sales: 0, purchases: 0 },
        { day: "Fri", sales: 0, purchases: 0 },
        { day: "Sat", sales: 0, purchases: 0 },
        { day: "Sun", sales: perf?.sales ?? 0, purchases: t?.purchases ?? 0 },
      ];
    }
  }, [s, perf?.sales, t?.purchases]);

  // 3. Receivables vs Payables (Credit & Debt Radar)
  const creditDebt = useMemo(() => {
    const customers = s.customers || [];
    const suppliers = s.suppliers || [];
    const receivables = customers.reduce((acc, c) => acc + (c?.balance && c.balance > 0 ? c.balance : 0), 0);
    const payables = suppliers.reduce((acc, sup) => acc + (sup?.balance && sup.balance > 0 ? sup.balance : 0), 0);
    const customerCount = customers.filter((c) => (c?.balance || 0) > 0).length;
    const supplierCount = suppliers.filter((sup) => (sup?.balance || 0) > 0).length;
    const avgRec = customerCount > 0 ? receivables / customerCount : 0;
    const avgPay = supplierCount > 0 ? payables / supplierCount : 0;

    return {
      receivables,
      payables,
      series: [
        { subject: tr("Total Bal"), receivables, payables },
        { subject: tr("Accounts"), receivables: customerCount * 1000, payables: supplierCount * 1000 },
        { subject: tr("Avg / Acct"), receivables: avgRec, payables: avgPay },
        { subject: tr("Exposure"), receivables: receivables * 0.8, payables: payables * 0.8 },
      ],
    };
  }, [s.customers, s.suppliers, tr]);

  // 4. Cash Flow Breakdown (Inflow vs Outflow)
  const cashFlowData = useMemo(() => {
    const inflow = perf?.sales ?? 0;
    const outflow = (t?.purchases ?? 0) + ((pnl?.expenses ?? 0) + (pnl?.salaries ?? 0));
    const net = inflow - outflow;
    return {
      inflow,
      outflow,
      net,
      items: [
        { name: "Inflow", value: Math.max(0, inflow), color: "#10B981" },
        { name: "Outflow", value: Math.max(0, outflow), color: "#EF4444" },
      ],
    };
  }, [perf?.sales, t?.purchases, pnl?.expenses, pnl?.salaries]);

  // Needs Attention Counts
  const attention = useMemo(() => {
    const products = s.products || [];
    const customers = s.customers || [];
    const suppliers = s.suppliers || [];
    const cash = s.cash || [];

    const lowStockCount = products.filter((p) => {
      const q = typeof p?.qty === "number" ? p.qty : 0;
      const re = typeof p?.minStock === "number" ? p.minStock : 5;
      return q <= re;
    }).length;

    const overdueReceivables = customers.filter((c) => (c?.balance || 0) > 0).length;
    const overduePayables = suppliers.filter((sup) => (sup?.balance || 0) > 0).length;

    const now = Date.now();
    const lastCashUp = cash[0]?.at ? new Date(cash[0].at).getTime() : 0;
    const needsCashUp = now - lastCashUp > 86400000;

    return {
      lowStock: lowStockCount,
      receivables: overdueReceivables,
      payables: overduePayables,
      needsCashUp,
    };
  }, [s.products, s.customers, s.suppliers, s.cash]);

  // Date Range Display Label
  const dateRangeLabel = useMemo(() => {
    if (dateRangeOffset === 0) return tr("Today");
    if (dateRangeOffset === 1) return tr("Yesterday");
    return `${dateRangeOffset} ${tr("days ago")}`;
  }, [dateRangeOffset, tr]);

  // Initials for avatar
  const shopInitials = useMemo(() => {
    const name = account?.shopName || "Shop";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [account?.shopName]);

  // Recent lists
  const recentSales = useMemo(() => (s.sales || []).slice(0, 5), [s.sales]);
  const recentPurchases = useMemo(() => (s.purchases || []).slice(0, 5), [s.purchases]);
  const recentMoves = useMemo(() => (s.payments || []).slice(0, 5), [s.payments]);

  // Non-negative profit
  const netProfit = useMemo(() => {
    const raw = pnl?.net ?? 0;
    if (Object.is(raw, -0) || Math.abs(raw) < 0.0001) return 0;
    return Math.max(0, raw);
  }, [pnl?.net]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground pb-12 font-sans select-none antialiased">
      {/* 1. TOP UNIFIED COMPACT HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 dark:border-white/10 bg-background/80 dark:bg-slate-950/80 backdrop-blur-xl px-2 sm:px-4 py-1.5 transition-all">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Left Elements: Back to Apps + Connection Pill */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              to="/apps"
              className="inline-flex items-center gap-0.5 rounded-lg border-[0.5px] border-border/60 dark:border-white/10 bg-card dark:bg-white/5 px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all"
              title={tr("Back to Apps")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline font-bold">{tr("Apps")}</span>
            </Link>

            <span className="text-muted-foreground/40 text-xs hidden sm:inline">|</span>
            <div className="scale-90 sm:scale-95 origin-left">
              <ConnectionStatus />
            </div>
          </div>

          {/* Center: Shop Name in All-Capitals with Subtitle */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 mx-auto px-1">
            <h1 className="truncate text-[clamp(11px,2.8vw,15px)] font-black uppercase tracking-wider text-foreground">
              {formatHeaderShopName(account?.shopName || "SHOPBOOK ERP")}
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

            {/* Shop Avatar / Menu Dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowShopMenu(!showShopMenu)}
                className="h-7 w-7 rounded-full border-[0.5px] border-border/60 dark:border-white/20 bg-primary/10 dark:bg-white/10 flex items-center justify-center text-[10px] font-black text-primary hover:scale-105 transition-all shadow-xs"
                title={account?.shopName || "Profile"}
              >
                {account?.logo ? (
                  <img src={account.logo} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  shopInitials
                )}
              </button>

              {showShopMenu && (
                <div className="absolute right-0 mt-2 z-50 w-48 rounded-xl border-[0.5px] border-border/80 dark:border-white/15 bg-card/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl">
                  <div className="px-2 py-1 border-b border-border/60 dark:border-white/10 mb-1">
                    <div className="text-xs font-bold text-foreground truncate">{account?.shopName}</div>
                    <div className="text-[10px] text-muted-foreground">{account?.currency}</div>
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
              value: netProfit,
              tone: "good" as const,
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

        {/* 3. FOUR FINANCIAL CHARTS GRID (Strict 2-columns on phone, 4 on desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2.5">
          {/* Chart 1: Money Position (Pie with full-circle slice percentages) */}
          <div className="flex flex-col rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money Position")}</span>
              <span className="text-[9px] font-mono text-muted-foreground">{compactFmt(moneyPosition.total)}</span>
            </div>

            <div className="h-28 sm:h-32 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moneyPosition.items}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="78%"
                    innerRadius="0%"
                    paddingAngle={2}
                    labelLine={false}
                    label={({ percent }) => (percent && percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : "")}
                  >
                    {moneyPosition.items.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip money={money} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom single-row amount-only legend */}
            <div className="grid grid-cols-4 gap-0.5 pt-1 border-t border-border/40 dark:border-white/10 text-center">
              {moneyPosition.items.map((item) => (
                <div key={item.name} className="flex flex-col items-center">
                  <span className="text-[7.5px] font-bold text-muted-foreground truncate">{item.name}</span>
                  <span className="text-[8px] font-mono font-extrabold text-foreground">{compactFmt(item.raw)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases Trend */}
          <div className="flex flex-col rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Sales vs Purchases")}
              </span>
              <div className="flex items-center gap-1.5 text-[8px] font-bold">
                <span className="text-emerald-500">● {tr("Sales")}</span>
                <span className="text-rose-500">● {tr("Purch")}</span>
              </div>
            </div>

            <div className="h-28 sm:h-32 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendSeries} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="day"
                    stroke="var(--muted-foreground)"
                    fontSize={8.5}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={8.5}
                    tickFormatter={(v) => compactFmt(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Line type="monotone" dataKey="sales" name="Sales" stroke="#10B981" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    name="Purchases"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/40 dark:border-white/10 text-[8px]">
              <span className="text-muted-foreground">{tr("7 Days Net:")}</span>
              <span className="font-mono font-bold text-emerald-500">
                {compactFmt((perf?.sales ?? 0) - (t?.purchases ?? 0))}
              </span>
            </div>
          </div>

          {/* Chart 3: Credit & Debt Exposure (Radar) */}
          <div className="flex flex-col rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Credit & Debt")}</span>
              <div className="flex items-center gap-1.5 text-[8px] font-bold">
                <span className="text-amber-500">● {tr("Recv")}</span>
                <span className="text-rose-500">● {tr("Pay")}</span>
              </div>
            </div>

            <div className="h-28 sm:h-32 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={creditDebt.series} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <PolarGrid stroke="var(--border)" opacity={0.3} />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 7, fill: "var(--muted-foreground)" }} />
                  <Radar name="Receivables" dataKey="receivables" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} />
                  <Radar name="Payables" dataKey="payables" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} />
                  <Tooltip content={<ChartTooltip money={money} />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/40 dark:border-white/10 text-[8px]">
              <span className="text-muted-foreground">{tr("Ratio (Recv/Pay):")}</span>
              <span className="font-mono font-bold text-foreground">
                {creditDebt.payables > 0 ? (creditDebt.receivables / creditDebt.payables).toFixed(1) : "∞"}
              </span>
            </div>
          </div>

          {/* Chart 4: Cash Flow Breakdown */}
          <div className="flex flex-col rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Cash Flow")}</span>
              <span
                className={cn(
                  "text-[9px] font-mono font-bold",
                  cashFlowData.net >= 0 ? "text-emerald-500" : "text-rose-500",
                )}
              >
                NET {compactFmt(cashFlowData.net)}
              </span>
            </div>

            <div className="h-28 sm:h-32 w-full my-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cashFlowData.items}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="50%"
                    outerRadius="78%"
                    paddingAngle={3}
                    labelLine={false}
                    label={({ percent }) => (percent && percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : "")}
                  >
                    {cashFlowData.items.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip money={money} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[7.5px] font-bold uppercase text-muted-foreground">NET</span>
                <span className="text-[10px] font-mono font-extrabold text-foreground">
                  {compactFmt(cashFlowData.net)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/40 dark:border-white/10 text-[8px]">
              <span className="text-emerald-500 font-bold">IN {compactFmt(cashFlowData.inflow)}</span>
              <span className="text-rose-500 font-bold">OUT {compactFmt(cashFlowData.outflow)}</span>
            </div>
          </div>
        </div>

        {/* 4. NEEDS ATTENTION STRIP */}
        <div className="rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
          <div className="flex items-center gap-1.5 pb-1.5 border-b border-border/40 dark:border-white/10">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-bold text-foreground">{tr("Needs Attention")}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1.5">
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] font-semibold text-muted-foreground">{tr("Low Stock")}</span>
              <span
                className={cn(
                  "text-xs font-mono font-bold",
                  attention.lowStock > 0 ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {attention.lowStock}
              </span>
            </div>

            <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] font-semibold text-muted-foreground">{tr("Unpaid Debtors")}</span>
              <span
                className={cn(
                  "text-xs font-mono font-bold",
                  attention.receivables > 0 ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {attention.receivables}
              </span>
            </div>

            <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] font-semibold text-muted-foreground">{tr("Due Creditors")}</span>
              <span
                className={cn(
                  "text-xs font-mono font-bold",
                  attention.payables > 0 ? "text-rose-500" : "text-muted-foreground",
                )}
              >
                {attention.payables}
              </span>
            </div>

            <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] font-semibold text-muted-foreground">{tr("POS Cash-up")}</span>
              <span
                className={cn("text-[10px] font-bold", attention.needsCashUp ? "text-amber-500" : "text-emerald-500")}
              >
                {attention.needsCashUp ? tr("Pending") : tr("Done")}
              </span>
            </div>
          </div>
        </div>

        {/* 5. RECENT ACTIVITY: Sales & Purchases side-by-side on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
          {/* Recent Sales Table */}
          <div className="rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <div className="flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-bold text-foreground">{tr("Recent Sales")}</span>
              </div>
              <Link to="/sales" className="text-[10px] font-bold text-primary hover:underline">
                {tr("View All >")}
              </Link>
            </div>

            <div className="divide-y divide-border/30 pt-1">
              {recentSales.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-muted-foreground">
                  {tr("No recent sales recorded")}
                </div>
              ) : (
                recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => setViewSale(sale)}
                    className="flex items-center justify-between py-1.5 px-1 hover:bg-muted/40 rounded cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-foreground truncate">
                        {sale.ref || sale.id}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground">
                        {(Object.keys(sale.pay || {}) as Method[]).filter((k) => (sale.pay?.[k] ?? 0) > 0).map((k) => METHOD_LABEL[k]).join(" + ") || "—"} · {sale.items?.length || 0} items
                      </span>
                    </div>
                    <Amt value={sale.total} tone="good" size="xs" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Purchases Table */}
          <div className="rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-bold text-foreground">{tr("Recent Purchases")}</span>
              </div>
              <Link to="/purchases" className="text-[10px] font-bold text-primary hover:underline">
                {tr("View All >")}
              </Link>
            </div>

            <div className="divide-y divide-border/30 pt-1">
              {recentPurchases.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-muted-foreground">
                  {tr("No recent purchases recorded")}
                </div>
              ) : (
                recentPurchases.map((pur) => (
                  <div
                    key={pur.id}
                    className="flex items-center justify-between py-1.5 px-1 hover:bg-muted/40 rounded transition-colors"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-foreground truncate">
                        {s.suppliers.find((x) => x.id === pur.supplierId)?.name || "Supplier"}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground">{pur.ref || pur.id}</span>
                    </div>
                    <Amt value={pur.total} tone="bad" size="xs" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Cash Moves */}
        <div className="rounded-xl border-[0.5px] border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-bold text-foreground">{tr("Recent Cash Moves")}</span>
            </div>
            <Link to="/float" className="text-[10px] font-bold text-primary hover:underline">
              {tr("Manage Float >")}
            </Link>
          </div>

          <div className="divide-y divide-border/30 pt-1">
            {recentMoves.length === 0 ? (
              <div className="py-3 text-center text-[10px] text-muted-foreground">{tr("No cash movements logged")}</div>
            ) : (
              recentMoves.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1 px-1">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-foreground truncate">{m.source || m.kind}</span>
                    <span className="text-[8.5px] text-muted-foreground">
                      {METHOD_LABEL[m.method as Method] || m.method}
                    </span>
                  </div>
                  <Amt value={m.amount} tone={m.amount >= 0 ? "good" : "bad"} size="xs" />
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* RECEIPT PREVIEW SHEET */}
      {viewSale && <ReceiptSheet sale={viewSale} s={s} money={money} tr={tr} shop={account?.shopName || "Shop"} onClose={() => setViewSale(null)} />}
    </div>
  );
}
