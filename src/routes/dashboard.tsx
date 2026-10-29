import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
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
          ? "text-[clamp(8px,2.1vw,11px)] sm:text-xs"
          : "text-[clamp(9.5px,2.5vw,12.5px)] sm:text-sm"
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
          ? "text-[6.5px] sm:text-[7.5px]"
          : "text-[7px] sm:text-[8px]"
        : size === "sm"
          ? "text-[8px] sm:text-[9px]"
          : "text-[9px] sm:text-xs";

  return (
    <span className={cn("inline-flex items-baseline gap-0.5 font-bold font-mono tracking-tight", toneClass, className)}>
      <span className={cn("font-medium text-muted-foreground", currSize)}>{curr.toLowerCase()}</span>
      <span className={cn("font-black", numSize)}>{numStr}</span>
    </span>
  );
}

/** Standard Dark/Neon Tooltip for Charts */
function ChartTooltip({ active, payload, label, money }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-2.5 py-1.5 shadow-xl text-[11px] text-popover-foreground z-50">
      {label && <div className="font-bold text-muted-foreground mb-1 text-[10px]">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 font-medium" style={{ color: entry.color || entry.fill }}>
              <span>●</span>
              <span>{entry.name}:</span>
            </span>
            <span className="font-mono font-bold">{money ? money(entry.value) : compactFmt(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const account = useAccount("basic");
  const erpState = useErp();
  const { tr } = useLanguage();
  const navigate = useNavigate();

  const s: ErpState = erpState || empty();
  const money = moneyFor(account?.currency || "KSh");

  const [dateRangeOffset, setDateRangeOffset] = useState<number>(0);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showShopBot, setShowShopBot] = useState(false);
  const [showAttentionDropdown, setShowAttentionDropdown] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const daysLeft = useMemo(() => trialDaysLeft(account), [account]);

  const perf = useMemo(() => performance(s, 0), [s]);
  const pos = useMemo(() => position(s), [s]);
  const pnl = useMemo(() => profitAndLoss(s), [s]);
  const t = useMemo(() => purchaseTotals(s), [s]);
  const fb = useMemo(() => floatBalances(s), [s]);

  const netProfit = useMemo(() => {
    const raw = (perf?.sales ?? 0) - (t?.purchases ?? 0) - (pnl?.expenses ?? 0);
    return raw <= 0 ? 0 : raw;
  }, [perf?.sales, t?.purchases, pnl?.expenses]);

  // Shop Initials for avatar circle
  const shopInitials = useMemo(() => {
    const name = account?.shopName || "Shop";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [account?.shopName]);

  const dateRangeLabel = useMemo(() => {
    if (dateRangeOffset === 0) return tr("Today");
    if (dateRangeOffset === 1) return tr("Yesterday");
    if (dateRangeOffset === 7) return tr("Last 7 Days");
    if (dateRangeOffset === 30) return tr("Last 30 Days");
    return tr("Custom Range");
  }, [dateRangeOffset, tr]);

  // 1. Money Position Chart Data (Solid Pie meeting at center)
  const moneyPositionData = useMemo(() => {
    const cash = Math.max(0, fb?.cash || 0);
    const mpesa = Math.max(0, fb?.mpesa || 0);
    const bank = Math.max(0, fb?.bank || 0);
    const credit = Math.max(0, pos?.receivables || 0);
    const total = cash + mpesa + bank + credit;

    const items = [
      { name: "M-Pesa", value: mpesa, color: "#10B981" },
      { name: "Cash", value: cash, color: "#3B82F6" },
      { name: "Bank", value: bank, color: "#8B5CF6" },
      { name: "Credit", value: credit, color: "#F59E0B" },
    ];

    return {
      items,
      total,
      cash,
      mpesa,
      bank,
      credit,
    };
  }, [fb, pos]);

  // 2. Sales vs Purchases Series Data (Dual Line Chart)
  const chartRange = useMemo(() => {
    const from = new Date();
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    from.setMonth(from.getMonth() - 6);
    return { from: from.getTime(), to: Date.now() };
  }, []);

  const salesPurchasesSeries = useMemo(() => {
    const sales = chartSeries(s, "sales", chartRange, "Monthly");
    const purchases = chartSeries(s, "purchases", chartRange, "Monthly");
    const labels = Array.from(new Set([...sales.map((d) => d.label), ...purchases.map((d) => d.label)]));
    return labels.map((label) => ({
      label,
      sales: Math.max(0, sales.find((d) => d.label === label)?.value ?? 0),
      purchases: Math.max(0, purchases.find((d) => d.label === label)?.value ?? 0),
    }));
  }, [s, chartRange]);

  // 3. Money In vs Out Data (Monthly Grouped Bar Chart)
  const moneyInOutSeries = useMemo(
    () =>
      chartSeries(s, "float", chartRange, "Monthly")
        .slice(-6)
        .map((d) => ({
          month: d.label,
          in: Math.max(0, d.value),
          out: Math.max(0, d.secondary ?? 0),
        })),
    [s, chartRange],
  );

  // 4. Receivables vs Payables Breakdown (Solid Pie meeting at center)
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

  const recPayDonut = useMemo(() => {
    const rec = creditDebt.receivables;
    const pay = creditDebt.payables;
    const total = rec + pay;
    const items = [
      { name: tr("Receivables"), value: rec, color: "#10B981", sub: tr("To Receive") },
      { name: tr("Payables"), value: pay, color: "#F59E0B", sub: tr("To Pay") },
    ];
    return {
      items,
      total,
      rec,
      pay,
    };
  }, [creditDebt, tr]);

  // Needs Attention Counts
  const attention = useMemo(() => {
    const lowStock = (s.products || []).filter((p) => p.qty > 0 && p.qty <= (p.minStock ?? 5)).length;
    const debtors = (s.customers || []).filter((c) => c.balance > 0).length;
    const bills = (s.suppliers || []).filter((sup) => sup.balance > 0).length;
    return {
      lowStock,
      receivables: debtors,
      payables: bills,
      debtors,
      bills,
      posCashUp: pos.cashUpPending ? tr("Pending") : tr("Done"),
      cashUpPending: pos.cashUpPending,
      pendingApprovals: 0,
      syncIssues: 0,
    };
  }, [s.products, s.customers, s.suppliers, pos.cashUpPending, tr]);

  // Actionable Overdue & Business Alerts
  const alerts = useMemo(() => {
    const list: {
      id: string;
      title: string;
      subtitle: string;
      amount?: number;
      tone: "warn" | "bad";
      link: string;
      actionLabel: string;
      badge: string;
    }[] = [];

    // Overdue debtors
    (s.customers || []).forEach((c) => {
      if (c.balance && c.balance > 0) {
        list.push({
          id: `cust-${c.id}`,
          title: c.name,
          subtitle: tr("Unpaid balance owed by customer"),
          amount: c.balance,
          tone: "bad",
          link: "/contacts",
          actionLabel: tr("Collect Payment"),
          badge: tr("Customer Debt"),
        });
      }
    });

    // Unpaid suppliers
    (s.suppliers || []).forEach((sup) => {
      if (sup.balance && sup.balance > 0) {
        list.push({
          id: `sup-${sup.id}`,
          title: sup.name,
          subtitle: tr("Outstanding bill owed to supplier"),
          amount: sup.balance,
          tone: "warn",
          link: "/purchases",
          actionLabel: tr("Settle Bill"),
          badge: tr("Supplier Bill"),
        });
      }
    });

    // Critical low stock
    (s.products || []).forEach((p) => {
      if (p.qty <= (p.minStock ?? 3)) {
        list.push({
          id: `prod-${p.id}`,
          title: p.name,
          subtitle: p.qty <= 0 ? tr("Out of stock! Customers cannot buy.") : tr("Stock running low!"),
          tone: p.qty <= 0 ? "bad" : "warn",
          link: "/inventory",
          actionLabel: tr("Restock Now"),
          badge: p.qty <= 0 ? tr("Out of Stock") : tr("Low Stock"),
        });
      }
    });

    return list.slice(0, 8);
  }, [s.customers, s.suppliers, s.products, tr]);

  const attentionTotal = useMemo(() => {
    let count = 0;
    if (attention.lowStock > 0) count++;
    if (attention.receivables > 0) count++;
    if (attention.payables > 0) count++;
    if (pos.cashUpPending) count++;
    return count + alerts.length;
  }, [attention, pos.cashUpPending, alerts.length]);

  // Recent Activity Records
  const recentSales = useMemo(() => (s.sales || []).slice(0, 5), [s.sales]);
  const recentPurchases = useMemo(() => (s.purchases || []).slice(0, 5), [s.purchases]);
  const recentMoves = useMemo(() => (s.payments || []).slice(0, 5), [s.payments]);

  // Label renderer inside solid Money Position slice (shows payment type name on slice)
  const renderMoneyPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
    if (moneyPositionData.total <= 0 || !percent || percent < 0.12) return null;
    const radius = Number(outerRadius || 44) * 0.65;
    const x = Number(cx || 0) + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = Number(cy || 0) + radius * Math.sin(-midAngle * (Math.PI / 180));

    return (
      <text
        x={x}
        y={y}
        fill="#FFFFFF"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={7.5}
        fontWeight={800}
        style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}
      >
        {name}
      </text>
    );
  };

  // Label renderer inside solid Receivables vs Payables slice
  const renderRecPayPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
    if (recPayDonut.total <= 0 || !percent || percent < 0.12) return null;
    const radius = Number(outerRadius || 44) * 0.65;
    const x = Number(cx || 0) + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = Number(cy || 0) + radius * Math.sin(-midAngle * (Math.PI / 180));

    return (
      <text
        x={x}
        y={y}
        fill="#FFFFFF"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={7.5}
        fontWeight={800}
        style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}
      >
        {name}
      </text>
    );
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground pb-20 font-sans select-none antialiased">
      {/* 1. TOP UNIFIED COMPACT HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 dark:border-white/10 bg-background/85 dark:bg-slate-950/85 backdrop-blur-xl px-2 sm:px-4 py-2 transition-all">
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

        {/* 3. FIVE KPI CARDS (Compressed, fully legible, no truncation) */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {/* 1. Sales */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Sales")}
              </span>
              <ShoppingCart className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500 shrink-0" />
            </div>
            <div className="my-0.5 truncate">
              <Amt value={perf?.sales ?? 0} tone="good" size="xs" />
            </div>
          </div>

          {/* 2. Purchases */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Purchases")}
              </span>
              <Package className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-500 shrink-0" />
            </div>
            <div className="my-0.5 truncate">
              <Amt value={t?.purchases ?? 0} size="xs" />
            </div>
          </div>

          {/* 3. Expenses */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Expenses")}
              </span>
              <Receipt className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-rose-500 shrink-0" />
            </div>
            <div className="my-0.5 truncate">
              <Amt value={pnl?.expenses ?? 0} tone="bad" size="xs" />
            </div>
          </div>

          {/* 4. Profit */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                {tr("Profit")}
              </span>
              <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500 shrink-0" />
            </div>
            <div className="my-0.5 truncate">
              <Amt value={netProfit} tone="good" size="xs" />
            </div>
          </div>

          {/* 5. Stock Value (Responsive label: Stock on mobile, Stock Value on desktop) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-1 sm:p-2.5 shadow-xs min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[8.5px] sm:text-xs font-semibold text-muted-foreground truncate">
                <span className="sm:hidden">{tr("Stock")}</span>
                <span className="hidden sm:inline">{tr("Stock Value")}</span>
              </span>
              <Building2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-500 shrink-0" />
            </div>
            <div className="my-0.5 truncate">
              <Amt value={pos?.stock ?? 0} size="xs" />
            </div>
            <div className="flex items-center gap-0.5 text-[7.5px] sm:text-[10px] font-bold text-muted-foreground truncate">
              <span>{s.products?.length || 0} items</span>
            </div>
          </div>
        </div>

        {/* 4. THE FOUR FINANCIAL CHARTS (2x2 on Mobile/Tablet, 1 Horizontal Row on Desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
          {/* Chart 1: Money Position (Solid Pie Meeting at Center + Clean Account Balances) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money Position")}</span>
              <Link to="/float" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0">
                {tr("View All")}
              </Link>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 py-1 min-h-[105px]">
              {/* Solid Pie Chart */}
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={moneyPositionData.total > 0 ? moneyPositionData.items : [{ name: "Zero", value: 1 }]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={44}
                      paddingAngle={moneyPositionData.total > 0 ? 1.5 : 0}
                      {...(moneyPositionData.total > 0 ? { label: renderMoneyPieLabel } : {})}
                      labelLine={false}
                    >
                      {moneyPositionData.total > 0 ? (
                        moneyPositionData.items.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                        ))
                      ) : (
                        <Cell fill="var(--border)" opacity={0.3} stroke="transparent" />
                      )}
                    </Pie>
                    <Tooltip content={<ChartTooltip money={money} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Clean Legend Details (No Percentages, Clean Dot + Label + Amount) */}
              <div className="flex flex-col justify-center flex-1 space-y-1.5 min-w-0 pr-0.5">
                {moneyPositionData.items.map((acc) => (
                  <div key={acc.name} className="flex items-center justify-between text-[8px] sm:text-[9.5px]">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                      <span className="text-muted-foreground truncate">{acc.name}</span>
                    </div>
                    <span className="font-mono font-bold text-foreground shrink-0">{compactFmt(acc.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1 border-t border-border/40 dark:border-white/10 text-[7.5px] font-bold flex-wrap">
              <span className="text-emerald-500">● M-Pesa</span>
              <span className="text-blue-500">● Cash</span>
              <span className="text-purple-500">● Bank</span>
              <span className="text-amber-500">● Credit</span>
            </div>
          </div>

          {/* Chart 2: Sales vs Purchases (Dual Line Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Sales vs Purchases")}
              </span>
              <Link to="/reports" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0">
                {tr("View Details")}
              </Link>
            </div>

            <div className="h-24 sm:h-28 w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesPurchasesSeries} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
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
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    name="Purchases"
                    stroke="#F43F5E"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1 border-t border-border/40 dark:border-white/10 text-[8px] font-bold">
              <span className="text-blue-500">● {tr("Sales")}</span>
              <span className="text-rose-500">● {tr("Purchases")}</span>
            </div>
          </div>

          {/* Chart 3: Money In vs Out (Grouped Bar Chart) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">{tr("Money In vs Out")}</span>
              <Link to="/reports" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0">
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

          {/* Chart 4: Receivables vs Payables (Solid Pie Meeting at Center, 4th Diagram) */}
          <div className="flex flex-col rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/40 dark:border-white/10">
              <span className="text-[10px] sm:text-xs font-bold text-foreground truncate">
                {tr("Receivables vs Payables")}
              </span>
              <Link
                to="/contacts"
                className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0"
              >
                {tr("View Details")}
              </Link>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 py-1 min-h-[105px]">
              {/* Solid Pie Chart */}
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={recPayDonut.total > 0 ? recPayDonut.items : [{ name: "Zero", value: 1 }]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={44}
                      paddingAngle={recPayDonut.total > 0 ? 1.5 : 0}
                      {...(recPayDonut.total > 0 ? { label: renderRecPayPieLabel } : {})}
                      labelLine={false}
                    >
                      {recPayDonut.total > 0 ? (
                        recPayDonut.items.map((entry, index) => (
                          <Cell key={`rec-cell-${index}`} fill={entry.color} stroke="transparent" />
                        ))
                      ) : (
                        <Cell fill="var(--border)" opacity={0.3} stroke="transparent" />
                      )}
                    </Pie>
                    <Tooltip content={<ChartTooltip money={money} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Receivables & Payables Legend Details */}
              <div className="flex flex-col justify-center flex-1 space-y-2 min-w-0 pr-0.5">
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
        </div>

        {/* 5. COLLAPSIBLE NEEDS ATTENTION & ACTIONABLE ALERTS (Closed by default, 2 Columns when expanded) */}
        <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowAttentionDropdown(!showAttentionDropdown)}
            className="flex w-full items-center justify-between p-2 sm:p-2.5 hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">{tr("Needs Attention & Alerts")}</span>
              <span className="rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[9px] font-mono font-bold">
                {attentionTotal}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium shrink-0">
              <span>{showAttentionDropdown ? tr("Collapse") : tr("View Details")}</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-200", showAttentionDropdown && "rotate-180")}
              />
            </div>
          </button>

          {showAttentionDropdown && (
            <div className="p-2 sm:p-2.5 pt-0 space-y-2 border-t border-border/40 dark:border-white/10">
              {/* 2-Column Grid for Needs Attention Status */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 pt-2">
                {/* 1. Low Stock */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-orange-500 text-xs shrink-0">🛡️</span>
                    <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
                      {tr("Low Stock")}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-black text-orange-500 shrink-0">{attention.lowStock}</span>
                </div>

                {/* 2. Receivables */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-emerald-500 text-xs shrink-0">👤</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
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

                {/* 3. Payables */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-rose-500 text-xs shrink-0">🔒</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
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
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-amber-500 text-xs shrink-0">💼</span>
                    <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
                      {tr("POS Cash-up")}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-amber-500 shrink-0">{attention.posCashUp}</span>
                </div>

                {/* 5. Pending Approvals */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-blue-500 text-xs shrink-0">🛡️</span>
                    <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
                      {tr("Approvals")}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-black text-blue-500 shrink-0">
                    {attention.pendingApprovals}
                  </span>
                </div>

                {/* 6. Sync Issues */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-emerald-500 text-xs shrink-0">🔄</span>
                    <span className="text-[9.5px] sm:text-[10px] font-semibold text-foreground truncate">
                      {tr("Sync Issues")}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-500 shrink-0">{attention.syncIssues}</span>
                </div>
              </div>

              {/* Actionable Alerts (also rendered in 2 Columns) */}
              <div className="pt-2 border-t border-border/40 dark:border-white/10">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {tr("Specific Alerts & Overdue")} ({alerts.length})
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                              {account?.currency || "KSh"} {compactFmt(al.amount)}
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
            </div>
          )}
        </div>

        {/* 6. RECENT ACTIVITY (3 Columns on Desktop, Stacked on Mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5">
          {/* Column 1: Recent Sales */}
          <div className="rounded-xl border border-border/50 dark:border-white/10 bg-card/75 dark:bg-card/65 backdrop-blur-xl p-2 sm:p-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40 dark:border-white/10">
              <span className="text-xs font-bold text-foreground">{tr("Recent Sales")}</span>
              <Link to="/sales" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0">
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
              <Link
                to="/purchases"
                className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0"
              >
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
              <Link to="/float" className="text-[9px] sm:text-[10px] font-bold text-primary hover:underline shrink-0">
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

      {/* 7. FLOATING SHOPBOT BUTTON (ICON ONLY, NO WHITE PILL/TEXT) */}
      <div className="fixed bottom-3 right-3 z-30">
        <button
          type="button"
          onClick={() => setShowShopBot(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/90 dark:bg-white/10 text-white hover:bg-slate-800 dark:hover:bg-white/20 shadow-2xl hover:scale-105 active:scale-95 transition-all border border-white/20 backdrop-blur-md"
          aria-label={tr("Ask ShopBot")}
        >
          <img src={chatIcons.light} alt="ShopBot" className="h-6 w-6 rounded-full object-contain dark:hidden" />
          <img src={chatIcons.dark} alt="ShopBot" className="h-6 w-6 rounded-full object-contain hidden dark:block" />
        </button>
      </div>

      {/* 8. SHOPBOT LIVE INTERACTIVE ASSISTANT MODAL */}
      <BusinessAssistant
        open={showShopBot}
        onClose={() => setShowShopBot(false)}
        shop={account?.shopName || "Shop"}
        currency={account?.currency || "KSh"}
        icon={chatIcons.light}
      />

      {/* 9. RECEIPT PREVIEW MODAL */}
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
