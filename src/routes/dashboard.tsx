import { createFileRoute, Link, } from "@tanstack/react-router";
import type { ViewSearch } from "@/lib/deep-link";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { KPI_COLOR } from "@/components/shopbook/kpi";
import { Component, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  WalletCards,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  Coins,
  CreditCard,
  Landmark,
  PackageOpen,
  Receipt,
  ReceiptText,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon,
  MessageCircle, MessageSquare,
} from "lucide-react";
import { dailySummary, smsLink, waLink } from "@/lib/whatsapp";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useShopErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import { usePeriod } from "@/lib/period";
import { methodLabel, namedAccounts, payLines, empty, type Method, type Sale, type ErpState } from "@/lib/erp";
import { store, trialDaysLeft } from "@/lib/shopbook";
import { tillCashier } from "@/lib/till-cashier";
import { ERP_KEY } from "@/lib/outbox";
import { cn } from "@/lib/utils";
import { TrialBanner } from "@/components/shopbook/trial-banner";
import { SetupChecklist } from "@/components/shopbook/setup-checklist";
import { ALERT_GO, businessAlerts, dashboardView } from "@/lib/dashboard";
import { cardFigure, toCurrencySymbol } from "@/lib/exact-amount";
import { useSyncStatus } from "@/lib/shop-sync";
import { AnnouncementTicker, RecentTransactions } from "@/components/shopbook/dash-extras";
import { useFitFont } from "@/lib/fit-font";
import "./dashboard-approved.css";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DataQuill Solutions" },
      { name: "description", content: "Real-time retail business performance overview and analytics." },
      { property: "og:title", content: "Dashboard — DataQuill Solutions" },
      { property: "og:description", content: "Live financial KPIs, trends, and recent store activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});


const compactFmt = cardFigure;
const exactFmt = (curr: string, n: number) => `${curr} ${Math.round(n).toLocaleString()}`;

/** Amount with a small currency symbol. Narrow cards switch to the card form (819,000 / 1.03M) via CSS
 *  and fit-text shrinks the figure until it fits; hover or long-press shows the exact amount. */
function Money({ value, curr, className }: { value: number; curr: string; className?: string }) {
  const exact = exactFmt(curr, value);
  return (
    <span className={cn("dash-money", className)} data-fit-text="money" data-exact={exact} aria-label={exact}>
      <small>{curr}</small>
      <span className="dash-money-full">{Math.round(value).toLocaleString()}</span>
      <span className="dash-money-short">{compactFmt(value)}</span>
    </span>
  );
}

const PAY_COLOR: Record<string, string> = { cash: "#22c55e", mpesa: "#2563eb", bank: "#a855f7", credit: "#facc15" };
/** Named money accounts take these in the order they were added. */
const ACCOUNT_COLORS = ["#f97316", "#ec4899", "#14b8a6", "#84cc16", "#6366f1", "#ef4444", "#0ea5e9"];
const payColor = (m: Method, s: ErpState) => PAY_COLOR[m] ?? ACCOUNT_COLORS[Math.max(0, namedAccounts(s).findIndex((a) => a.id === m)) % ACCOUNT_COLORS.length] ?? "#94a3b8";
const ACCOUNT_ICON = { cash: Banknote, mpesa: Smartphone, bank: Landmark } as Record<string, typeof Banknote>;

/** Hovering a slice: the method, its exact amount and its share. */
function PayTip({ active, payload, curr }: { active?: boolean; payload?: { name?: string; value?: number; payload?: { pct?: number; color?: string } }[]; curr: string }) {
  const p = active ? payload?.[0] : undefined;
  if (!p) return null;
  return (
    <div className="dash-pay-tip">
      <i style={{ background: p.payload?.color }} />
      <span>{p.name}</span>
      <b>{curr} {Math.round(p.value ?? 0).toLocaleString()}</b>
      <span>{p.payload?.pct ?? 0}%</span>
    </div>
  );
}
/** Inside each slice: its method and share, in white; small slices show the share only, so labels never overlap. */
function PieLabel(p: { cx?: number; cy?: number; midAngle?: number; outerRadius?: number; percent?: number; name?: string }) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, name = "" } = p;
  if (percent < 0.03) return null;
  const r = outerRadius * (percent > 0.9 ? 0.05 : 0.56), a = (-midAngle * Math.PI) / 180;
  const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), pct = `${(percent * 100).toFixed(1)}%`, small = percent < 0.12;
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="dash-pie-label">
    {!small && <tspan x={x} dy="-0.55em">{(name.split(" (")[0] ?? name).slice(0, 12)}</tspan>}
    <tspan x={x} dy={small ? 0 : "1.15em"}>{pct}</tspan>
  </text>;
}
/** Working Balance accounts and payment methods listed before Show More. */
const LIST_START = 7;
const tone = (color: string) => ({ "--tone": color }) as CSSProperties;
/** Dashboard card with a title row; `to` makes the title open the detailed screen. */
/** Where each Dashboard figure leads: the app plus the tab (and filter) that lists the records behind it. */
const GO = {
  sales: { to: "/sales", search: { menu: "Sales", sub: "All Sales" } },
  purchases: { to: "/purchases", search: { menu: "Purchases", sub: "All Purchases" } },
  expenses: { to: "/expenses", search: { menu: "Expenses" } },
  profit: { to: "/reports", search: { menu: "Financial", sub: "Profit & Loss" } },
  stockValue: { to: "/reports", search: { menu: "Inventory", sub: "Valuation" } },
  ...ALERT_GO,
  payMethods: { to: "/reports", search: { menu: "Sales", sub: "Payment Methods" } },
  float: { to: "/float", search: {} },
  cashFlow: { to: "/reports", search: { menu: "Financial", sub: "Cash Flow" } },
} satisfies Record<string, { to: string; search: ViewSearch }>;
type Go = (typeof GO)[keyof typeof GO];

