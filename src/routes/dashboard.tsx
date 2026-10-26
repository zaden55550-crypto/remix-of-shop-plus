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
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
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

/** Pie slice custom percentage label */
const renderSlicePercent = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (!percent || percent < 0.05) return null;
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
      fontSize={9}
      fontWeight="bold"
      className="select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

function DashboardView({ account }: { account: NonNullable<ReturnType<typeof useAccount>> }) {
  const s = useErp();
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const money = moneyFor(account.currency);
  const [selectedReceipt, setSelectedReceipt] = useState<Sale | null>(null);

  // Calendar popover & date range
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "year">("month");

  // Shop actions menu
  const [showShopMenu, setShowShopMenu] = useState(false);

  // Period offset
  const [offsetDays, setOffsetDays] = useState(0);

  // Filtered sales and transactions
  const filteredSales = useMemo(() => {
    if (offsetDays === 0) return s.sales;
    const now = Date.now();
    const cutoff = now - offsetDays * 86_400_000;
    return s.sales.filter((sale) => new Date(sale.at).getTime() >= cutoff);
  }, [s.sales, offsetDays]);

  const pnl = profitAndLoss(s);
  const perf = performance(s, 0);
  const pos = position(s);
  const bal = floatBalances(s);
  const t = purchaseTotals(s);

  // Cash-up status
  const cashUpStatus = useMemo(() => {
    const cashUps = s.cash.filter((e) => e.type === "CASH UP");
    if (cashUps.length === 0) return "Done";
    const last = cashUps[cashUps.length - 1];
    return !last || last.amount === 0 ? "Done" : "Variance";
  }, [s.cash]);

  // 1. Money Position Data
  const moneyPositionData = useMemo(() => {
    const raw = [
      { name: "Cash", key: "cash", value: Math.max(0, bal.cash), color: "#10b981" },
      { name: "M-Pesa", key: "mpesa", value: Math.max(0, bal.mpesa), color: "#06b6d4" },
      { name: "Bank", key: "bank", value: Math.max(0, bal.bank), color: "#f59e0b" },
      { name: "Credit", key: "credit", value: Math.max(0, pos.receivables), color: "#8b5cf6" },
    ];
    const total = raw.reduce((sum, item) => sum + item.value, 0);
    return { items: raw, total };
  }, [bal, pos.receivables]);

  // 2. Sales vs Purchases 7-Day Trend
  const salesPurchasesData = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
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

  // 3. Receivables vs Payables (Radar)
  const radarData = useMemo(() => {
    const maxVal = Math.max(pos.receivables, pos.payables, 1);
    return [
      { subject: tr("Current"), receivables: pos.receivables, payables: pos.payables, fullMark: maxVal },
      {
        subject: tr("30 Days"),
        receivables: Math.round(pos.receivables * 0.7),
        payables: Math.round(pos.payables * 0.6),
        fullMark: maxVal,
      },
      {
        subject: tr("60 Days"),
        receivables: Math.round(pos.receivables * 0.4),
        payables: Math.round(pos.payables * 0.3),
        fullMark: maxVal,
      },
      {
        subject: tr("90+ Days"),
        receivables: Math.round(pos.receivables * 0.15),
        payables: Math.round(pos.payables * 0.1),
        fullMark: maxVal,
      },
    ];
  }, [pos.receivables, pos.payables, tr]);

  // 4. Cash Flow Data
  const cashFlowData = useMemo(() => {
    const inflow = perf.sales;
    const outflow = t.purchases + (pnl.expenses + pnl.salaries);
    const net = inflow - outflow;
    return {
      inflow,
      outflow,
      net,
      items: [
        { name: "Inflow", value: Math.max(0, inflow), color: "#10b981" },
        { name: "Outflow", value: Math.max(0, outflow), color: "#f43f5e" },
      ],
    };
  }, [perf.sales, t.purchases, (pnl.expenses + pnl.salaries)]);

  // Needs Attention Counts
  const lowStockCount = s.products.filter((p) => p.qty <= (p.minStock ?? 5)).length;

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background font-sans text-foreground pb-6">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-cyan-500/10 blur-[110px]" />
      </div>

      {/* 1. SINGLE-ROW 5-ELEMENT HEADER (Expo Liquid Glass) */}
      <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-card/75 backdrop-blur-2xl shadow-lg">
        <div className="flex h-12 w-full items-center justify-between px-2.5 sm:px-4 md:px-6">
          {/* Element 1: Back to Apps */}
          <Link
            to="/apps"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-[clamp(11px,2.4vw,13px)]">{tr("Dashboard")}</span>
          </Link>

          {/* Element 2: Connection Status */}
          <div className="shrink-0">
            <ConnectionStatus />
          </div>

          {/* Element 3: Centered Shop Name */}
          <div className="flex-1 px-2 text-center truncate">
            <h1 className="text-[clamp(12px,2.6vw,15px)] font-black uppercase tracking-wider text-foreground truncate">
              {account.shopName || "SHOPBOOK"}
            </h1>
          </div>

          {/* Element 4: Calendar Popover Trigger */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowCalendar((prev) => !prev)}
              aria-label="Filter date range"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                showCalendar
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
              )}
            >
              <CalendarDays className="h-4 w-4" />
            </button>

            {/* Calendar Popover */}
            {showCalendar && (
              <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-white/10 bg-card/90 p-2 shadow-2xl backdrop-blur-2xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  {tr("Select Period")}
                </div>
                <div className="grid grid-cols-2 gap-1 pt-1">
                  {(
                    [
                      { id: "today", label: "Today", days: 1 },
                      { id: "week", label: "This Week", days: 7 },
                      { id: "month", label: "This Month", days: 30 },
                      { id: "year", label: "This Year", days: 365 },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setDateRange(p.id);
                        setOffsetDays(p.days);
                        setShowCalendar(false);
                      }}
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
                        dateRange === p.id
                          ? "bg-emerald-500 text-white font-bold shadow-xs"
                          : "text-foreground hover:bg-white/10",
                      )}
                    >
                      {tr(p.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Element 5: Circular Shop Logo / Action Menu */}
          <div className="relative ml-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowShopMenu((prev) => !prev)}
              aria-label="Shop Menu"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-bold uppercase text-foreground shadow-xs hover:border-white/30 transition-all overflow-hidden"
            >
              {account.shopName ? account.shopName.slice(0, 2) : "SB"}
            </button>

            {/* Shop Action Menu */}
            {showShopMenu && (
              <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-white/10 bg-card/90 p-1.5 shadow-2xl backdrop-blur-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowShopMenu(false);
                    navigate({ to: "/settings" });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-white/10"
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
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-white/10"
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
            { label: "Expenses", value: (pnl.expenses + pnl.salaries), tone: "warn" as const },
            { label: "Profit", value: pnl.net, tone: pnl.net >= 0 ? ("good" as const) : ("bad" as const) },
            { label: "Stock Value", value: pos.stock, tone: undefined },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex flex-col justify-between rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl p-1.5 sm:p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.2)] min-h-[58px] sm:min-h-[68px]"
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
          {/* Chart 1: Money Position (Pie with percentages on slices & legend on the right) */}
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Money Position")}
              </span>
              <Amt value={moneyPositionData.total} size="xs" />
            </div>

            <div className="flex items-center gap-1 w-full my-auto">
              {/* Pie Chart with slice % labels */}
              <div className="h-[105px] sm:h-[120px] w-[54%] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={moneyPositionData.items}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="44%"
                      outerRadius="82%"
                      paddingAngle={2}
                      isAnimationActive={false}
                      label={renderSlicePercent}
                      labelLine={false}
                    >
                      {moneyPositionData.items.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => [money(val), ""]}
                      contentStyle={{
                        background: "rgba(15, 23, 42, 0.9)",
                        borderColor: "rgba(255, 255, 255, 0.15)",
                        color: "#ffffff",
                        fontSize: 10,
                        borderRadius: 8,
                        backdropFilter: "blur(12px)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend on the Right */}
              <div className="flex flex-col justify-center gap-1 w-[46%] min-w-0 pr-0.5">
                {moneyPositionData.items.map((item) => {
                  const pct = moneyPositionData.total ? Math.round((item.value / moneyPositionData.total) * 100) : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-1 rounded-md px-1 py-0.5 bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                      title={`${tr(item.name)}: ${money(item.value)}`}
                    >
                      <div className="flex items-center gap-1 min-w-0 truncate">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0 shadow-xs"
                          style={{ background: item.color }}
                        />
                        <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-semibold text-muted-foreground">
                          {tr(item.name)}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 text-right">
                        <Amt value={item.value} size="2xs" />
                        <span className="text-[clamp(6.5px,1.4vw,8px)] text-muted-foreground/80 font-mono font-medium">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases (Line Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Sales vs Purchases")}
              </span>
              <Amt value={perf.sales} tone="good" size="xs" />
            </div>
            <div className="h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesPurchasesData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={compactFmt}
                    tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                  />
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "rgba(15, 23, 42, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      color: "#ffffff",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                    }}
                  />
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
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Sales vs Purchases Single-Row Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-white/10 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-emerald-400">
                  {tr("Sales")}
                </span>
                <Amt value={perf.sales} tone="good" size="2xs" />
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-rose-400">{tr("Buy")}</span>
                <Amt value={t.purchases} tone="bad" size="2xs" />
              </div>
            </div>
          </div>

          {/* Chart 3: Receivables vs Payables (Radar Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Credit & Debt")}
              </span>
              <Amt value={pos.receivables} size="xs" />
            </div>
            <div className="h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 2, right: 8, bottom: 2, left: 8 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 7.5, fill: "var(--muted-foreground)" }} />
                  <Radar
                    name={tr("Receivables")}
                    dataKey="receivables"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.35}
                    isAnimationActive={false}
                  />
                  <Radar
                    name={tr("Payables")}
                    dataKey="payables"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.35}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "rgba(15, 23, 42, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      color: "#ffffff",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-white/10 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-[#3b82f6]">
                  {tr("Receivable")}
                </span>
                <Amt value={pos.receivables} size="2xs" className="text-[#3b82f6]" />
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b] shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-[#f59e0b]">
                  {tr("Payable")}
                </span>
                <Amt value={pos.payables} size="2xs" className="text-[#f59e0b]" />
              </div>
            </div>
          </div>

          {/* Chart 4: Cash Flow (Doughnut Chart with Inflow / Outflow) */}
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.25)] min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1 gap-1">
              <span className="truncate text-[clamp(9px,2.2vw,11.5px)] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Cash Flow")}
              </span>
              <span className="inline-flex items-baseline gap-0.5">
                {cashFlowData.net >= 0 && (
                  <span className="text-emerald-400 text-[clamp(8.5px,2vw,10.5px)] font-extrabold">+</span>
                )}
                <Amt value={cashFlowData.net} tone={cashFlowData.net >= 0 ? "good" : "bad"} size="xs" />
              </span>
            </div>
            <div className="relative h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cashFlowData.items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="88%"
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {cashFlowData.items.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "rgba(15, 23, 42, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      color: "#ffffff",
                      fontSize: 10,
                      borderRadius: 8,
                      backdropFilter: "blur(12px)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[clamp(7px,1.6vw,8.5px)] font-bold uppercase text-muted-foreground">
                  {tr("Net")}
                </span>
                <Amt value={cashFlowData.net} tone={cashFlowData.net >= 0 ? "good" : "bad"} size="xs" />
              </div>
            </div>
            {/* Cash Flow Single-Row Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-white/10 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-emerald-400">{tr("In")}</span>
                <Amt value={cashFlowData.inflow} tone="good" size="2xs" />
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="truncate text-[clamp(7.5px,1.8vw,9.5px)] font-bold text-rose-400">{tr("Out")}</span>
                <Amt value={cashFlowData.outflow} tone="bad" size="2xs" />
              </div>
            </div>
          </div>
        </div>

        {/* 4. NEEDS ATTENTION — SINGLE HORIZONTAL ROW (Expo Glass Pills) */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          <AttentionBox
            title="Low Stock"
            count={lowStockCount}
            subtitle={lowStockCount === 1 ? "1 item" : `${lowStockCount} items`}
            variant={lowStockCount > 0 ? "warn" : "ok"}
            onClick={() => navigate({ to: "/inventory" })}
          />
          <AttentionBox
            title="Receivables"
            count={pos.receivables}
            subtitle={money(pos.receivables)}
            variant={pos.receivables > 0 ? "info" : "ok"}
            onClick={() => navigate({ to: "/sales" })}
          />
          <AttentionBox
            title="Payables"
            count={pos.payables}
            subtitle={money(pos.payables)}
            variant={pos.payables > 0 ? "warn" : "ok"}
            onClick={() => navigate({ to: "/purchases" })}
          />
          <AttentionBox
            title="Cash-up"
            count={cashUpStatus === "Done" ? 0 : 1}
            subtitle={cashUpStatus}
            variant={cashUpStatus === "Done" ? "ok" : "bad"}
            onClick={() => navigate({ to: "/float" })}
          />
        </div>

        {/* 5. RECENT ACTIVITY (Recent Sales, Purchases, Transfers) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
          {/* Recent Sales */}
          <Section title={tr("Recent Sales")}>
            <div className="divide-y divide-white/5">
              {filteredSales.slice(0, 5).map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setSelectedReceipt(sale)}
                  className="flex items-center justify-between p-2 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold truncate">{s.customers.find((c) => c.id === sale.customerId)?.name || tr("Walk-in customer")}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(sale.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Amt value={sale.total} tone="good" size="xs" />
                </div>
              ))}
              {filteredSales.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">{tr("No recent sales")}</div>
              )}
            </div>
          </Section>

          {/* Recent Purchases */}
          <Section title={tr("Recent Purchases")}>
            <div className="divide-y divide-white/5">
              {s.purchases.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 hover:bg-white/5 transition-colors">
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold truncate">{s.suppliers.find((v) => v.id === p.supplierId)?.name || tr("Direct Supplier")}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(p.at).toLocaleDateString()}</div>
                  </div>
                  <Amt value={p.total} tone="bad" size="xs" />
                </div>
              ))}
              {s.purchases.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">{tr("No recent purchases")}</div>
              )}
            </div>
          </Section>

          {/* Transfers & Float Moves */}
          <Section title={tr("Transfers")}>
            <div className="divide-y divide-white/5">
              {s.cash
                .slice(-5)
                .reverse()
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 hover:bg-white/5 transition-colors">
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold truncate">{c.note || c.type}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Amt value={c.amount} size="xs" />
                  </div>
                ))}
              {s.cash.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">{tr("No recent moves")}</div>
              )}
            </div>
          </Section>
        </div>
      </main>

      {/* 6. RECEIPT VIEWER SHEET */}
      {selectedReceipt && (
        <ReceiptSheet sale={selectedReceipt} s={s} money={money} tr={tr} shop={account.shopName} onClose={() => setSelectedReceipt(null)} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/65 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.2)] overflow-hidden">
      <div className="border-b border-white/10 px-3 py-2 text-[clamp(10px,2.2vw,12px)] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function AttentionBox({
  title,
  count,
  subtitle,
  variant,
  onClick,
}: {
  title: string;
  count: number;
  subtitle: string;
  variant: "ok" | "warn" | "bad" | "info";
  onClick: () => void;
}) {
  const borderTone =
    variant === "bad"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : variant === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : variant === "info"
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
          : "border-white/10 bg-white/5 text-emerald-300";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border p-1.5 sm:p-2 text-center backdrop-blur-xl transition-all hover:scale-[1.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
        borderTone,
      )}
    >
      <span className="text-[clamp(7.5px,1.8vw,9.5px)] font-bold uppercase tracking-wide text-muted-foreground truncate w-full">
        {title}
      </span>
      <span className="text-[clamp(10px,2.4vw,13px)] font-black tabular-nums mt-0.5 truncate w-full">{subtitle}</span>
    </button>
  );
}

function Dashboard() {
  const account = useAccount("basic");
  if (!account) return null;
  return <DashboardView account={account} />;
}
