import { methodName, moneyMethods, payAmount, type ErpState, type Method } from "@/lib/erp";
import { theftAlerts } from "@/lib/shop-tools";
import { expirySummary } from "@/lib/batches";
import { balanceOf, floatBalances, purchaseTotals, shownAccounts, totalMoney } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { moneyActivity, type MoneyActivity } from "@/lib/money-activity";
import { performance, position } from "@/lib/summary";
import { cardFigure } from "@/lib/exact-amount";
import type { ViewSearch } from "@/lib/deep-link";

/** Read-only summary over the shared ERP records. */
export function dashboardTotals(s: ErpState) {
  const sales = s.sales.reduce((sum, sale) => sum + sale.total, 0)
    - s.returns.reduce((sum, ret) => sum + ret.amount, 0);
  const stock = s.products.reduce((sum, product) => sum + product.qty * product.buy, 0);
  const t = purchaseTotals(s);
  return { sales, purchases: t.purchases, expenses: t.expenses, profit: profitAndLoss(s).net, stock };
}

const DAY = 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** % change against the previous period; null when there is nothing to compare with. */
const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

function periodFigures(s: ErpState, from: number, to: number) {
  const p = performance(s, from, to);
  const t = purchaseTotals(s, from, to);
  const profit = r2(p.grossProfit - t.expenses);
  return { sales: p.sales, purchases: t.purchases, expenses: t.expenses, profit, margin: p.sales > 0 ? Math.round((profit / p.sales) * 1000) / 10 : null };
}

/** Movements that are real money entering or leaving the business: no credit (moneyActivity already
 *  excludes it), no transfers between the shop's own accounts and no opening balances. */
const realMoney = (s: ErpState) => moneyActivity(s).filter((x) => x.kind !== "TRANSFER" && x.kind !== "OPENING");

/** Everything the Dashboard shows, read from the shared ERP snapshot without changing it.
 *  Period figures use [from, to]; balances, stock and debts are the current position. */
