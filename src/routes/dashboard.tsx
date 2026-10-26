import { clean } from "@/lib/format";
import { ModuleCharts } from "@/components/shopbook/analytics-charts";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Landmark,
  Package,
  Receipt,
  RefreshCw,
  Share2,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import { performance, position } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { METHODS, METHOD_LABEL, type Method, type Sale } from "@/lib/erp";
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
const COLORS: Record<Method, string> = {
  cash: "var(--success, oklch(0.7 0.17 150))",
  mpesa: "var(--primary)",
  bank: "var(--warning, oklch(0.8 0.15 80))",
  credit: "var(--destructive)",
};

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtD = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function range(p: P, custom: [string, string]): [number, number] {
  const now = new Date();
  const t = day(now);
  if (p === "Today") return [t.getTime(), now.getTime()];
  if (p === "This week") {
    const s = new Date(t);
    s.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return [s.getTime(), now.getTime()];
  }
  if (p === "This month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), now.getTime()];
  if (p === "This year") return [new Date(now.getFullYear(), 0, 1).getTime(), now.getTime()];
  const a = custom[0] ? new Date(custom[0] + "T00:00").getTime() : 0;
  const b = custom[1] ? new Date(custom[1] + "T23:59:59").getTime() : now.getTime();
  return [a, b];
}

function compact(_cur: string) {
  return (n: number) => {
    return clean(Math.round(clean(n))).toLocaleString("en-US");
  };
}

function Section({
  title,
  to,
  link,
  children,
  className,
}: {
  title: string;
  to?: string;
  link?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-2.5 sm:p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {to && (
          <Link to={to} className="flex items-center text-[11px] font-semibold text-primary hover:underline">
            {link}
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Box({
  label,
  value,
  tone,
  to,
  icon: Icon,
  color,
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "warn" | "bad" | undefined;
  to?: string;
  icon?: LucideIcon;
  color?: string;
}) {
  const inner = (
    <div
      className={cn(
        "h-full rounded-lg border bg-background/60 p-2 transition-colors",
        tone === "warn"
          ? "border-warning/50 hover:bg-warning/5"
          : tone === "bad"
            ? "border-destructive/50 hover:bg-destructive/5"
            : "border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
          <p className="truncate text-[10px] font-bold uppercase text-foreground/80">{label}</p>
        </div>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[12px] font-bold tabular-nums",
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

function Dashboard() {
  const account = useAccount("basic");
  const s = useErp();
  const { tr, dir } = useLanguage();
  const nav = useNavigate();
  const [p, setP] = useState<P>("This month");
  const [custom, setCustom] = useState<[string, string]>(["", ""]);
  const [menu, setMenu] = useState(false);
  const [pick, setPick] = useState(false);
  const [open, setOpen] = useState<Sale | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const [from, to] = range(p, custom);
  const data = useMemo(() => {
    const perf = performance(s, from, to);
    const t = purchaseTotals(s, from, to);
    const pos = position(s);
    return { perf, t, pos, profit: profitAndLoss(s, from, to).net, bal: floatBalances(s) };
  }, [s, from, to]);

  if (!account) return <main className="app-screen" />;
  const cur = account.currency || "KSh";
  const money = moneyFor(cur);
  const k = compact(cur);
  const { perf, t, pos, profit, bal } = data;
  const byTotal = METHODS.reduce((a, m) => a + perf.byMethod[m], 0);
  const cashVariance = s.cash.find((e) => e.type === "CASH UP");
  const cashUp = pos.cashUpPending
    ? "Pending"
    : cashVariance &&
        cashVariance.counted !== undefined &&
        cashVariance.expected !== undefined &&
        cashVariance.counted !== cashVariance.expected
      ? "Variance"
      : "Done";

  const rows: [string, string | number][] = [
    ["Period", `${fmtD(from || to)} - ${fmtD(to)}`],
    ["Sales", perf.sales],
    ["Purchases", t.purchases],
    ["Expenses", t.expenses],
    ["Profit", profit],
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
    <main dir={dir} className="app-screen flex min-h-screen w-full flex-col bg-background pb-10 text-foreground">
      {/* 1. UNIFIED 5-ELEMENT SINGLE-ROW RESPONSIVE HEADER */}
      <header className="sticky top-0 z-30 flex h-12 w-full items-center justify-between border-b border-border bg-background/95 px-2.5 sm:px-4 md:px-6 backdrop-blur">
        {/* Left Side: Element 1 (< Dashboard) + Element 2 (Connection Status) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {/* Element 1: < Dashboard */}
          <button
            type="button"
            aria-label={tr("Dashboard")}
            onClick={() => nav({ to: "/apps" })}
            className="group flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" />
            <span className="tracking-tight">{tr("Dashboard")}</span>
          </button>

          {/* Element 2: Connection Status (Live Dot + Wi-Fi) */}
          <ConnectionStatus className="shrink-0 scale-95" />
        </div>

        {/* Center: Element 3 (Dynamic Shop Name) */}
        <div className="flex min-w-0 flex-1 items-center justify-center px-2">
          <p className="max-w-[130px] sm:max-w-[220px] md:max-w-[340px] truncate text-center text-xs sm:text-sm font-extrabold uppercase tracking-wide text-foreground">
            {account.shopName || "SHOPBOOK"}
          </p>
        </div>

        {/* Right Side: Element 4 (Calendar Button) + Element 5 (Shop Logo) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Element 4: Calendar Button */}
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

            {/* Calendar Popover */}
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

          {/* Element 5: Shop Logo (Dropdown Trigger) */}
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

            {/* Shop Actions Dropdown */}
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

      {/* DASHBOARD BODY - AUTO-DETECTS AND FILLS WHOLE SCREEN WIDTH */}
      <div className="flex w-full flex-1 flex-col gap-3 px-2.5 sm:px-4 md:px-6 lg:px-8 pt-2.5">
        <BackupStatus className="px-0 text-[10px]" />

        {/* 1. TOP KPI STRIP (5 Items: Sales, Purchases, Expenses, Profit, Stock Value) */}
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
                <p className="truncate text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tr(l)}
                </p>
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-[11px] sm:text-[13px] md:text-[15px] font-extrabold tabular-nums",
                  tone === "good" && "text-success",
                  tone === "bad" && "text-destructive",
                )}
              >
                {k(v)}
              </p>
            </div>
          ))}
        </div>

        {/* 2. RESPONSIVE CHARTS GRID (Money Position, Sales vs Purchases, etc.) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
          <ModuleCharts s={s} module="financial" from={from} to={to} money={money} tr={tr} single />

          <Section title={tr("Sales by payment method")} to="/reports" link={tr("View details")}>
            <div className="flex items-center gap-4 py-1">
              <div
                className="relative h-20 w-20 shrink-0 rounded-full"
                style={{
                  background: byTotal
                    ? `conic-gradient(${(() => {
                        let acc = 0;
                        return METHODS.map((m) => {
                          const a = acc;
                          acc += (perf.byMethod[m] / byTotal) * 360;
                          return `${COLORS[m]} ${a}deg ${acc}deg`;
                        }).join(", ");
                      })()})`
                    : "var(--muted)",
                }}
              >
                <div className="absolute inset-2.5 grid place-items-center rounded-full bg-card text-center">
                  <div>
                    <p className="text-[12px] font-bold tabular-nums">{k(byTotal)}</p>
                    <p className="text-[8px] text-muted-foreground">{tr("Sales")}</p>
                  </div>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-[11px] sm:text-[12px]">
                {METHODS.map((m) => (
                  <li key={m} className="grid grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLORS[m] }} />
                    <span className="truncate">{tr(METHOD_LABEL[m])}</span>
                    <b className="tabular-nums">{k(perf.byMethod[m])}</b>
                    <span className="text-end tabular-nums text-muted-foreground">
                      {byTotal ? Math.round((perf.byMethod[m] / byTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        </div>

        {/* 3. MONEY POSITION (Cash, M-Pesa, Bank, Credit) */}
        <Section title={tr("Money position")} to="/float" link={tr("View details")}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Box icon={Banknote} color="var(--success)" label={tr("Cash")} value={k(bal.cash)} />
            <Box icon={Smartphone} color="var(--primary)" label={tr("M-Pesa")} value={k(bal.mpesa)} />
            <Box icon={Landmark} color="var(--primary)" label={tr("Bank")} value={k(bal.bank)} />
            <Box icon={Users} color="var(--warning)" label={tr("Credit")} value={k(pos.receivables)} to="/contacts" />
          </div>
        </Section>

        {/* 4. NEEDS ATTENTION (Low Stock, Receivables, Payables, Cash-up) */}
        <Section title={tr("Needs attention")}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Box
              icon={AlertTriangle}
              color="var(--warning)"
              to="/inventory"
              label={tr("Low stock")}
              value={pos.low + pos.out ? `${pos.low + pos.out} Items` : "0"}
              tone={pos.low + pos.out ? "warn" : "good"}
            />
            <Box
              icon={Users}
              color="var(--primary)"
              to="/contacts"
              label={tr("Receivables")}
              value={money(pos.receivables)}
            />
            <Box
              icon={Building2}
              color="var(--warning)"
              to="/contacts"
              label={tr("Payables")}
              value={money(pos.payables)}
              tone={pos.payables > 0 ? "warn" : undefined}
            />
            <Box
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
        </Section>

        {/* 5. RECENT ACTIVITY (Responsive: 1 column on mobile, 3 columns on desktop) */}
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

          {/* Recent Transfers / Audit */}
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