function Panel({ title, icon: Icon, go, extra, className, children }: { title: string; icon?: LucideIcon; go?: Go; extra?: ReactNode; className?: string; children: ReactNode }) {
  const label = <>{Icon && <Icon className="dash-panel-icon" />}{title}</>;
  return (
    <section className={cn("dash-panel", className)}>
      <header className="dash-panel-head">
        {go ? <Link to={go.to} search={go.search} className="dash-panel-title">{label}</Link> : <h2 className="dash-panel-title">{label}</h2>}
        {extra}
      </header>
      {children}
    </section>
  );
}

function Empty({ text, action, to }: { text: string; action: string; to: string }) {
  return (
    <div className="dash-empty">
      <span>{text}</span>
      <Link to={to}>{action} <ArrowRight /></Link>
    </div>
  );
}

/** A chart that cannot be drawn says so, instead of looking like no activity or taking the page down with it. */
class ChartGuard extends Component<{ message: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <span role="alert" className="dash-chart-empty">{this.props.message}</span> : this.props.children; }
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const MOVE_LABEL: Record<string, string> = {
  SALE: "Sale receipt", DEBT: "Customer payment", REFUND: "Customer refund", PURCHASE: "Purchase payment",
  "SUPPLIER PAYMENT": "Supplier payment", "SUPPLIER REFUND": "Supplier refund", EXPENSE: "Expense",
  DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", "CASH IN": "Cash in", "CASH OUT": "Cash out",
};

