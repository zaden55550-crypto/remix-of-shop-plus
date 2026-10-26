import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Package,
  Receipt,
  RefreshCw,
  Share2,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
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
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { METHODS, METHOD_LABEL, type Method, type Sale } from "@/lib/erp";
import { chartSeries } from "@/lib/chart-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SHOPBOOK" },
      { name: "description", content: "Executive retail & business overview" },
      { property: "og:title", content: "Dashboard — SHOPBOOK" },
      { property: "og:description", content: "Executive retail & business overview" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

/** Compact number formatter for small screens */
function compactFmt(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "0";
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
  const numStr = compactFmt(value);
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
        <span
          className={cn(
            "ml-0.5 font-sans font-medium text-muted-foreground/75 uppercase tracking-normal",
            subSizeClass,
          )}
        >
          {curr}
        </span>
      )}
    </span>
  );
}

/** Full Circle Pie slice label: displays payment method name + percentage on the slice */
const renderMoneySliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  if (!percent || percent < 0.07) return null;
  const RADIAN = Math.PI / 180;
  const radius = (outerRadius - innerRadius) * 0.58;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={8.5}
      fontWeight="bold"
      className="select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
    >
      <tspan x={x} dy="-4.5">
        {name}
      </tspan>
      <tspan x={x} dy="10.5">{`${Math.round(percent * 100)}%`}</tspan>
    </text>
  );
};

/** Donut slice percentage label */
const renderDonutSlicePercent = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (!percent || percent < 0.08) return null;
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
      fontSize={8.5}
      fontWeight="bold"
      className="select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

