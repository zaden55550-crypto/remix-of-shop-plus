import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  Package,
  Receipt,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
import { performance, position } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { METHOD_LABEL, empty, type Method, type Sale, type ErpState } from "@/lib/erp";
import { chartSeries } from "@/lib/chart-data";
import { chatIcons, trialDaysLeft } from "@/lib/shopbook";
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

/** Currency formatter component with responsive typography */
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
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-rose-500"
        : tone === "warn"
          ? "text-amber-500"
          : "text-foreground";

  const isLong = numStr.length >= 6;
  const numSize =
    size === "2xs"
      ? "text-[9.5px]"
      : size === "xs"
        ? isLong
          ? "text-[clamp(8.5px,2.2vw,11.5px)] sm:text-xs"
          : "text-[clamp(10px,2.6vw,13px)] sm:text-sm"
        : size === "sm"
          ? isLong
            ? "text-[clamp(11px,2.6vw,13.5px)] sm:text-sm"
            : "text-xs sm:text-sm"
          : size === "md"
            ? "text-sm sm:text-base"
            : "text-base sm:text-lg";

  const currSize =
    size === "2xs"
      ? "text-[6.5px]"
      : size === "xs"
        ? isLong
          ? "text-[7px] sm:text-[8px]"
          : "text-[7.5px] sm:text-[8.5px]"
        : size === "sm"
          ? "text-[8px] sm:text-[9px]"
          : "text-[9px] sm:text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-mono font-black tracking-tight truncate max-w-full",
        toneClass,
        className,
      )}
    >
      <span className={cn("font-black", numSize)}>{numStr}</span>
      <span className={cn("ml-0.5 font-sans font-bold text-muted-foreground/80 lowercase shrink-0", currSize)}>
        {curr}
      </span>
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
    <div className="rounded-xl border border-white/20 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl text-white z-50">
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
  const [showShopBot, setShowShopBot] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const daysLeft = useMemo(() => trialDaysLeft(account), [account]);

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

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
      const result = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dayKey = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        const label = months[6 - i] || dayKey;

        const sItem = (salesData || []).find((p: any) => p?.period === dayKey || p?.label === dayKey);
        const pItem = (purchasesData || []).find((p: any) => p?.period === dayKey || p?.label === dayKey);

        result.push({
          label,
          sales: sItem?.value ?? (i === 0 ? (perf?.sales ?? 0) : 0),
          purchases: pItem?.value ?? (i === 0 ? (t?.purchases ?? 0) : 0),
        });
      }
      return result;
    } catch {
      return [
        { label: "Jan", sales: 0, purchases: 0 },
        { label: "Feb", sales: 0, purchases: 0 },
        { label: "Mar", sales: 0, purchases: 0 },
        { label: "Apr", sales: 0, purchases: 0 },
        { label: "May", sales: 0, purchases: 0 },
        { label: "Jun", sales: 0, purchases: 0 },
        { label: "Jul", sales: perf?.sales ?? 0, purchases: t?.purchases ?? 0 },
      ];
    }
  }, [s, perf?.sales, t?.purchases]);

  // 3. Receivables vs Payables Breakdown
  const creditDebt = useMemo(() => {
    const customers = s.customers || [];
    const suppliers = s.suppliers || [];
    const receivables = customers.reduce((acc, c) => acc + (c?.balance && c.balance > 0 ? c.balance : 0), 0);
    const payables = suppliers.reduce((acc, sup) => acc + (sup?.balance && sup.balance > 0 ? sup.balance : 0), 0);
    return {
      receivables,
      payables,
      total: receivables + payables,
    };
  }, [s.customers, s.suppliers]);

  // Receivables vs Payables Pie / Donut Model
  const recPayDonut = useMemo(() => {
    const rec = creditDebt.receivables;
    const pay = creditDebt.payables;
    const total = rec + pay;
    const items = [
      { name: tr("Receivables"), value: Math.max(0, rec), raw: rec, color: "#10B981" },
      { name: tr("Payables"), value: Math.max(0, pay), raw: pay, color: "#F59E0B" },
    ];
    return { total, items, rec, pay };
  }, [creditDebt, tr]);

  // 4. Money In vs Out (Grouped Bar Chart)
  const moneyInOutSeries = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    const baseIn = (perf?.sales ?? 0) / 7;
    const baseOut = ((t?.purchases ?? 0) + (pnl?.expenses ?? 0)) / 7;
    return months.map((m, idx) => ({
      month: m,
      in: Math.round(baseIn * (0.8 + idx * 0.05)),
      out: Math.round(baseOut * (0.85 + (idx % 3) * 0.08)),
    }));
  }, [perf?.sales, t?.purchases, pnl?.expenses]);

  // Needs Attention Counts (6 status items)
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
      posCashUp: needsCashUp ? 1 : 0,
      pendingApprovals: 0,
      syncIssues: 0,
    };
  }, [s.products, s.customers, s.suppliers, s.cash]);

  // Actionable Overdue & Business Alerts
  const alerts = useMemo(() => {
    const list: {
      id: string;
      title: string;
      subtitle: string;
      amount?: number;
      badge: string;
      tone: "bad" | "warn";
      link: string;
      actionLabel: string;
    }[] = [];

    // 1. Customers who haven't paid (overdue debtors)
    const debtors = (s.customers || [])
      .filter((c) => (c?.balance || 0) > 0)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    for (const debtor of debtors.slice(0, 3)) {
      list.push({
        id: `cust-${debtor.id}`,
        title: debtor.name || tr("Customer"),
        subtitle: debtor.phone ? `${debtor.phone} · ${tr("Unpaid debt")}` : tr("Unpaid customer credit balance"),
        amount: debtor.balance,
        badge: tr("Overdue Debt"),
        tone: "bad",
        link: "/contacts",
        actionLabel: tr("Remind"),
      });
    }

    // 2. Unpaid supplier purchases/payables
    const creditors = (s.suppliers || [])
      .filter((sup) => (sup?.balance || 0) > 0)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    for (const creditor of creditors.slice(0, 2)) {
      list.push({
        id: `sup-${creditor.id}`,
        title: creditor.name || tr("Supplier"),
        subtitle: tr("Outstanding supplier payable"),
        amount: creditor.balance,
        badge: tr("To Pay"),
        tone: "warn",
        link: "/purchases",
        actionLabel: tr("Pay Bill"),
      });
    }

    // 3. Out of stock / critical items
    const stockAlerts = (s.products || [])
      .filter((p) => {
        const q = typeof p?.qty === "number" ? p.qty : 0;
        return q <= 0;
      })
      .slice(0, 2);

    for (const item of stockAlerts) {
      list.push({
        id: `stock-${item.id}`,
        title: item.name || tr("Product"),
        subtitle: tr("0 units available in stock"),
        badge: tr("Out of Stock"),
        tone: "bad",
        link: "/inventory",
        actionLabel: tr("Restock"),
      });
    }

    // 4. POS Cash-up reminder if > 24 hours
    const cash = s.cash || [];
    const lastCashUp = cash[0]?.at ? new Date(cash[0].at).getTime() : 0;
    if (Date.now() - lastCashUp > 86400000) {
      list.push({
        id: "cash-up-needed",
        title: tr("Daily POS Cash-Up"),
        subtitle: tr("Register cash count has not been performed today"),
        badge: tr("Pending Cash-Up"),
        tone: "warn",
        link: "/pos",
        actionLabel: tr("Cash Up"),
      });
    }

    return list;
  }, [s.customers, s.suppliers, s.products, s.cash, tr]);

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

  // Label renderer inside Money Position slice
  const renderMoneyPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (moneyPosition.total <= 0 || !percent || percent < 0.08) return null;
    const radius = Number(innerRadius || 0) + (Number(outerRadius || 0) - Number(innerRadius || 0)) * 0.52;
    const x = Number(cx || 0) + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = Number(cy || 0) + radius * Math.sin(-midAngle * (Math.PI / 180));
    const pct = Math.round(percent * 100);
    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none select-none"
        style={{
          fontSize: "7.5px",
          fontWeight: 800,
          fill: "#ffffff",
          filter: "drop-shadow(0px 1px 1.5px rgba(0,0,0,0.9))",
        }}
      >
        {`${pct}%`}
      </text>
    );
  };

  // Label renderer inside Receivables vs Payables slice
  const renderRecPayPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (recPayDonut.total <= 0 || !percent || percent < 0.1) return null;
    const radius = Number(innerRadius || 0) + (Number(outerRadius || 0) - Number(innerRadius || 0)) * 0.52;
    const x = Number(cx || 0) + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = Number(cy || 0) + radius * Math.sin(-midAngle * (Math.PI / 180));
    const pct = Math.round(percent * 100);
    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none select-none"
        style={{
          fontSize: "7.5px",
          fontWeight: 800,
          fill: "#ffffff",
          filter: "drop-shadow(0px 1px 1.5px rgba(0,0,0,0.9))",
        }}
      >
        {`${pct}%`}
      </text>
    );
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground pb-16 font-sans select-none antialiased">
      {/* 1. TOP UNIFIED COMPACT HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 dark:border-white/10 bg-background/85 dark:bg-slate-950/85 backdrop-blur-xl px-2 sm:px-4 py-1.5 transition-all">
        <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-7xl mx-auto">
          {/* Left Elements: Back to Apps + Connection Status */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/apps"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 dark:border-white/10 bg-card dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all"
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

          {/* Right Elements: Calendar Popover + ZA Avatar Menu */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Calendar Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                className="flex items-center gap-1 rounded-lg border border-border/60 dark:border-white/10 bg-card dark:bg-white/5 px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted dark:hover:bg-white/10 shadow-xs transition-all"
              >
                <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="hidden sm:inline font-mono text-[11px]">{dateRangeLabel}</span>
              </button>

              {showCalendarPopover && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-2 shadow-xl">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/60 text-xs font-bold text-foreground">
                    <span>{tr("Date Range")}</span>
                    <button
                      type="button"
                      onClick={() => setShowCalendarPopover(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {[
                      { label: tr("Today"), val: 0 },
                      { label: tr("Yesterday"), val: 1 },
                      { label: tr("Last 7 Days"), val: 7 },
                      { label: tr("Last 30 Days"), val: 30 },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => {
                          setDateRangeOffset(opt.val);
                          setShowCalendarPopover(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors",
                          dateRangeOffset === opt.val
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted text-foreground",
                        )}
                      >
                        <span>{opt.label}</span>
                        {dateRangeOffset === opt.val && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar & Drawer Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShopMenu(!showShopMenu)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 dark:bg-primary/30 border border-primary/40 text-primary hover:bg-primary/30 text-xs font-black shadow-xs transition-all"
                title={account?.shopName || "Profile"}
              >
                {shopInitials}
              </button>

              {showShopMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-2 shadow-2xl space-y-1">
                  <div className="px-2 py-1 border-b border-border/60 mb-1">
                    <div className="text-xs font-bold text-foreground truncate">{account?.shopName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{account?.email || "owner"}</div>
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
                    <span>{tr("Manage & Settings")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowShopMenu(false);
                      navigate({ to: "/plans" });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted dark:hover:bg-white/10"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span>{tr("Subscription & Billing")}</span>
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
          <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 p-2 sm:px-3 sm:py-2.5 shadow-xs">
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

        {/* 3. FIVE KPI CARDS (Always in one strict horizontal row) */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {/* 1. Sales */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground truncate">{tr("Sales")}</span>
              <ShoppingCart className="h-3 w-3 text-emerald-500 shrink-0" />
            </div>
            <div className="my-0.5">
              <Amt value={perf?.sales ?? 0} tone="good" size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-bold text-emerald-500">
              <TrendingUp className="h-2.5 w-2.5 shrink-0" />
              <span>12%</span>
            </div>
          </div>

          {/* 2. Purchases */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Purchases")}
              </span>
              <Package className="h-3 w-3 text-blue-500 shrink-0" />
            </div>
            <div className="my-0.5">
              <Amt value={t?.purchases ?? 0} size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-bold text-blue-500">
              <TrendingUp className="h-2.5 w-2.5 shrink-0" />
              <span>8%</span>
            </div>
          </div>

          {/* 3. Expenses */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Expenses")}
              </span>
              <Receipt className="h-3 w-3 text-rose-500 shrink-0" />
            </div>
            <div className="my-0.5">
              <Amt value={pnl?.expenses ?? 0} tone="bad" size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-bold text-rose-500">
              <TrendingDown className="h-2.5 w-2.5 shrink-0" />
              <span>3%</span>
            </div>
          </div>

          {/* 4. Profit */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground truncate">{tr("Profit")}</span>
              <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
            </div>
            <div className="my-0.5">
              <Amt value={netProfit} tone="good" size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-bold text-emerald-500">
              <TrendingUp className="h-2.5 w-2.5 shrink-0" />
              <span>18%</span>
            </div>
          </div>

          {/* 5. Stock Value */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1.5 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Stock Value")}
              </span>
              <Building2 className="h-3 w-3 text-amber-500 shrink-0" />
            </div>
            <div className="my-0.5">
              <Amt value={pos?.stock ?? 0} size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-bold text-muted-foreground">
              <span>{s.products?.length || 0} items</span>
            </div>
          </div>
        </div>

        {/* 4. THE FOUR FINANCIAL CHARTS (2x2 on Mobile/Tablet, 1 Horizontal Row on Big Screens lg:1024px+) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
          {/* Chart 1: Money Position (Donut + Account Balances) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money Position")}</span>
              <Link to="/float" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
              </Link>
            </div>

            <div className="flex items-center gap-1 my-auto py-1">
              {/* Donut Chart */}
              <div className="h-24 sm:h-28 w-1/2 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={
                        moneyPosition.total > 0
                          ? moneyPosition.items
                          : [{ name: "Zero", value: 1, raw: 0, color: "var(--border)" }]
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="50%"
                      outerRadius="80%"
                      stroke="none"
                      labelLine={false}
                      label={renderMoneyPieLabel}
                    >
                      {moneyPosition.total > 0 ? (
                        moneyPosition.items.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} stroke="none" />
                        ))
                      ) : (
                        <Cell fill="currentColor" className="text-muted/30" stroke="none" />
                      )}
                    </Pie>
                    <Tooltip content={<ChartTooltip money={money} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-0.5">
                  <span className="text-[6.5px] font-bold uppercase text-muted-foreground">
                    {account.currency || "KSh"}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-mono font-black text-foreground truncate max-w-[85%]">
                    {compactFmt(moneyPosition.total)}
                  </span>
                </div>
              </div>

              {/* Account Breakdown List */}
              <div className="flex flex-col justify-center gap-1 w-1/2 min-w-0 pl-1">
                {moneyPosition.items.map((item) => {
                  const pct = moneyPosition.total > 0 ? Math.round((item.value / moneyPosition.total) * 100) : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between text-[8px] sm:text-[9.5px]">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground truncate">{item.name}</span>
                        <span className="text-muted-foreground/70 font-mono text-[7px]">{pct}%</span>
                      </div>
                      <span className="font-mono font-bold text-foreground shrink-0">{compactFmt(item.raw)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases Trend */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Sales vs Purchases")}
              </span>
              <Link to="/reports" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View Details")}
              </Link>
            </div>

            <div className="h-24 sm:h-28 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendSeries} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={7.5}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={7.5}
                    tickFormatter={(v) => compactFmt(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Line type="monotone" dataKey="sales" name="Sales" stroke="#3B82F6" strokeWidth={2} dot={false} />
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

            <div className="flex items-center justify-center gap-3 pt-1 border-t border-border/40 dark:border-white/10 text-[8px] font-bold">
              <span className="text-blue-500">● {tr("Sales")}</span>
              <span className="text-rose-500">● {tr("Purchases")}</span>
            </div>
          </div>

          {/* Chart 3: Receivables vs Payables (Pie / Donut Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Receivables vs Payables")}
              </span>
              <Link to="/contacts" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View Details")}
              </Link>
            </div>

            <div className="flex items-center gap-1 my-auto py-1">
              {/* Donut Chart */}
              <div className="h-24 sm:h-28 w-1/2 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={
                        recPayDonut.total > 0
                          ? recPayDonut.items
                          : [{ name: "Zero", value: 1, raw: 0, color: "var(--border)" }]
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="50%"
                      outerRadius="80%"
                      stroke="none"
                      labelLine={false}
                      label={renderRecPayPieLabel}
                    >
                      {recPayDonut.total > 0 ? (
                        recPayDonut.items.map((entry, idx) => (
                          <Cell key={`recpay-cell-${idx}`} fill={entry.color} stroke="none" />
                        ))
                      ) : (
                        <Cell fill="currentColor" className="text-muted/30" stroke="none" />
                      )}
                    </Pie>
                    <Tooltip content={<ChartTooltip money={money} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-0.5">
                  <span className="text-[6.5px] font-bold uppercase text-muted-foreground">
                    {account.currency || "KSh"}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-mono font-black text-foreground truncate max-w-[85%]">
                    {compactFmt(recPayDonut.total)}
                  </span>
                </div>
              </div>

              {/* Breakdown List */}
              <div className="flex flex-col justify-center gap-1.5 w-1/2 min-w-0 pl-1">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between text-[8px] sm:text-[9.5px]">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-muted-foreground truncate">{tr("Receivables")}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-500 shrink-0">{compactFmt(recPayDonut.rec)}</span>
                  </div>
                  <span className="text-[7px] text-muted-foreground/70 pl-2.5 font-medium">{tr("To Receive")}</span>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center justify-between text-[8px] sm:text-[9.5px]">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-muted-foreground truncate">{tr("Payables")}</span>
                    </div>
                    <span className="font-mono font-bold text-amber-500 shrink-0">{compactFmt(recPayDonut.pay)}</span>
                  </div>
                  <span className="text-[7px] text-muted-foreground/70 pl-2.5 font-medium">{tr("To Pay")}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1 border-t border-border/40 dark:border-white/10 text-[8px] font-bold">
              <span className="text-emerald-500">● {tr("To Receive")}</span>
              <span className="text-amber-500">● {tr("To Pay")}</span>
            </div>
          </div>

          {/* Chart 4: Money In vs Out (Grouped Bar Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money In vs Out")}</span>
              <Link to="/reports" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View Details")}
              </Link>
            </div>

            <div className="h-24 sm:h-28 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moneyInOutSeries} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={7.5}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={7.5}
                    tickFormatter={(v) => compactFmt(v)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip money={money} />} />
                  <Bar dataKey="in" name="Money In" fill="#10B981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="out" name="Money Out" fill="#EF4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1 border-t border-border/40 dark:border-white/10 text-[8px] font-bold">
              <span className="text-emerald-500">■ {tr("Money In")}</span>
              <span className="text-rose-500">■ {tr("Money Out")}</span>
            </div>
          </div>
        </div>

        {/* 5. NEEDS ATTENTION (Strictly One Horizontal Row with Amounts for Receivables & Payables) */}
        <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-foreground">{tr("Needs Attention")}</span>
            <Link to="/reports" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
              {tr("View All")}
            </Link>
          </div>

          <div className="grid grid-cols-6 gap-1 sm:gap-1.5 overflow-x-auto pb-0.5">
            {/* 1. Low Stock */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 min-w-[105px]">
              <div className="flex items-center gap-1">
                <span className="text-orange-500 text-xs">🛡️</span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                  {tr("Low Stock")}
                </span>
              </div>
              <span className="text-xs font-mono font-black text-orange-500">{attention.lowStock}</span>
            </div>

            {/* 2. Receivables with Amount */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 min-w-[110px]">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-emerald-500 text-xs shrink-0">👤</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                    {tr("Receivables")}
                  </span>
                  <span className="text-[7.5px] text-muted-foreground font-mono truncate">
                    {attention.receivables} {attention.receivables === 1 ? tr("debtor") : tr("debtors")}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-black text-emerald-500 shrink-0">
                {compactFmt(creditDebt.receivables)}
              </span>
            </div>

            {/* 3. Payables with Amount */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 min-w-[110px]">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-rose-500 text-xs shrink-0">🔒</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                    {tr("Payables")}
                  </span>
                  <span className="text-[7.5px] text-muted-foreground font-mono truncate">
                    {attention.payables} {attention.payables === 1 ? tr("bill") : tr("bills")}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-black text-rose-500 shrink-0">
                {compactFmt(creditDebt.payables)}
              </span>
            </div>

            {/* 4. POS Cash-up */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 min-w-[105px]">
              <div className="flex items-center gap-1">
                <span className="text-amber-500 text-xs">💼</span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                  {tr("POS Cash-up")}
                </span>
              </div>
              <span className="text-xs font-mono font-black text-amber-500">{attention.posCashUp}</span>
            </div>

            {/* 5. Pending Approvals */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 min-w-[105px]">
              <div className="flex items-center gap-1">
                <span className="text-blue-500 text-xs">🛡️</span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                  {tr("Pending Approvals")}
                </span>
              </div>
              <span className="text-xs font-mono font-black text-blue-500">{attention.pendingApprovals}</span>
            </div>

            {/* 6. Sync Issues */}
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 min-w-[105px]">
              <div className="flex items-center gap-1">
                <span className="text-rose-500 text-xs">🔄</span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-foreground truncate">
                  {tr("Sync Issues")}
                </span>
              </div>
              <span className="text-xs font-mono font-black text-rose-500">{attention.syncIssues}</span>
            </div>
          </div>
        </div>

        {/* 6. ACTIONABLE OVERDUE & BUSINESS ALERTS (Customers who haven't paid, unpaid supplier bills, stock alerts) */}
        <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-bold text-foreground">{tr("Actionable Business Alerts & Overdue")}</span>
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-muted-foreground">
              {alerts.length} {alerts.length === 1 ? tr("alert") : tr("alerts")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
            {alerts.length === 0 ? (
              <div className="col-span-full py-3 text-center text-xs text-muted-foreground">
                ✓ {tr("No overdue debts, unpaid bills, or critical stock alerts. All clear!")}
              </div>
            ) : (
              alerts.map((al) => (
                <div
                  key={al.id}
                  className={cn(
                    "flex flex-col justify-between p-2 rounded-lg border transition-all text-xs",
                    al.tone === "bad"
                      ? "border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/15"
                      : "border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider",
                        al.tone === "bad" ? "bg-rose-500 text-white" : "bg-amber-500 text-white",
                      )}
                    >
                      {al.badge}
                    </span>
                    {typeof al.amount === "number" && (
                      <span className="font-mono font-black text-[11px] text-foreground">
                        {account.currency || "KSh"} {compactFmt(al.amount)}
                      </span>
                    )}
                  </div>

                  <div className="my-1.5">
                    <div className="font-bold text-foreground truncate text-[11px]">{al.title}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{al.subtitle}</div>
                  </div>

                  <Link
                    to={al.link as any}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors w-full mt-1",
                      al.tone === "bad"
                        ? "bg-rose-600 hover:bg-rose-700 text-white"
                        : "bg-amber-600 hover:bg-amber-700 text-white",
                    )}
                  >
                    <span>{al.actionLabel}</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 7. RECENT ACTIVITY (3 Columns on Desktop, Stacked on Mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5">
          {/* Column 1: Recent Sales */}
          <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground">{tr("Recent Sales")}</span>
              <Link to="/sales" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
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
                      <span className="text-[10px] font-bold text-foreground truncate">{sale.ref || sale.id}</span>
                      <span className="text-[8.5px] text-muted-foreground">
                        {s.customers.find((c) => c.id === sale.customerId)?.name || tr("Walk-in Customer")}
                      </span>
                    </div>
                    <Amt value={sale.total} tone="good" size="xs" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Recent Purchases */}
          <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground">{tr("Recent Purchases")}</span>
              <Link to="/purchases" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
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
                        {s.suppliers.find((x) => x.id === pur.supplierId)?.name || tr("Supplier")}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground">{pur.ref || pur.id}</span>
                    </div>
                    <Amt value={pur.total} tone="bad" size="xs" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Recent Cash Moves */}
          <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground">{tr("Recent Cash Moves")}</span>
              <Link to="/float" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline">
                {tr("View All")}
              </Link>
            </div>

            <div className="divide-y divide-border/30 pt-1">
              {recentMoves.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-muted-foreground">
                  {tr("No cash movements logged")}
                </div>
              ) : (
                recentMoves.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-1.5 px-1">
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
        </div>
      </main>

      {/* 8. FLOATING SHOPBOT BUTTON WITH OFFICIAL ICON */}
      <div className="fixed bottom-3 right-3 z-30">
        <button
          type="button"
          onClick={() => setShowShopBot(true)}
          className="flex items-center gap-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 pl-2 pr-3.5 py-1.5 shadow-xl hover:scale-105 active:scale-95 transition-all font-bold text-xs border border-white/20 dark:border-black/10 backdrop-blur-md"
          aria-label={tr("Ask ShopBot")}
        >
          <img src={chatIcons.light} alt="ShopBot" className="h-5 w-5 rounded-full object-contain dark:hidden" />
          <img src={chatIcons.dark} alt="ShopBot" className="h-5 w-5 rounded-full object-contain hidden dark:block" />
          <span>ShopBot</span>
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