export default function Dashboard() {
  const account = useAccount("basic");
  const erpState = useShopErp();
  // Text keeps its readable size on tablets, laptops and desktops: a page too long for the screen scrolls instead of shrinking.
  const screenRef = useRef<HTMLDivElement>(null);
  // One page on every screen (owner, 2026-11-26): shrinks until nothing in the page needs scrolling; the transactions list scrolls inside.
  // One page on every screen: the text is as large as fits; the transactions list scrolls inside its box (owner, 2026-11-26).
  useFitFont(screenRef, { scroller: ".dash-main", min: 9 });
  const s: ErpState = erpState || empty();
  const { tr: translate } = useLanguage();
  // Some short words are stored lower-case in the translation table ("credit", "out"); labels start upper-case.
  const tr = (text: string) => { const t = translate(text); return t.charAt(0).toUpperCase() + t.slice(1); };
  const sync = useSyncStatus();

  // The working period, chosen from the header calendar; starts on Today.
  const per = usePeriod("This Month", false);

  // State drawers & modals
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  // Working Balance and payment methods show their first seven; Show More lists every one.
  const [wbOpen, setWbOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const cur = toCurrencySymbol(account?.currency || "KSh");
  const money = moneyFor(account?.currency || "KSh");

  const dateWindow = per.range;

  // Every figure below comes from the shared ERP snapshot (read-only).
  const v = useMemo(() => dashboardView(s, dateWindow.from, dateWindow.to), [s, per.period, per.custom]);

  // Real days left in trial
  const daysLeft = useMemo(() => trialDaysLeft(account), [account]);

  // Actionable alerts, from actual records only; the header bell lists the same ones.
  const actionableAlerts = businessAlerts(s, { cur, tr, sync });

  // Like every other app: draw nothing until the signed-in account is known on the device.
  // The server has no device data, so rendering figures here caused a hydration mismatch.
  if (!account) return <div ref={screenRef} data-fitted="" role="status" className="dashboard-screen dash-loading min-h-screen w-full bg-background">{tr("Loading records…")}</div>;

  // An employee's device gets its records from the server: until the first copy arrives, empty is not the same as zero.
  const staff = store.get()?.staff;
  const summaryText = () => dailySummary(erpState, { business: account?.shopName ?? "", money, tr });
  const loading = !!staff && localStorage.getItem(ERP_KEY) === null;
  const periodName = per.period === "Custom" ? `${dayLabel(dateWindow.from)} – ${dayLabel(dateWindow.to)}` : tr(per.period ?? "All time");
  const chartFailed = tr("This chart could not be drawn. Your records are not affected.");

  const k = v.kpis;
  const versus = per.period === "This Month" ? tr("vs last month") : per.period === "Today" ? tr("vs yesterday") : per.period === "This Week" ? tr("vs last week") : per.period === "This Year" ? tr("vs last year") : tr("vs previous period");
  const trendChip = (pct: number | null, goodWhenUp: boolean) =>
    pct === null ? null : (
      <span className={cn("dash-trend", pct >= 0 === goodWhenUp ? "is-good" : "is-bad")}>
        <b>{pct >= 0 ? "↑" : "↓"} {pct >= 0 ? "+" : "-"}{Math.abs(pct)}%</b> <small>{versus}</small>
      </span>
    );
  const kpiCards: { go: Go; label: string; qualifier?: string; define?: string; icon: LucideIcon; color: string; value: number; chip: ReactNode }[] = [
    { go: GO.sales, label: tr("Net Sales"), icon: ShoppingCart, color: KPI_COLOR.good, value: k.sales, chip: trendChip(k.salesChange, true) },
    { go: GO.purchases, label: tr("Purchases"), icon: ShoppingBasket, color: KPI_COLOR.info, value: k.purchases, chip: trendChip(k.purchasesChange, false) },
    { go: GO.expenses, label: tr("Expenses"), icon: Receipt, color: KPI_COLOR.bad, value: k.expenses, chip: trendChip(k.expensesChange, false) },
    {
      go: GO.profit, label: tr("Profit"), qualifier: tr("After expenses"), define: tr("Sales minus cost of goods sold and expenses for this period. Payroll and stock adjustments are not deducted. Margin is this profit divided by sales."), icon: TrendingUp, color: KPI_COLOR.profit, value: k.profit,
      chip: k.margin === null ? null : <span className="dash-margin" aria-label={`${tr("Margin")} ${k.margin}%`}>{tr("Margin")} <b className={k.margin >= 0 ? "is-good" : "is-bad"}>{k.margin}%</b></span>,
    },
    { go: GO.stockValue, label: tr("Stock Value"), qualifier: tr("At cost"), define: tr("Current stock quantity multiplied by each product's buying price. A balance right now, not period activity."), icon: Boxes, color: KPI_COLOR.warn, value: v.stockValue, chip: <span className="dash-now">{tr("Now")}</span> },
  ];
  // Four indicators, two by two. POS cash-up and sync problems surface in Actionable Alerts when they need attention.
  const attention: { go: Go; label: string; icon: LucideIcon; color: string; value: string; exact?: string; state: "ok" | "warn" | "bad" }[] = [
    { go: GO.lowStock, label: tr("Low Stock"), icon: PackageOpen, color: KPI_COLOR.warn, value: `${v.lowStock} ${tr("Items")}`, state: v.lowStock > 0 ? "warn" : "ok" },
    { go: GO.payables, label: tr("Payables"), icon: Building2, color: KPI_COLOR.bad, value: `${cur} ${compactFmt(v.payables.amount)}`, exact: exactFmt(cur, v.payables.amount), state: v.payables.amount > 0 ? "bad" : "ok" },
    { go: GO.receivables, label: tr("Receivables"), icon: Users, color: KPI_COLOR.good, value: `${cur} ${compactFmt(v.receivables.amount)}`, exact: exactFmt(cur, v.receivables.amount), state: v.receivables.amount > 0 ? "warn" : "ok" },
    // No approval workflow exists yet, so nothing can be pending.
    { go: GO.settings, label: tr("Approvals"), icon: CheckSquare, color: KPI_COLOR.profit, value: `0 ${tr("Pending")}`, state: "ok" },
  ];
  // Each payment method by the business's own name; Credit is what is still owed, so it reads "Unpaid (credit)" in its own last row.
  const payRows = v.payments.map((p) => ({ ...p, name: p.method === "credit" ? tr("Credit (Unpaid)") : methodLabel(p.method, s, tr), short: p.method === "credit" ? tr("Credit") : methodLabel(p.method, s, tr), color: payColor(p.method, s) }));
  const methodRows = payRows.filter((p) => p.method !== "credit"), creditRow = payRows.filter((p) => p.method === "credit");
  const shownPayRows = [...(payOpen ? methodRows : methodRows.slice(0, LIST_START)), ...creditRow];
  const pieRows = payRows.filter((p) => p.amount > 0);
  const saleWho = (sale: Sale) =>
    s.customers.find((c) => c.id === sale.customerId)?.name ??
    payLines(s, sale.pay).map(([m]) => (m === "credit" ? tr("Credit") : methodLabel(m, s, tr))).join(" + ");

  return (
    <div ref={screenRef} data-fitted="" className="dashboard-screen relative min-h-screen w-full text-foreground pb-20 font-sans select-none antialiased bg-background bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.08),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.05),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.10),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.07),transparent_70%)] bg-fixed">
      {/* 1. HEADER: the one shared application header; the Dashboard adds its period picker */}
      <header className="sticky top-0 z-40">
        <GlobalApplicationHeader
          title="Dashboard"
          shop={account.shopName || ""}
          period={per}
          pills
        />
      </header>

      <main className="dash-main">
        {/* TRIAL: "You are on a Full ERP Trial" · days left · Explore Plans. Paid accounts have no bar. */}
        {account.plan === "trial" && (
          <div className="dash-strip is-trial">
            <TrialBanner days={daysLeft} variant="dashboard" className="dash-trial" />
          </div>
        )}

        <SetupChecklist />

        {/* FIVE KPI CARDS: one row on every screen; each opens the report behind it */}
        <div className="dash-kpis">
          {kpiCards.map((c) => (
            <Link key={c.label} to={c.go.to} search={c.go.search} className="dash-kpi" style={tone(c.color)} title={c.define}>
              <span className="dash-kpi-top">
                <span className="dash-kpi-icon"><c.icon /></span>
                <span className="dash-kpi-label" data-exact={c.define}>{c.label}</span>
              </span>
              <Money value={c.value} curr={cur} className={cn("dash-kpi-value", c.value < 0 && "is-negative")} />
              {c.chip && <span className="dash-kpi-sub">{c.chip}</span>}
            </Link>
          ))}
        </div>

        {/* WORKING BALANCE | SALES BY PAYMENT METHOD */}
        <div className="dash-grid">
          <section className="dash-panel dash-working dash-area-wb" style={tone("#22c55e")}>
            <header className="dash-panel-head">
              <h2 className="dash-panel-title"><span className="dash-title-icon"><Wallet /></span>{tr("Working Balance")}<Info className="dash-info" aria-label={tr("Available business funds")} /></h2>
              <Link to={GO.float.to} search={GO.float.search} className="dash-pill-btn">{tr("View Details")} <ArrowRight aria-hidden /></Link>
            </header>
            <div className="dash-wb-total">
              <Money value={v.working.total} curr={cur} className="dash-fin-value" />
              <small>{tr("Available business funds")}</small>
            </div>
            <div className="dash-wb-list">
              {(wbOpen ? v.working.accounts : v.working.accounts.slice(0, LIST_START)).map(({ method, name, amount }) => {
                const Icon = ACCOUNT_ICON[method] ?? (/bank/i.test(name) ? Landmark : WalletCards);
                return (
                  <span key={method} className="dash-wb-row">
                    <Icon />
                    <span>{method.startsWith("acct-") ? name : tr(name)}</span>
                    <Money value={amount} curr={cur} />
                  </span>
                );
              })}
              {/* What customers owe: always last, shown apart and never part of the total above. */}
              <span className="dash-wb-row dash-wb-owed">
                <Users />
                <span>{tr("Receivables")}<small className="dash-wb-note">{tr("Owed by customers, not included")}</small></span>
                <Money value={v.receivables.amount} curr={cur} />
              </span>
            </div>
            {v.working.accounts.length > LIST_START && <button type="button" className="dash-more" onClick={() => setWbOpen(!wbOpen)}>{tr(wbOpen ? "Show Less" : "Show More")} {wbOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}</button>}
            <Link to={GO.cashFlow.to} search={GO.cashFlow.search} className="dash-cta">{tr("Cash Flow")} <ArrowRight aria-hidden /></Link>
          </section>

          <section className="dash-panel dash-pay dash-area-pay">
            <header className="dash-panel-head">
              <Link to={GO.payMethods.to} search={GO.payMethods.search} className="dash-panel-title"><span className="dash-title-icon is-blue"><CreditCard /></span>{tr("Sales by Payment Method")}<Info className="dash-info" aria-label={tr("Sales by Payment Method")} /></Link>
              <select className="dash-period-pick" aria-label={tr("Period")} value={per.period ?? "This Month"} onChange={(e) => per.setPeriod(e.target.value as typeof per.period)}>
                {(["Today", "This Week", "This Month", "This Year", "Custom"] as const).map((p) => <option key={p} value={p}>{p === "Custom" ? tr("Custom Range") : tr(p)}</option>)}
              </select>
            </header>
            {per.period === "Custom" && <p className="dash-range">
              <input type="date" value={per.custom[0]} max={per.custom[1]} onChange={(e) => per.setCustom([e.target.value, per.custom[1]])} aria-label={tr("From")} /> – <input type="date" value={per.custom[1]} min={per.custom[0]} onChange={(e) => per.setCustom([per.custom[0], e.target.value])} aria-label={tr("To")} />
            </p>}
            <div className="dash-pay-body">
              <div className={cn("dash-donut dash-pie", v.payTotal <= 0 && "is-empty")}>
                {/* No sales: a plain ring, never invented shares. Real shares only when there are real sales. */}
                {v.payTotal > 0 ? (
                <ChartGuard message={chartFailed}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<PayTip curr={cur} />} />
                    <Pie data={pieRows} dataKey="amount" nameKey="short" innerRadius={0} outerRadius="98%" labelLine={false} label={PieLabel}
                      paddingAngle={0} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                      {pieRows.map((p) => <Cell key={p.method} fill={p.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                </ChartGuard>
                ) : <span className="dash-donut-ring" aria-hidden="true" />}
                {(loading || v.payTotal <= 0) && <div className="dash-donut-center">
                  <small role={loading ? "status" : undefined}>{loading ? tr("Loading records…") : tr(per.period === "Today" ? "No sales today" : "No sales for this period")}</small>
                </div>}
              </div>
              {/* Every method keeps its row, zero included: Payment Method · Amount · Share. Credit is always last. */}
              <div className="dash-pay-fit">
                <table className="dash-pay-table">
                  <thead>
                    <tr><th>{tr("Payment Method")}</th><th>{tr("Amount")}</th><th>{tr("Share")}</th></tr>
                  </thead>
                  <tbody>
                    {shownPayRows.map((p) => (
                      <tr key={p.method} className={cn(p.method === "credit" && "dash-pay-unpaid")}>
                        <td><i style={tone(p.color)} />{p.name}</td>
                        <td data-exact={exactFmt(cur, p.amount)}>{cur} {Math.round(p.amount).toLocaleString()}</td>
                        <td>{Number(p.pct).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {methodRows.length > LIST_START && <button type="button" className="dash-more" onClick={() => setPayOpen(!payOpen)}>{tr(payOpen ? "Show Less" : "Show More")} {payOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}</button>}
              </div>
            </div>
          </section>
        </div>

        {/* NEEDS ATTENTION: four cards, each opens its list; View All opens every alert */}
        <section className="dash-panel dash-needs-row">
          <header className="dash-panel-head">
            <h2 className="dash-panel-title"><AlertTriangle className="dash-panel-icon is-warn" />{tr("Needs Attention")}</h2>
            <button type="button" className="dash-view-all" onClick={() => setShowAlerts(true)}>{tr("View All")} <ArrowRight aria-hidden /></button>
          </header>
          <div className="dash-attention">
            {attention.map((a) => (
              <Link key={a.label} to={a.go.to} search={a.go.search} className="dash-att" style={tone(a.color)}>
                <span className="dash-att-icon"><a.icon /></span>
                <span className="dash-att-text">
                  <span>{a.label}</span>
                  <b className={`is-${a.state}`} data-exact={a.exact}>{a.value}</b>
                </span>
                <ChevronRight className="dash-att-go" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* ANNOUNCEMENTS | ACTIONABLE ALERTS */}
        <div className="dash-news-row">
          <AnnouncementTicker tr={tr} audit={s.audit} canViewActivity={!tillCashier() && (!staff || ((staff.role === "manager" || staff.role === "admin") && staff.permissions.includes("audit.view")))} />
          <section className="dash-panel dash-alerts">
            <button type="button" className="dash-alerts-head" onClick={() => setShowAlerts(!showAlerts)} aria-expanded={showAlerts}>
              <Bell className="dash-alerts-bell" />
              <span className="dash-panel-title">{tr("Actionable Alerts")}</span>
              <span className="dash-alerts-count">{actionableAlerts.length}</span>
              <span className="dash-view-all">{showAlerts ? tr("Hide") : tr("View All")} {showAlerts ? <ChevronUp aria-hidden /> : <ArrowRight aria-hidden />}</span>
            </button>
            {showAlerts && (
              <div className="dash-alerts-list">
                {actionableAlerts.map((a) => (
                  <Link key={a.id} to={a.go.to} search={a.go.search} className="dash-alert">
                    <i className={`is-${a.tone}`} />
                    <span>{a.id === "lowstock" ? tr("Low or out-of-stock products") : a.title}</span>
                    <ArrowRight />
                  </Link>
                ))}
                {!actionableAlerts.length && <p className="dash-alert">{tr("No urgent alerts right now")}</p>}
              </div>
            )}
          </section>
        </div>

        {/* RECENT TRANSACTIONS: laptops two columns of eight, phones and iPads one column of eight */}
        <RecentTransactions s={s} moves={v.allMoves} cur={cur} tr={tr} shop={account.shopName || ""} phone={account.phone} country={account.country} staff={!!staff} summary={summaryText} onSale={setViewSale} />
      </main>

      {/* 14. SHOPBOT: shared floating icon + right-docked panel (same as every app) */}

      {/* Receipt preview for a recent sale */}
      {viewSale && (
        <ReceiptSheet
          sale={viewSale}
          s={s}
          money={money}
          tr={tr}
          shop={account.shopName || "Shop"}
          onClose={() => setViewSale(null)}
        />
      )}
    </div>
  );
}