function DashboardView({ account }: { account: NonNullable<ReturnType<typeof useAccount>> }) {
  const s = useErp();
  const navigate = useNavigate();
  const { tr } = useLanguage();
  const money = moneyFor(account.currency);

  const [dateRangeOffset, setDateRangeOffset] = useState(0);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Financial summary metrics
  const perf = performance(s, dateRangeOffset);
  const pos = position(s);
  const t = purchaseTotals(s, dateRangeOffset);
  const pnl = profitAndLoss(s, dateRangeOffset);
  const floats = floatBalances(s);

  // 1. Money Position Data
  const moneyPositionData = useMemo(() => {
    const cash = floats.Cash ?? 0;
    const mpesa = floats["M-Pesa"] ?? 0;
    const bank = floats.Bank ?? 0;
    const credit = s.customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const total = Math.max(0, cash) + Math.max(0, mpesa) + Math.max(0, bank) + Math.max(0, credit);

    return {
      total,
      items: [
        { name: "Cash", value: Math.max(0, cash), color: "#10B981" },
        { name: "M-Pesa", value: Math.max(0, mpesa), color: "#06B6D4" },
        { name: "Bank", value: Math.max(0, bank), color: "#3B82F6" },
        { name: "Credit", value: Math.max(0, credit), color: "#F59E0B" },
      ],
    };
  }, [floats, s.customers]);

  // 2. Sales vs Purchases Trend
  const salesPurchasesData = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const range = { from: start.getTime(), to: Date.now() };

    const sales = chartSeries(s, "sales", range, "Daily");
    const purchases = chartSeries(s, "purchases", range, "Daily");
    const labels = [...new Set([...sales, ...purchases].map((p) => p.label))];

    return labels.map((label) => ({
      label,
      sales: sales.find((p) => p.label === label)?.value ?? 0,
      purchases: purchases.find((p) => p.label === label)?.value ?? 0,
    }));
  }, [s]);

  // 3. Receivables vs Payables Radar Data
  const radarData = useMemo(() => {
    const receivables = s.customers.reduce((acc, c) => acc + (c.balance > 0 ? c.balance : 0), 0);
    const payables = s.suppliers.reduce((acc, sup) => acc + (sup.balance > 0 ? sup.balance : 0), 0);
    const customerCount = s.customers.filter((c) => c.balance > 0).length;
    const supplierCount = s.suppliers.filter((sup) => sup.balance > 0).length;
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
    const inflow = perf.sales;
    const outflow = t.purchases + (pnl.expenses + pnl.salaries);
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
  }, [perf.sales, t.purchases, pnl.expenses, pnl.salaries]);

  // Needs Attention Counts
  const attention = useMemo(() => {
    const lowStockCount = s.products.filter((p) => p.qty <= (p.minStock ?? 5)).length;
    const receivablesCount = s.customers.filter((c) => (c.balance || 0) > 0).length;
    const payablesCount = s.suppliers.filter((sup) => (sup.balance || 0) > 0).length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const hasCashedUp = s.cash.some((c) => c.type === "CASH UP" && c.at.startsWith(todayStr));

    return {
      lowStock: lowStockCount,
      receivables: receivablesCount,
      payables: payablesCount,
      cashedUp: hasCashedUp,
    };
  }, [s.inventory, s.customers, s.suppliers, s.cash]);

  // Dynamic Date Display
  const dateRangeLabel = useMemo(() => {
    if (dateRangeOffset === 0) return tr("Today");
    if (dateRangeOffset === 1) return tr("Yesterday");
    return `${dateRangeOffset} ${tr("days ago")}`;
  }, [dateRangeOffset, tr]);

  // Initials for avatar
  const shopInitials = useMemo(() => {
    const name = account.shopName || "Shop";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [account.shopName]);

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background font-sans text-foreground pb-6">
      {/* Background Ambient Orbs (Soft Peach in Light, Navy in Dark) */}
      <div className="pointer-events-none fixed -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 dark:bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -right-40 h-96 w-96 rounded-full bg-accent/15 dark:bg-purple-600/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 left-1/3 h-96 w-96 rounded-full bg-primary/10 dark:bg-emerald-600/10 blur-3xl" />

      {/* 1. HEADER (Strict Single Row, 5 Elements, Expo Glass Header) */}
      <header className="sticky top-0 z-30 w-full border-b border-border/60 dark:border-white/10 bg-card/85 dark:bg-background/80 backdrop-blur-xl px-2.5 sm:px-4 py-2 transition-colors">
        <div className="flex items-center justify-between gap-1 sm:gap-3 w-full">
          {/* Element 1: Back to Apps */}
          <Link
            to="/apps"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground/90 hover:bg-muted dark:hover:bg-white/10 hover:text-foreground transition-all shrink-0"
            title={tr("Back to Apps")}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-bold tracking-tight">{tr("Dashboard")}</span>
          </Link>

          {/* Element 2: Connection Status */}
          <div className="shrink-0 scale-90 sm:scale-95">
            <ConnectionStatus />
          </div>

          {/* Element 3: Shop Name in All-Capitals with Subtitle */}
          <div className="flex flex-col items-center justify-center text-center min-w-0 mx-auto px-1">
            <h1 className="truncate text-[clamp(11px,2.8vw,15px)] font-black uppercase tracking-wider text-foreground">
              {account.shopName || "SHOPBOOK ERP"}
            </h1>
            <span className="truncate text-[clamp(8px,1.8vw,9.5px)] font-medium text-muted-foreground tracking-tight">
              {tr(account.businessType || "Retail Shop")}
            </span>
          </div>

          {/* Element 4: Calendar Date Range Popover */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowCalendarPopover(!showCalendarPopover)}
              className="flex items-center gap-1 rounded-full border border-border/80 dark:border-white/10 bg-card dark:bg-white/5 px-2.5 py-1 text-[clamp(9px,2vw,11px)] font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs backdrop-blur-md transition-all"
              title={tr("Select Date Range")}
            >
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              <span>{dateRangeLabel}</span>
            </button>

            {showCalendarPopover && (
              <div className="absolute right-0 mt-2 z-50 w-44 rounded-xl border border-border/80 dark:border-white/15 bg-card/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl">
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

          {/* Element 5: Shop Logo/Avatar */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowShopMenu(!showShopMenu)}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/50 bg-primary/20 text-xs font-black text-foreground shadow-sm hover:scale-105 active:scale-95 transition-all overflow-hidden"
              title={account.shopName}
            >
              {account.logo ? (
                <img src={account.logo} alt={account.shopName} className="h-full w-full object-cover" />
              ) : (
                <span>{shopInitials}</span>
              )}
            </button>

            {showShopMenu && (
              <div className="absolute right-0 mt-2 z-50 w-48 rounded-xl border border-border/80 dark:border-white/15 bg-card/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl">
                <div className="px-2 py-1.5 border-b border-border/60 dark:border-white/10 mb-1">
                  <p className="text-xs font-bold text-foreground truncate">{account.shopName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{account.email || account.phone}</p>
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
      </header>

      {/* 2. MAIN DASHBOARD CONTENT */}
      <main className="w-full px-2 sm:px-4 md:px-6 pt-2.5 sm:pt-3 space-y-2 sm:space-y-3">
        {/* KPI ROW (Strict 5-Column Non-Wrapping Strip with Expo Glass) */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {[
            { label: "Sales", value: perf.sales, tone: "good" as const },
            { label: "Purchases", value: t.purchases, tone: "bad" as const },
            { label: "Expenses", value: pnl.expenses + pnl.salaries, tone: "warn" as const },
            { label: "Profit", value: pnl.net, tone: pnl.net >= 0 ? ("good" as const) : ("bad" as const) },
            { label: "Stock Value", value: pos.stock, tone: undefined },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex flex-col justify-between rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.2)] min-h-[58px] sm:min-h-[68px]"
            >
              <span className="truncate text-[clamp(7.5px,1.9vw,10px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr(kpi.label)}
              </span>
              <Amt value={kpi.value} tone={kpi.tone} size="xs" />
            </div>
          ))}
        </div>

        {/* 3. FOUR FINANCIAL CHARTS GRID (Strict 2-Column on Phone, 4-Column on Desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2.5 md:gap-3">
          {/* Chart 1: Money Position (Full Circle Pie with Slice Labels & Single Row Legend Below) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Money Position")}
              </span>
              <Amt value={moneyPositionData.total} size="xs" />
            </div>

            {/* Full Circle Pie Chart with name + percentage on slices */}
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
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Single Row Below: Cash, M-Pesa, Bank, Credit with Amount (No Percentages) */}
            <div className="grid grid-cols-4 gap-0.5 sm:gap-1 w-full pt-1.5 border-t border-border/50 dark:border-white/5">
              {moneyPositionData.items.map((item) => (
                <div
                  key={item.name}
                  className="flex flex-col items-center justify-center text-center min-w-0"
                  title={`${tr(item.name)}: ${money(item.value)}`}
                >
                  <div className="flex items-center gap-1 min-w-0 truncate max-w-full">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0 shadow-xs" style={{ background: item.color }} />
                    <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-semibold text-muted-foreground">
                      {tr(item.name)}
                    </span>
                  </div>
                  <Amt value={item.value} size="2xs" />
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases Line Chart */}
          <div className="flex flex-col justify-between rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Sales vs Purchases")}
              </span>
              <div className="flex items-center gap-1.5 shrink-0 text-[clamp(8px,1.6vw,9.5px)] font-semibold">
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {tr("Sales")}
                </span>
                <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {tr("Purchases")}
                </span>
              </div>
            </div>

            <div className="h-[105px] sm:h-[120px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesPurchasesData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
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
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    }}
                  />
                  <Line type="monotone" dataKey="sales" stroke="#10B981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="purchases" stroke="#EF4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[clamp(7.5px,1.8vw,9.5px)] pt-1 border-t border-border/50 dark:border-white/5">
              <span className="text-muted-foreground">{tr("Period Total")}</span>
              <div className="flex items-center gap-1.5">
                <Amt value={perf.sales} tone="good" size="2xs" />
                <span className="text-muted-foreground">/</span>
                <Amt value={t.purchases} tone="bad" size="2xs" />
              </div>
            </div>
          </div>

          {/* Chart 3: Receivables vs Payables (Radar Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Credit & Debt")}
              </span>
              <div className="flex items-center gap-1.5 shrink-0 text-[clamp(8px,1.6vw,9.5px)] font-semibold">
                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {tr("Owed")}
                </span>
                <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {tr("Owing")}
                </span>
              </div>
            </div>

            <div className="h-[105px] sm:h-[120px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData.series} margin={{ top: 4, right: 10, bottom: 4, left: 10 }}>
                  <PolarGrid stroke="var(--border)" strokeOpacity={0.4} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 8 }} />
                  <Radar
                    name={tr("Receivables")}
                    dataKey="receivables"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.3}
                  />
                  <Radar name={tr("Payables")} dataKey="payables" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} />
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[clamp(7.5px,1.8vw,9.5px)] pt-1 border-t border-border/50 dark:border-white/5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{tr("Rec:")}</span>
                <Amt value={radarData.receivables} tone="warn" size="2xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{tr("Pay:")}</span>
                <Amt value={radarData.payables} tone="bad" size="2xs" />
              </div>
            </div>
          </div>

          {/* Chart 4: Cash Flow (Inflow vs Outflow Donut) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[185px] sm:min-h-[205px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Cash Flow")}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[clamp(7.5px,1.6vw,9px)] font-bold text-muted-foreground">{tr("NET:")}</span>
                <Amt value={cashFlowData.net} tone={cashFlowData.net >= 0 ? "good" : "bad"} size="2xs" />
              </div>
            </div>

            <div className="h-[105px] sm:h-[120px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cashFlowData.items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="48%"
                    outerRadius="82%"
                    paddingAngle={3}
                    isAnimationActive={false}
                    label={renderDonutSlicePercent}
                    labelLine={false}
                  >
                    {cashFlowData.items.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[clamp(7.5px,1.8vw,9.5px)] pt-1 border-t border-border/50 dark:border-white/5">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">{tr("In:")}</span>
                <Amt value={cashFlowData.inflow} tone="good" size="2xs" />
              </div>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="text-muted-foreground">{tr("Out:")}</span>
                <Amt value={cashFlowData.outflow} tone="bad" size="2xs" />
              </div>
            </div>
          </div>
        </div>

        {/* 4. NEEDS ATTENTION (Strict Single Horizontal Row of 4 Indicators) */}
        <div>
          <div className="flex items-center justify-between pb-1.5 px-0.5">
            <span className="text-[clamp(10px,2.4vw,12px)] font-black uppercase tracking-wider text-foreground">
              {tr("Needs Attention")}
            </span>
            <Link to="/inventory" className="text-[clamp(8.5px,1.8vw,10.5px)] font-bold text-primary hover:underline">
              {tr("View All ›")}
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {/* Box 1: Low Stock */}
            <AttentionBox
              to="/inventory"
              icon={Package}
              label={tr("Low Stock")}
              badge={attention.lowStock > 0 ? `${attention.lowStock} ${tr("Items")}` : tr("Optimal")}
              tone={attention.lowStock > 0 ? "warn" : "good"}
            />

            {/* Box 2: Receivables */}
            <AttentionBox
              to="/contacts"
              icon={Users}
              label={tr("Receivables")}
              badge={attention.receivables > 0 ? `${attention.receivables} ${tr("Due")}` : tr("None")}
              tone={attention.receivables > 0 ? "warn" : "good"}
            />

            {/* Box 3: Payables */}
            <AttentionBox
              to="/contacts"
              icon={Building2}
              label={tr("Payables")}
              badge={attention.payables > 0 ? `${attention.payables} ${tr("Due")}` : tr("Settled")}
              tone={attention.payables > 0 ? "bad" : "good"}
            />

            {/* Box 4: Cash-Up Done */}
            <AttentionBox
              to="/float"
              icon={Wallet}
              label={tr("Cash-up")}
              badge={attention.cashedUp ? tr("Done") : tr("Pending")}
              tone={attention.cashedUp ? "good" : "warn"}
            />
          </div>
        </div>

        {/* 5. RECENT ACTIVITY (3-Column Layout on Desktop, 1-Column on Phone) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3 pt-1">
          {/* Recent Sales Table */}
          <Section title={tr("Recent Sales")} to="/sales" icon={ShoppingCart}>
            {s.sales.slice(0, 5).map((sale) => (
              <div
                key={sale.id}
                onClick={() => setSelectedSale(sale)}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5 cursor-pointer transition-colors text-xs border-b border-border/30 dark:border-white/5 last:border-none"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate text-foreground">#{sale.id.slice(0, 8)}</span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {s.customers.find((c) => c.id === sale.customerId)?.name || tr("Walk-in")} •{" "}
                    {new Date(sale.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <Amt value={sale.total} size="xs" />
                  <span className="block text-[9px] text-muted-foreground uppercase">
                    {METHOD_LABEL[sale.payments?.[0]?.method as Method] || tr("Cash")}
                  </span>
                </div>
              </div>
            ))}
          </Section>

          {/* Recent Purchases Table */}
          <Section title={tr("Recent Purchases")} to="/purchases" icon={Receipt}>
            {s.purchases.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5 transition-colors text-xs border-b border-border/30 dark:border-white/5 last:border-none"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate text-foreground">
                    {s.suppliers.find((v) => v.id === p.supplierId)?.name || tr("Supplier")}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {new Date(p.at).toLocaleDateString()}
                  </span>
                </div>
                <Amt value={p.total} tone="bad" size="xs" />
              </div>
            ))}
          </Section>

          {/* Money Transfers / Float Movements */}
          <Section title={tr("Recent Cash Moves")} to="/float" icon={Wallet}>
            {s.cash.slice(0, 5).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5 transition-colors text-xs border-b border-border/30 dark:border-white/5 last:border-none"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate text-foreground">{tr(c.type)}</span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {c.note || new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <Amt value={c.amount} tone={c.amount >= 0 ? "good" : "bad"} size="xs" />
              </div>
            ))}
          </Section>
        </div>
      </main>

      {/* Sale Receipt Modal */}
      {selectedSale && (
        <ReceiptSheet
          open={!!selectedSale}
          onOpenChange={(open) => !open && setSelectedSale(null)}
          sale={selectedSale}
          s={s}
          money={money}
          tr={tr}
          shop={account}
        />
      )}
    </div>
  );
}

function Section({
  title,
  to,
  icon: Icon,
  children,
}: {
  title: string;
  to: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const { tr } = useLanguage();
  return (
    <div className="rounded-xl border border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.2)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 dark:border-white/5 bg-muted/40 dark:bg-white/5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">{title}</span>
        </div>
        <Link to={to} className="text-[10px] font-bold text-primary hover:underline">
          {tr("View ›")}
        </Link>
      </div>
      <div className="p-1 space-y-0.5">{children}</div>
    </div>
  );
}

function AttentionBox({
  to,
  icon: Icon,
  label,
  badge,
  tone,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  badge: string;
  tone: "good" | "warn" | "bad";
}) {
  const navigate = useNavigate();
  const toneBg =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30"
      : tone === "bad"
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30";

  return (
    <button
      type="button"
      onClick={() => navigate({ to })}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border p-1.5 sm:p-2 text-center backdrop-blur-xl transition-all hover:scale-[1.02] shadow-xs",
        "border-border/60 dark:border-white/10 bg-card/75 dark:bg-card/65",
      )}
    >
      <div className={cn("p-1 sm:p-1.5 rounded-lg border mb-1", toneBg)}>
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-muted-foreground w-full">{label}</span>
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
