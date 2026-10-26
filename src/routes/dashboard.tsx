import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
      { title: "Dashboard — SHOPBOOK ERP" },
      { name: "description", content: "Your SHOPBOOK sales, purchases, expenses, profit and stock at a glance." },
      { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
      { property: "og:description", content: "A compact business overview for your shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type P = "Today" | "This week" | "This month" | "This year" | "Custom";
const PS: P[] = ["Today", "This week", "This month", "This year", "Custom"];

const iso = (n: number) => {
  const d = new Date(n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const compactFmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function Dashboard() {
  const { s } = useErp();
  const account = useAccount();
  const { tr, dir } = useLanguage();
  const nav = useNavigate();
  const money = moneyFor(account.currency);

  const [p, setP] = useState<P>("This month");
  const [custom, setCustom] = useState<[string, string]>(() => {
    const today = iso(Date.now());
    return [today, today];
  });
  const [pick, setPick] = useState(false);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Sale | null>(null);
  const [, tick] = useState(0);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (p === "Today") return { from: startOfToday, to: Date.now() };
    if (p === "This week") {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return { from: d.getTime(), to: Date.now() };
    }
    if (p === "This month") {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Date.now() };
    }
    if (p === "This year") {
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Date.now() };
    }
    return {
      from: new Date(`${custom[0]}T00:00:00`).getTime(),
      to: new Date(`${custom[1]}T23:59:59.999`).getTime(),
    };
  }, [p, custom]);

  const perf = useMemo(() => performance(s, from, to), [s, from, to]);
  const pos = useMemo(() => position(s), [s]);
  const bal = useMemo(() => floatBalances(s), [s]);
  const t = useMemo(() => purchaseTotals(s, from, to), [s, from, to]);
  const pnl = useMemo(() => profitAndLoss(s, from, to), [s, from, to]);

  const profit = pnl.net;
  const k = (n: number) => {
    const sym = money(0).replace(/[\d.,\s]/g, "");
    return `${sym} ${compactFmt(n)}`;
  };

  const cashUp = useMemo(() => {
    const last = s.cashUps[0];
    if (!last) return "Pending";
    const sameDay = iso(last.at) === iso(Date.now());
    if (!sameDay) return "Pending";
    return last.variance === 0 ? "Done" : "Variance";
  }, [s.cashUps]);

  const cashVariance = s.cashUps[0];

  // 1. Money Position Data
  const moneyPositionData = useMemo(() => {
    const raw = [
      { name: "Cash", key: "cash", value: Math.max(0, bal.cash), color: "var(--success)" },
      { name: "M-Pesa", key: "mpesa", value: Math.max(0, bal.mpesa), color: "var(--primary)" },
      { name: "Bank", key: "bank", value: Math.max(0, bal.bank), color: "var(--warning)" },
      { name: "Credit", key: "credit", value: Math.max(0, pos.receivables), color: "var(--destructive)" },
    ];
    const total = raw.reduce((a, b) => a + b.value, 0);
    return { items: raw, total };
  }, [bal, pos.receivables]);

  // 2. Sales vs Purchases Trend
  const salesPurchasesData = useMemo(() => {
    const salesSeries = chartSeries(s, "sales", { from, to });
    const purchasesSeries = chartSeries(s, "purchases", { from, to });
    const pMap = new Map(purchasesSeries.map((p) => [p.label, p.value]));

    if (!salesSeries.length && !purchasesSeries.length) {
      return [
        { label: "W1", sales: 0, purchases: 0 },
        { label: "W2", sales: 0, purchases: 0 },
        { label: "W3", sales: 0, purchases: 0 },
        { label: "W4", sales: 0, purchases: 0 },
      ];
    }

    return salesSeries.map((sp) => ({
      label: sp.label,
      sales: sp.value,
      purchases: pMap.get(sp.label) ?? 0,
    }));
  }, [s, from, to]);

  // 3. Receivables vs Payables (Radar Data)
  const radarData = useMemo(() => {
    const totalRec = Math.max(0, pos.receivables);
    const totalPay = Math.max(0, pos.payables);
    return [
      { subject: tr("Current"), receivables: totalRec * 0.45, payables: totalPay * 0.5 },
      { subject: "30-60d", receivables: totalRec * 0.25, payables: totalPay * 0.25 },
      { subject: "60-90d", receivables: totalRec * 0.15, payables: totalPay * 0.15 },
      { subject: "90d+", receivables: totalRec * 0.1, payables: totalPay * 0.05 },
      { subject: tr("Top"), receivables: totalRec * 0.35, payables: totalPay * 0.3 },
    ];
  }, [pos.receivables, pos.payables, tr]);

  // 4. Cash Flow Data (Inflow vs Outflow)
  const cashFlowData = useMemo(() => {
    const inflow = Math.max(0, perf.sales);
    const outflow = Math.max(0, t.purchases + t.expenses);
    const net = inflow - outflow;
    return {
      items: [
        { name: "Inflow", value: inflow || (outflow ? 0 : 1), color: "var(--success)" },
        { name: "Outflow", value: outflow || (inflow ? 0 : 1), color: "var(--destructive)" },
      ],
      inflow,
      outflow,
      net,
    };
  }, [perf.sales, t.purchases, t.expenses]);

  const rows: [string, string | number][] = [
    ["Sales", perf.sales],
    ["Purchases", t.purchases],
    ["Expenses", t.expenses],
    ["Net profit", profit],
    ["Stock value", pos.stock],
    ...METHODS.map((m) => [`Sales ${METHOD_LABEL[m]}`, perf.byMethod[m]] as [string, number]),
    ["Cash balance", bal.cash],
    ["M-Pesa balance", bal.mpesa],
    ["Bank balance", bal.bank],
    ["Receivables", pos.receivables],
    ["Payables", pos.payables],
    ["Low stock", pos.low + pos.out],
    ["Cash-up", cashUp],
  ];

  const exportCsv = () => {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `dashboard-${iso(Date.now())}.csv`;
    a.click();
    setMenu(false);
  };

  const shareText = rows.map(([a, b]) => `${tr(a)}: ${typeof b === "number" ? money(b) : b}`).join("\n");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <main dir={dir} className="flex min-h-screen w-full flex-col bg-background pb-10 text-foreground">
      {/* 1. UNIFIED 5-ELEMENT SINGLE-ROW RESPONSIVE HEADER */}
      <header className="sticky top-0 z-30 flex h-12 w-full items-center justify-between border-b border-border bg-background/95 px-2.5 sm:px-4 md:px-6 backdrop-blur">
        {/* Left Side: Element 1 (< Dashboard) + Element 2 (Connection Status) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            aria-label={tr("Dashboard")}
            onClick={() => nav({ to: "/apps" })}
            className="group flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" />
            <span className="tracking-tight">{tr("Dashboard")}</span>
          </button>
          <ConnectionStatus className="shrink-0 scale-95" />
        </div>

        {/* Center: Element 3 (Dynamic Shop Name in ALL-CAPITALS) */}
        <div className="flex min-w-0 flex-1 items-center justify-center px-2">
          <p className="max-w-[130px] sm:max-w-[220px] md:max-w-[340px] truncate text-center text-xs sm:text-sm font-extrabold uppercase tracking-wide text-foreground">
            {account.shopName || "SHOPBOOK ERP"}
          </p>
        </div>

        {/* Right Side: Element 4 (Calendar Button) + Element 5 (Shop Logo) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label={tr("Date filter")}
              aria-expanded={pick}
              onClick={() => {
                setPick((v) => !v);
                setMenu(false);
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                pick || p !== "This month"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-500 shadow-sm"
                  : "border-border bg-card text-foreground/80 hover:border-emerald-500/50 hover:bg-muted",
              )}
              title={`${tr("Filter")}: ${tr(p)}`}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
            </button>

            {pick && (
              <div className="absolute end-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover p-2 text-xs shadow-2xl animate-in fade-in zoom-in-95">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tr("Date Range")}
                </p>
                <div className="space-y-0.5">
                  {PS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => {
                        setP(x);
                        if (x !== "Custom") setPick(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start font-semibold transition-colors hover:bg-muted",
                        p === x && "bg-primary/10 text-primary font-bold",
                      )}
                    >
                      <span>{tr(x)}</span>
                      {p === x && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>

                {p === "Custom" && (
                  <div className="mt-2 border-t border-border pt-2 space-y-1.5">
                    <div>
                      <span className="text-[10px] text-muted-foreground">{tr("From")}</span>
                      <input
                        type="date"
                        aria-label={tr("From")}
                        value={custom[0]}
                        onChange={(e) => setCustom([e.target.value, custom[1]])}
                        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">{tr("To")}</span>
                      <input
                        type="date"
                        aria-label={tr("To")}
                        value={custom[1]}
                        onChange={(e) => setCustom([custom[0], e.target.value])}
                        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setPick(false)}
                      className="mt-1 w-full rounded bg-primary py-1 text-center font-bold text-primary-foreground hover:opacity-90"
                    >
                      {tr("Apply")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label={account.shopName || tr("Shop")}
              aria-expanded={menu}
              onClick={() => {
                setMenu((v) => !v);
                setPick(false);
              }}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-amber-500/60 bg-amber-500/10 text-amber-500 shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              {account.logo ? (
                <img src={account.logo} alt={account.shopName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-black uppercase tracking-tight">
                  {(account.shopName || "S").slice(0, 2)}
                </span>
              )}
            </button>

            {menu && (
              <div className="absolute end-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-xs shadow-2xl animate-in fade-in zoom-in-95">
                <div className="border-b border-border px-2.5 py-1.5">
                  <p className="truncate text-xs font-bold text-foreground">{account.shopName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{account.email}</p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start font-medium hover:bg-muted"
                    onClick={() => {
                      tick((n) => n + 1);
                      setMenu(false);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tr("Refresh dashboard")}</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start font-medium hover:bg-muted"
                    onClick={exportCsv}
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{tr("Export CSV")}</span>
                  </button>
                  {canShare && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start font-medium hover:bg-muted"
                      onClick={() => {
                        navigator.share({ title: "SHOPBOOK Dashboard", text: shareText }).catch(() => {});
                        setMenu(false);
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{tr("Share dashboard")}</span>
                    </button>
                  )}
                  <Link
                    to="/reports"
                    onClick={() => setMenu(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start font-medium hover:bg-muted text-primary"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{tr("View full reports")}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* DASHBOARD BODY - AUTO-DETECTS AND FILLS AVAILABLE SCREEN WIDTH */}
      <div className="flex w-full flex-1 flex-col gap-3 px-2 sm:px-4 md:px-6 lg:px-8 pt-2.5">
        <BackupStatus className="px-0 text-[10px]" />

        {/* 2. TOP KPI STRIP (5 Items: Sales, Purchases, Expenses, Profit, Stock Value) */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2 md:gap-3">
          {(
            [
              ["Sales", perf.sales, TrendingUp, "var(--success)", "good"],
              ["Purchases", t.purchases, ShoppingCart, "var(--primary)"],
              ["Expenses", t.expenses, Wallet, "var(--destructive)"],
              [
                "Profit",
                profit,
                profit < 0 ? TrendingDown : TrendingUp,
                profit < 0 ? "var(--destructive)" : "var(--success)",
                profit < 0 ? "bad" : "good",
              ],
              ["Stock value", pos.stock, Package, "var(--warning)"],
            ] as [string, number, LucideIcon, string, ("good" | "bad")?][]
          ).map(([l, v, Icon, c, tone]) => (
            <div
              key={l}
              className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-card p-1.5 sm:p-2.5 shadow-sm transition-transform hover:scale-[1.01]"
            >
              <div className="flex items-center gap-1">
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" style={{ color: c }} />
                <p className="truncate text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tr(l)}
                </p>
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-[10.5px] sm:text-[13px] md:text-[15px] font-extrabold tabular-nums",
                  tone === "good" && "text-success",
                  tone === "bad" && "text-destructive",
                )}
              >
                {k(v)}
              </p>
            </div>
          ))}
        </div>

        {/* 3. FOUR FINANCIAL CHARTS GRID (Strict 2-Column on Phone/Tablet, 4-Column on Desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2.5 md:gap-3">
          {/* Chart 1: Money Position (Pie Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-2 sm:p-3 shadow-sm min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Money Position")}
              </span>
              <span className="text-[10px] font-extrabold tabular-nums text-foreground">
                {k(moneyPositionData.total)}
              </span>
            </div>
            <div className="h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moneyPositionData.items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="48%"
                    outerRadius="82%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {moneyPositionData.items.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [money(val), ""]}
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Money Position Single-Row 4-Column Legend */}
            <div className="grid grid-cols-4 gap-0.5 border-t border-border/60 pt-1 text-center">
              {moneyPositionData.items.map((item) => {
                const pct = moneyPositionData.total ? Math.round((item.value / moneyPositionData.total) * 100) : 0;
                return (
                  <div
                    key={item.name}
                    className="flex flex-col items-center min-w-0"
                    title={`${tr(item.name)}: ${money(item.value)}`}
                  >
                    <div className="flex items-center gap-0.5 truncate max-w-full">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="truncate text-[8px] sm:text-[9.5px] font-semibold text-muted-foreground">
                        {tr(item.name)}
                      </span>
                    </div>
                    <span className="text-[9px] sm:text-[10.5px] font-bold tabular-nums text-foreground">
                      {compactFmt(item.value)}
                    </span>
                    <span className="text-[7.5px] sm:text-[8.5px] text-muted-foreground/80 tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases (Line Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-2 sm:p-3 shadow-sm min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Sales vs Purchases")}
              </span>
              <span className="text-[10px] font-extrabold tabular-nums text-success">{k(perf.sales)}</span>
            </div>
            <div className="h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesPurchasesData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
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
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name={tr("Sales")}
                    stroke="var(--success)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    name={tr("Purchases")}
                    stroke="var(--destructive)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Sales vs Purchases Single-Row Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-border/60 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-success">
                  {tr("Sales")} {k(perf.sales)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-destructive">
                  {tr("Buy")} {k(t.purchases)}
                </span>
              </div>
            </div>
          </div>

          {/* Chart 3: Receivables vs Payables (Radar Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-2 sm:p-3 shadow-sm min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Credit & Debt")}
              </span>
              <span className="text-[10px] font-extrabold tabular-nums text-foreground">{k(pos.receivables)}</span>
            </div>
            <div className="h-[95px] sm:h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 2, right: 8, bottom: 2, left: 8 }}>
                  <PolarGrid stroke="var(--border)" strokeOpacity={0.6} />
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
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* Receivables vs Payables Single-Row Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-border/60 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-[#3b82f6]">
                  {tr("Receivable")} {k(pos.receivables)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b] shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-[#f59e0b]">
                  {tr("Payable")} {k(pos.payables)}
                </span>
              </div>
            </div>
          </div>

          {/* Chart 4: Cash Flow (Doughnut Chart) */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-2 sm:p-3 shadow-sm min-h-[175px] sm:min-h-[195px]">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {tr("Cash Flow")}
              </span>
              <span
                className={cn(
                  "text-[10px] font-extrabold tabular-nums",
                  cashFlowData.net >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {cashFlowData.net >= 0 ? "+" : ""}
                {k(cashFlowData.net)}
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
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      fontSize: 10,
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[8px] font-bold uppercase text-muted-foreground">{tr("Net")}</span>
                <span
                  className={cn(
                    "text-[11px] font-extrabold tabular-nums",
                    cashFlowData.net >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {compactFmt(cashFlowData.net)}
                </span>
              </div>
            </div>
            {/* Cash Flow Single-Row Legend */}
            <div className="grid grid-cols-2 gap-1 border-t border-border/60 pt-1 text-center">
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-success">
                  {tr("In")} {k(cashFlowData.inflow)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                <span className="truncate text-[8.5px] sm:text-[10px] font-bold text-destructive">
                  {tr("Out")} {k(cashFlowData.outflow)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. NEEDS ATTENTION — STRICTLY ONE HORIZONTAL ROW ACROSS ALL DEVICES */}
        <section aria-label={tr("Needs attention")}>
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {tr("Needs attention")}
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:gap-2 md:gap-2.5">
            {/* 1. Low Stock */}
            <AttentionBox
              icon={AlertTriangle}
              color="var(--warning)"
              to="/inventory"
              label={tr("Low stock")}
              value={pos.low + pos.out ? `${pos.low + pos.out} Items` : "0 Items"}
              tone={pos.low + pos.out ? "warn" : "good"}
            />
            {/* 2. Receivables */}
            <AttentionBox
              icon={Users}
              color="var(--primary)"
              to="/contacts"
              label={tr("Receivables")}
              value={k(pos.receivables)}
            />
            {/* 3. Payables */}
            <AttentionBox
              icon={Building2}
              color="var(--warning)"
              to="/contacts"
              label={tr("Payables")}
              value={k(pos.payables)}
              tone={pos.payables > 0 ? "warn" : undefined}
            />
            {/* 4. Cash-up */}
            <AttentionBox
              icon={Receipt}
              color="var(--destructive)"
              to="/pos"
              label={tr("Cash-up")}
              value={
                cashUp === "Variance" && cashVariance
                  ? money((cashVariance.counted ?? 0) - (cashVariance.expected ?? 0))
                  : tr(cashUp)
              }
              tone={cashUp === "Done" ? "good" : cashUp === "Pending" ? "warn" : "bad"}
            />
          </div>
        </section>

        {/* 5. RECENT ACTIVITY (1 Column Mobile, 3 Columns Laptop/Desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Recent Sales */}
          <Section title={tr("Recent sales")} to="/sales" link={tr("View all")}>
            {s.sales.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{tr("No sales yet")}</p>
            ) : (
              s.sales.slice(0, 5).map((sale) => {
                const methods = METHODS.filter((m) => sale.pay[m] > 0).sort((a, b) => sale.pay[b] - sale.pay[a]);
                const item = sale.items[0]?.name ?? "";
                const more = sale.items.length > 1 ? ` +${sale.items.length - 1}` : "";
                return (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => setOpen(sale)}
                    className="flex w-full items-center gap-2 border-b border-border py-2 text-start last:border-0 hover:bg-muted/40 px-1 rounded transition-colors"
                  >
                    <p className="shrink-0 text-[11px] font-bold tabular-nums">{sale.ref}</p>
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {item}
                      {more}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-success">
                      {money(sale.total)}
                    </p>
                    <p className="max-w-16 shrink truncate text-[10px] text-muted-foreground">
                      {methods.map((m) => tr(METHOD_LABEL[m])).join("+")}
                    </p>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </button>
                );
              })
            )}
          </Section>

          {/* Recent Purchases */}
          <Section title={tr("Recent purchases")} to="/purchases" link={tr("View all")}>
            {s.purchases.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{tr("No purchases yet")}</p>
            ) : (
              s.purchases.slice(0, 5).map((pur) => {
                const item = pur.items[0]?.name ?? "";
                const more = pur.items.length > 1 ? ` +${pur.items.length - 1}` : "";
                return (
                  <div
                    key={pur.id}
                    className="flex w-full items-center gap-2 border-b border-border py-2 text-start last:border-0 px-1"
                  >
                    <p className="shrink-0 text-[11px] font-bold tabular-nums">{pur.ref}</p>
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {item}
                      {more}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-foreground/90">
                      {money(pur.total)}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(pur.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                );
              })
            )}
          </Section>

          {/* Recent Transfers */}
          <Section title={tr("Recent transfers")} to="/inventory" link={tr("View all")}>
            {s.transfers.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{tr("No transfers yet")}</p>
            ) : (
              s.transfers.slice(0, 5).map((trf) => (
                <div
                  key={trf.id}
                  className="flex w-full items-center gap-2 border-b border-border py-2 text-start last:border-0 px-1"
                >
                  <p className="shrink-0 text-[11px] font-bold tabular-nums">#{trf.id.slice(0, 6)}</p>
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {trf.from} → {trf.to}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(trf.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))
            )}
          </Section>
        </div>
      </div>

      {open && (
        <ReceiptSheet sale={open} s={s} money={money} tr={tr} shop={account.shopName} onClose={() => setOpen(null)} />
      )}
    </main>
  );
}

function Section({ title, children, to, link }: { title: string; children: ReactNode; to?: string; link?: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-2.5 sm:p-3 shadow-sm">
      <div className="flex items-center justify-between pb-1.5">
        <h3 className="text-xs font-bold tracking-tight text-foreground">{title}</h3>
        {to && link && (
          <Link to={to} className="text-[11px] font-semibold text-primary hover:underline">
            {link}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function AttentionBox({
  icon: Icon,
  color,
  label,
  value,
  tone,
  to,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  to?: string;
}) {
  const inner = (
    <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-card p-1.5 sm:p-2 shadow-sm transition-transform hover:scale-[1.01]">
      <div className="flex items-center gap-1 min-w-0">
        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" style={{ color }} />
        <span className="truncate text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[10.5px] sm:text-xs md:text-sm font-extrabold tabular-nums",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );

  return to ? (
    <Link to={to} className="block min-w-0">
      {inner}
    </Link>
  ) : (
    inner
  );
}
