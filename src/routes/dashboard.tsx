import { createFileRoute, Link, } from "@tanstack/react-router";
import type { ViewSearch } from "@/lib/deep-link";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { KPI_COLOR } from "@/components/shopbook/kpi";
import { Component, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useScreenFit } from "@/lib/fill-screen";
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
import { ERP_KEY } from "@/lib/outbox";
import { cn } from "@/lib/utils";
import { TrialBanner } from "@/components/shopbook/trial-banner";
import { SetupChecklist } from "@/components/shopbook/setup-checklist";
import { ALERT_GO, businessAlerts, dashboardView } from "@/lib/dashboard";
import { cardFigure, toCurrencySymbol } from "@/lib/exact-amount";
import { useSyncStatus } from "@/lib/shop-sync";

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

const PAY_COLOR: Record<string, string> = { cash: "#22c55e", mpesa: "#06b6d4", bank: "#a855f7", credit: "#facc15" };
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
  useScreenFit(screenRef, { min: 1 });
  const s: ErpState = erpState || empty();
  const { tr: translate } = useLanguage();
  // Some short words are stored lower-case in the translation table ("credit", "out"); labels start upper-case.
  const tr = (text: string) => { const t = translate(text); return t.charAt(0).toUpperCase() + t.slice(1); };
  const sync = useSyncStatus();

  // The working period, chosen from the header calendar; starts on Today.
  const per = usePeriod("Today", false);

  // State drawers & modals
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

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
  if (!account) return <div ref={screenRef} role="status" className="dashboard-screen dash-loading min-h-screen w-full bg-background">{tr("Loading records…")}</div>;

  // An employee's device gets its records from the server: until the first copy arrives, empty is not the same as zero.
  const staff = store.get()?.staff;
  const summaryText = () => dailySummary(erpState, { business: account?.shopName ?? "", money, tr });
  const loading = !!staff && localStorage.getItem(ERP_KEY) === null;
  const periodName = per.period === "Custom" ? `${dayLabel(dateWindow.from)} – ${dayLabel(dateWindow.to)}` : tr(per.period ?? "All time");
  const chartFailed = tr("This chart could not be drawn. Your records are not affected.");

  const k = v.kpis;
  const trendChip = (pct: number | null, goodWhenUp: boolean) =>
    pct === null ? null : (
      <span className={cn("dash-chip", pct >= 0 === goodWhenUp ? "is-good" : "is-bad")}>
        {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}%
      </span>
    );
  const kpiCards: { go: Go; label: string; qualifier?: string; define?: string; icon: LucideIcon; color: string; value: number; chip: ReactNode }[] = [
    { go: GO.sales, label: tr("Sales"), icon: ShoppingCart, color: KPI_COLOR.good, value: k.sales, chip: trendChip(k.salesChange, true) },
    { go: GO.purchases, label: tr("Purchases"), icon: ShoppingBasket, color: KPI_COLOR.info, value: k.purchases, chip: trendChip(k.purchasesChange, false) },
    { go: GO.expenses, label: tr("Expenses"), icon: Receipt, color: KPI_COLOR.bad, value: k.expenses, chip: trendChip(k.expensesChange, false) },
    {
      go: GO.profit, label: tr("Profit"), qualifier: tr("After expenses"), define: tr("Sales minus cost of goods sold and expenses for this period. Payroll and stock adjustments are not deducted. Margin is this profit divided by sales."), icon: TrendingUp, color: KPI_COLOR.profit, value: k.profit,
      chip: k.margin === null ? null : <span className={cn("dash-chip", k.margin >= 0 ? "is-good" : "is-bad")}>{tr("Margin")} {k.margin}%</span>,
    },
    { go: GO.stockValue, label: tr("Stock Value"), qualifier: tr("At cost"), define: tr("Current stock quantity multiplied by each product's buying price. A balance right now, not period activity."), icon: Boxes, color: KPI_COLOR.warn, value: v.stockValue, chip: <span className="dash-chip">{tr("Now")}</span> },
  ];
  // Four indicators, two by two. POS cash-up and sync problems surface in Actionable Alerts when they need attention.
  const attention: { go: Go; label: string; icon: LucideIcon; color: string; value: string; exact?: string; state: "ok" | "warn" | "bad" }[] = [
    { go: GO.lowStock, label: tr("Low Stock"), icon: PackageOpen, color: KPI_COLOR.warn, value: `${v.lowStock} ${tr("items")}`, state: v.lowStock > 0 ? "warn" : "ok" },
    { go: GO.receivables, label: tr("Receivables"), icon: Users, color: KPI_COLOR.good, value: `${cur} ${compactFmt(v.receivables.amount)}`, exact: exactFmt(cur, v.receivables.amount), state: v.receivables.amount > 0 ? "warn" : "ok" },
    { go: GO.payables, label: tr("Payables"), icon: Building2, color: KPI_COLOR.bad, value: `${cur} ${compactFmt(v.payables.amount)}`, exact: exactFmt(cur, v.payables.amount), state: v.payables.amount > 0 ? "bad" : "ok" },
    // No approval workflow exists yet, so nothing can be pending.
    { go: GO.settings, label: tr("Approvals"), icon: CheckSquare, color: KPI_COLOR.profit, value: `0 ${tr("Pending")}`, state: "ok" },
  ];
  // Each payment method by the business's own name; Credit is what is still owed, so it reads "Unpaid (credit)" in its own last row.
  const payRows = v.payments.map((p) => ({ ...p, name: p.method === "credit" ? tr("Unpaid (credit)") : methodLabel(p.method, s, tr), color: payColor(p.method, s) }));
  const saleWho = (sale: Sale) =>
    s.customers.find((c) => c.id === sale.customerId)?.name ??
    payLines(s, sale.pay).map(([m]) => (m === "credit" ? tr("Credit") : methodLabel(m, s, tr))).join(" + ");

  return (
    <div ref={screenRef} className="dashboard-screen relative min-h-screen w-full text-foreground pb-20 font-sans select-none antialiased bg-background bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.08),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.05),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.10),transparent_70%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(16,185,129,0.07),transparent_70%)] bg-fixed">
      {/* 1. HEADER: the one shared application header; the Dashboard adds its period picker */}
      <header className="sticky top-0 z-40">
        <GlobalApplicationHeader
          title="Dashboard"
          shop={account.shopName || ""}
          period={per}
        />
      </header>

      <main className="dash-main">
        {/* 2. TRIAL: days left, YOUR FREE TRIAL centred across the strip, Explore plans. Paid accounts have no strip. */}
        {account.plan === "trial" && (
          <div className="dash-strip is-trial">
            <TrialBanner
              days={daysLeft}
              className="rounded-xl border-2 border-amber-400/70 bg-amber-500/10 dark:bg-amber-500/15 backdrop-blur-xl shadow-[0_0_14px_rgba(245,158,11,0.25)]"
            />
          </div>
        )}

        <SetupChecklist />

        {/* 3. FIVE KPI CARDS: always one row, same order on every screen */}
        <div className="dash-kpis">
          {kpiCards.map((c) => (
            <Link key={c.label} to={c.go.to} search={c.go.search} className="dash-kpi" style={tone(c.color)}>
              <span className="dash-kpi-icon"><c.icon /></span>
              <span className="dash-kpi-body">
                <span className="dash-kpi-label" data-exact={c.define}>{c.label}{c.qualifier && <small className="dash-kpi-qualifier"> {c.qualifier}</small>}</span>
                <Money value={c.value} curr={cur} className={cn("dash-kpi-value", c.value < 0 && "is-negative")} />
                {c.chip}
              </span>
            </Link>
          ))}
        </div>

        {/* 4–6. Working Balance · Sales by Payment Method · Needs Attention: one row on wide screens;
            on tablets and phones the first two share a row with Needs Attention below them. */}
        <div className="dash-grid">
          <Link to="/float" className="dash-fin dash-working dash-area-wb" style={tone("#22c55e")}>
            <span className="dash-wb-body">
              <span className="dash-wb-head">
                <span className="dash-panel-title"><Wallet className="dash-panel-icon" />{tr("Working Balance")}</span>
                <Money value={v.working.total} curr={cur} className="dash-fin-value" />
                <small data-exact={v.working.accounts.map((a) => (a.method.startsWith("acct-") ? a.name : tr(a.name))).join(" + ")}>{tr("Available business funds")}</small>
              </span>
              <span className="dash-wb-list">
                {v.working.accounts.map(({ method, name, amount }) => {
                  const Icon = ACCOUNT_ICON[method] ?? WalletCards;
                  return (
                    <span key={method} className="dash-wb-row">
                      <Icon />
                      <span>{method.startsWith("acct-") ? name : tr(name)}</span>
                      <Money value={amount} curr={cur} />
                    </span>
                  );
                })}
                {/* What customers owe (the same figure as the Receivables card): shown apart, never part of the total above. */}
                <span className="dash-wb-row dash-wb-owed">
                  <CreditCard />
                  <span>{tr("Receivables")}</span>
                  <Money value={v.receivables.amount} curr={cur} />
                  <small className="dash-wb-note">{tr("Owed by customers, not included")}</small>
                </span>
              </span>
            </span>
          </Link>

          <Panel title={tr("Sales by Payment Method")} icon={Coins} go={GO.payMethods} className="dash-pay dash-area-pay">
            <p role={loading ? "status" : undefined} className="dash-range">{loading ? tr("Loading records…") : periodName}</p>
            <div className="dash-pay-body">
              <div className={cn("dash-donut", v.payTotal <= 0 && "is-empty")}>
                {/* No sales: a plain ring, never invented shares. Real shares only when there are real sales. */}
                {v.payTotal > 0 ? (
                <ChartGuard message={chartFailed}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<PayTip curr={cur} />} />
                    <Pie
                      data={payRows.filter((p) => p.amount > 0)}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="98%"
                      paddingAngle={0}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {payRows.filter((p) => p.amount > 0).map((p) => (
                        <Cell key={p.method} fill={p.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                </ChartGuard>
                ) : <span className="dash-donut-ring" aria-hidden="true" />}
                <div className="dash-donut-center">
                  {loading ? (
                    <small role="status">{tr("Loading records…")}</small>
                  ) : (
                    <>
                      <small>{v.payTotal > 0 ? tr("Total Sales") : tr(per.period === "Today" ? "No sales today" : "No sales for this period")}</small>
                      <b data-exact={exactFmt(cur, v.payTotal)}>{cur} {compactFmt(v.payTotal)}</b>
                    </>
                  )}
                </div>
              </div>
              {/* Narrow phones: the money fitter shrinks the whole table so every digit and % stays inside the card */}
              <div className="dash-pay-fit" data-fit-text="money">
                <table className="dash-pay-table">
                  <thead>
                    <tr><th>{tr("Payment")}</th><th>{tr("Amount")}</th><th>%</th></tr>
                  </thead>
                  <tbody>
                    {payRows.map((p) => (
                      <tr key={p.method} className={cn(p.method === "credit" && "dash-pay-unpaid")}>
                        <td><i style={tone(p.color)} />{p.name}</td>
                        <td data-exact={exactFmt(cur, p.amount)}>
                          <span className="dash-money-full">{cur} {Math.round(p.amount).toLocaleString()}</span>
                          <span className="dash-money-short">{compactFmt(p.amount)}</span>
                        </td>
                        <td>
                          <span className="dash-money-full">{p.pct}%</span>
                          <span className="dash-money-short">{Math.round(p.pct)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{tr("Total Sales")}</td>
                      <td colSpan={2} data-exact={exactFmt(cur, v.payTotal)}>
                        <span className="dash-money-full">{cur} {Math.round(v.payTotal).toLocaleString()}</span>
                        <span className="dash-money-short">{cur} {compactFmt(v.payTotal)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {v.payTotal - k.sales > 0.005 && (
                <p className="dash-pay-note">
                  {cur} {compactFmt(v.payTotal - k.sales)} {translate("of these sales were later returned")}
                </p>
              )}
            </div>
          </Panel>

          <Panel title={tr("Needs Attention")} icon={AlertTriangle} className="dash-area-att" extra={<span className="dash-muted">{tr("Live Status")}</span>}>
            <div className="dash-attention">
              {attention.map((a) => {
                const inner = (
                  <>
                    <span className="dash-att-icon"><a.icon /></span>
                    <span className="dash-att-text">
                      <span>{a.label}</span>
                      <b className={`is-${a.state}`} data-exact={a.exact}>{a.value}</b>
                    </span>
                  </>
                );
                return <Link key={a.label} to={a.go.to} search={a.go.search} className="dash-att" style={tone(a.color)}>{inner}</Link>;
              })}
            </div>
          </Panel>
        </div>

        {/* 10. ACTIONABLE ALERTS: summary line, expand for every alert */}
        <section className="dash-panel dash-alerts">
          <button type="button" className="dash-alerts-head" onClick={() => setShowAlerts(!showAlerts)} aria-expanded={showAlerts}>
            <Bell className="dash-alerts-bell" />
            <span className="dash-panel-title">{tr("Actionable Alerts")}</span>
            <span className="dash-alerts-count">{actionableAlerts.length}</span>
            <span className="dash-alerts-summary">
              {actionableAlerts.slice(0, 2).map((a) => <span key={a.id}><i className={`is-${a.tone}`} />{a.title}</span>)}
              {!actionableAlerts.length && <span>{tr("No urgent alerts right now")}</span>}
            </span>
            <span className="dash-link">{showAlerts ? tr("Hide") : tr("View All")} <ChevronDown className={cn(showAlerts && "rotate-180")} /></span>
          </button>
          {showAlerts && actionableAlerts.length > 0 && (
            <div className="dash-alerts-list">
              {actionableAlerts.map((a) => (
                <Link key={a.id} to={a.go.to} search={a.go.search} className="dash-alert">
                  <i className={`is-${a.tone}`} />
                  <span>{a.title}</span>
                  <ArrowRight />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 11–13. RECENT SALES · PURCHASES · CASH MOVES */}
        <div className="dash-recent">
          <Panel title={tr("Recent Sales")} icon={ReceiptText} extra={<span className="dash-summary-send">
            {/* Today's summary to the owner (owner, 2026-11-23): sales, payments, cash in the drawer, low stock, by WhatsApp or SMS. */}
            {!staff && <><a className="dash-summary-btn is-wa" href={waLink(summaryText(), account?.phone, account?.country)} target="_blank" rel="noopener" title={tr("Send today's summary to your WhatsApp")} aria-label={tr("Send today's summary to your WhatsApp")}><MessageCircle /></a>
            <a className="dash-summary-btn is-sms" href={smsLink(summaryText(), account?.phone)} title={tr("Send today's summary by SMS")} aria-label={tr("Send today's summary by SMS")}><MessageSquare /></a></>}
            <Link to={GO.sales.to} search={GO.sales.search} className="dash-link">{tr("View All")} <ArrowRight /></Link></span>}>
            <div className="dash-rows">
              {s.sales.slice(0, 4).map((sale) => (
                <button key={sale.id} type="button" className="dash-row" onClick={() => setViewSale(sale)}>
                  <span>{sale.ref}</span>
                  <span title={saleWho(sale)}>{saleWho(sale)}</span>
                  <b data-exact={exactFmt(cur, sale.total)}>{cur} {compactFmt(sale.total)}</b>
                </button>
              ))}
              {!s.sales.length && <Empty text={tr("No sales recorded yet")} action={tr("Record a sale")} to="/pos" />}
            </div>
          </Panel>

          <Panel title={tr("Recent Purchases")} icon={ShoppingBasket} extra={<Link to={GO.purchases.to} search={GO.purchases.search} className="dash-link">{tr("View All")} <ArrowRight /></Link>}>
            <div className="dash-rows">
              {s.purchases.slice(0, 4).map((p) => (
                <Link key={p.id} to="/purchases" className="dash-row">
                  <span>{p.ref}</span>
                  {(() => { const who = s.suppliers.find((x) => x.id === p.supplierId)?.name ?? p.items.map((i) => i.name).join(", "); return <span title={who}>{who}</span>; })()}
                  <b data-exact={exactFmt(cur, p.total)}>{cur} {compactFmt(p.total)}</b>
                </Link>
              ))}
              {!s.purchases.length && <Empty text={tr("No purchases recorded yet")} action={tr("Record a purchase")} to="/purchases" />}
            </div>
          </Panel>

          <Panel title={tr("Recent Cash Moves")} icon={ArrowLeftRight} extra={<Link to="/float" className="dash-link">{tr("View All")} <ArrowRight /></Link>}>
            <div className="dash-rows">
              {v.recentMoves.slice(0, 4).map((m) => (
                <Link key={m.id} to="/float" className="dash-row">
                  <span>{m.ref}</span>
                  <span>{tr(MOVE_LABEL[m.kind] ?? m.kind)} · {tr(m.method)}</span>
                  <b data-exact={`${m.amount < 0 ? "−" : "+"}${exactFmt(cur, Math.abs(m.amount))}`}>
                    <i className={cn("dash-sign", m.amount < 0 ? "is-out" : "is-in")}>{m.amount < 0 ? "−" : "+"}</i>{cur} {compactFmt(Math.abs(m.amount))}
                  </b>
                </Link>
              ))}
              {!v.recentMoves.length && <Empty text={tr("No cash moves yet")} action={tr("Record cash movement")} to="/float" />}
            </div>
          </Panel>
        </div>
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