export function dashboardView(s: ErpState, from: number, to: number) {
  const len = Math.max(DAY, to - from);
  const cur = periodFigures(s, from, to);
  const prev = periodFigures(s, from - len, from - 1);
  const kpis = {
    ...cur,
    salesChange: change(cur.sales, prev.sales),
    purchasesChange: change(cur.purchases, prev.purchases),
    expensesChange: change(cur.expenses, prev.expenses),
  };

  // Trend charts cover the period, and at least the last 7 days so "Today" still shows a trend.
  const chartFrom = Math.min(startOfDay(from), startOfDay(to) - 6 * DAY);
  const days = Math.ceil((to - chartFrom + 1) / DAY);
  const step = days > 93 ? 30 : days > 31 ? 7 : 1;
  const buckets: { a: number; b: number; label: string }[] = [];
  for (let a = chartFrom; a <= to; a += step * DAY) buckets.push({ a, b: Math.min(to, a + step * DAY - 1), label: new Date(a).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
  const money = realMoney(s);
  const sum = (rows: MoneyActivity[], a: number, b: number, sign: 1 | -1) => r2(rows.filter((x) => x.at >= a && x.at <= b && Math.sign(x.amount) === sign).reduce((t, x) => t + Math.abs(x.amount), 0));
  const salesVsPurchases = buckets.map(({ a, b, label }) => ({ label, sales: performance(s, a, b).sales, purchases: purchaseTotals(s, a, b).purchases }));
  const moneyInOut = buckets.map(({ a, b, label }) => ({ label, in: sum(money, a, b, 1), out: sum(money, a, b, -1) }));
  const periodMoney = money.filter((x) => x.at >= from && x.at <= to);
  const moneyIn = r2(periodMoney.filter((x) => x.amount > 0).reduce((t, x) => t + x.amount, 0));
  const moneyOut = r2(-periodMoney.filter((x) => x.amount < 0).reduce((t, x) => t + x.amount, 0));

  // Sales by payment method: the sale's own split, so the four parts always add up to the sales total.
  const byMethod = performance(s, from, to).byMethod;
  // Every account in use, then Credit; a retired account still shows if this period's sales used it.
  const live = moneyMethods(s);
  const used: Method[] = [...moneyMethods(s, true).filter((m) => live.includes(m) || payAmount(byMethod, m) > 0), "credit"];
  const payTotal = r2(used.reduce((t, m) => t + payAmount(byMethod, m), 0));
  const payments = used.map((m) => ({ method: m, amount: payAmount(byMethod, m), pct: payTotal > 0 ? Math.round((payAmount(byMethod, m) / payTotal) * 1000) / 10 : 0 }));

  const pos = position(s);
  const fb = floatBalances(s);
  return {
    kpis,
    stockValue: pos.stock,
    charts: {
      from: chartFrom, to,
      // A period shorter than a week still draws the last 7 days, so the screen has to say so.
      lastWeek: chartFrom < startOfDay(from),
      // Every day is kept, so an empty period still draws its axes; the flags say whether there is data.
      salesVsPurchases, hasSales: salesVsPurchases.some((x) => x.sales || x.purchases),
      moneyInOut, hasMoney: moneyInOut.some((x) => x.in || x.out),
      moneyIn, moneyOut, net: r2(moneyIn - moneyOut),
    },
    payments, payTotal,
    // Every money account, the owner's named ones included; the total is all of them.
    working: { cash: fb.cash, mpesa: fb.mpesa, bank: fb.bank, accounts: shownAccounts(s, fb).map((m) => ({ method: m, name: methodName(m, s), amount: balanceOf(fb, m) })), total: totalMoney(fb) },
    receivables: { amount: pos.receivables, count: s.customers.filter((c) => c.balance > 0.004).length },
    payables: { amount: pos.payables, count: s.suppliers.filter((x) => x.balance > 0.004).length },
    lowStock: pos.low + pos.out,
    cashUpPending: pos.cashUpPending,
    recentMoves: money.slice(0, 5),
    allMoves: money,
  };
}
export type DashboardView = ReturnType<typeof dashboardView>;

/** Where each alert leads. */
export const ALERT_GO = {
  lowStock: { to: "/inventory", search: { menu: "products & stock", sub: "All Products", filter: "ATTENTION" } },
  expiry: { to: "/inventory", search: { menu: "products & stock", sub: "Expiry" } },
  receivables: { to: "/contacts", search: { menu: "Customers", sub: "Balances" } },
  payables: { to: "/purchases", search: { menu: "Suppliers & Payments", sub: "Suppliers" } },
  cashUp: { to: "/pos", search: { menu: "Cash", sub: "Cash Up" } },
  settings: { to: "/settings", search: {} },
  theft: { to: "/sales", search: { menu: "Alerts" } },
} satisfies Record<string, { to: string; search: ViewSearch }>;

export type BusinessAlert = { id: string; title: string; tone: "bad" | "warn"; go: (typeof ALERT_GO)[keyof typeof ALERT_GO] };

/** What needs attention now, from actual records only: Actionable Alerts and the header bell show this one list. */
export function businessAlerts(s: ErpState, o: { cur: string; tr: (t: string) => string; sync: { phase: string; pending?: number | undefined } }): BusinessAlert[] {
  const { cur, tr, sync } = o;
  const p = position(s);
  const low = p.low + p.out;
  // Sync issues: real outbox state (failed sync, or changes still waiting to reach the server).
  const syncIssue = sync.phase === "failed" ? tr("Failed") : (sync.pending ?? 0) > 0 ? `${sync.pending} ${tr("pending")}` : null;
  const items: BusinessAlert[] = [];
  if (low > 0) items.push({ id: "lowstock", title: `${low} ${tr("products are low or out of stock")}`, tone: "warn", go: ALERT_GO.lowStock });
  // Batches with an expiry date (batches.ts): expired stock first, then what expires within 30 days.
  const ex = expirySummary(s);
  if (ex.expired > 0) items.push({ id: "expired", title: `${ex.expired} ${tr(ex.expired === 1 ? "batch has expired" : "batches have expired")}`, tone: "bad", go: ALERT_GO.expiry });
  if (ex.soon > 0) items.push({ id: "expiring", title: `${ex.soon} ${tr(ex.soon === 1 ? "batch expires within 30 days" : "batches expire within 30 days")}`, tone: "warn", go: ALERT_GO.expiry });
  if (p.receivables > 0) items.push({ id: "receivables", title: `${cur} ${cardFigure(p.receivables)} ${tr("uncollected customer debt")}`, tone: "warn", go: ALERT_GO.receivables });
  if (p.payables > 0) items.push({ id: "payables", title: `${cur} ${cardFigure(p.payables)} ${tr("unpaid supplier purchases")}`, tone: "bad", go: ALERT_GO.payables });
  if (p.cashUpPending) items.push({ id: "cashup", title: tr("POS cash-up is pending"), tone: "warn", go: ALERT_GO.cashUp });
  if (syncIssue) items.push({ id: "sync", title: `${tr("Sync")}: ${syncIssue}`, tone: "bad", go: ALERT_GO.settings });
  // Theft alerts (shop-tools.ts): big discounts, below-cost sales, returns and short cash-ups from the last 7 days.
  const theft = theftAlerts(s as ErpState, { money: (n) => `${cur} ${Math.round(n).toLocaleString("en-KE")}`, tr }).length;
  if (theft > 0) items.push({ id: "theft", title: `${theft} ${tr(theft === 1 ? "thing to check in Alerts" : "things to check in Alerts")}`, tone: "warn", go: ALERT_GO.theft });
  return items;
}
