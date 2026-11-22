// Read-only double-entry journal built from the ERP records. Nothing is typed in twice:
// every sale, return, purchase, expense, payroll and float move produces balanced lines.
import { methodName, moneyMethods, payParts, type AccountMethod, type ErpState, type Method } from "@/lib/erp";

export type FixedAccountId = "cash" | "mpesa" | "bank" | "receivables" | "inventory" | "payables" | "salariesPayable" | "equity" | "sales" | "salesReturns" | "cogs" | "expenses" | "salaries" | "stockAdj" | "vatPayable" | "cylinderDeposits" | "laybyDeposits" | "laybyFees";
/** Each money account the owner named is an asset account of its own, under the same id payments use. */
export type AccountId = FixedAccountId | AccountMethod;
type AccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";
export const ACCOUNT_INFO: Record<FixedAccountId, { name: string; type: AccountType }> = {
  cash: { name: "Cash", type: "Asset" }, mpesa: { name: "M-Pesa", type: "Asset" }, bank: { name: "Bank", type: "Asset" },
  receivables: { name: "Receivables", type: "Asset" }, inventory: { name: "Inventory", type: "Asset" },
  payables: { name: "Payables", type: "Liability" }, vatPayable: { name: "VAT payable", type: "Liability" }, salariesPayable: { name: "Salaries payable", type: "Liability" },
  cylinderDeposits: { name: "Cylinder deposits held", type: "Liability" },
  laybyDeposits: { name: "Lay-by deposits held", type: "Liability" }, laybyFees: { name: "Lay-by cancellation fees", type: "Income" },
  equity: { name: "Owner equity", type: "Equity" },
  sales: { name: "Sales", type: "Income" }, salesReturns: { name: "Sales returns", type: "Expense" },
  cogs: { name: "Cost of goods sold", type: "Expense" }, expenses: { name: "Expenses", type: "Expense" },
  salaries: { name: "Salaries & commission", type: "Expense" }, stockAdj: { name: "Stock adjustments", type: "Expense" },
};
/** Name and type of any account, named money accounts included. */
/** Cash, M-Pesa and Bank show the name this business gave them (an EVC business sees EVC); the account id never changes. */
export const accountInfo = (id: AccountId): { name: string; type: AccountType } => (id === "cash" || id === "mpesa" || id === "bank" || !(id in ACCOUNT_INFO) ? { name: methodName(id), type: "Asset" } : ACCOUNT_INFO[id as FixedAccountId]);
/** The chart of accounts in order: named money accounts come straight after Bank. */
export function accountIds(s: Pick<ErpState, "moneyAccounts">): AccountId[] {
  const fixed = Object.keys(ACCOUNT_INFO) as FixedAccountId[], at = fixed.indexOf("bank") + 1;
  return [...fixed.slice(0, at), ...moneyMethods(s, true).filter((m) => m.startsWith("acct-")) as AccountMethod[], ...fixed.slice(at)];
}
export type Line = { account: AccountId; debit: number; credit: number };
export type Entry = { at: number; ref: string; memo: string; lines: Line[] };
const r2 = (n: number) => Math.round(n * 100) / 100;
const acc = (m: Method): AccountId => (m === "credit" ? "receivables" : m);
const dr = (account: AccountId, v: number): Line => ({ account, debit: r2(v), credit: 0 });
const cr = (account: AccountId, v: number): Line => ({ account, debit: 0, credit: r2(v) });

export function journal(s: ErpState): Entry[] {
  const E: Entry[] = [];
  const push = (at: number, ref: string, memo: string, lines: Line[]) => { const l = lines.filter((x) => x.debit || x.credit); if (l.length) E.push({ at, ref, memo, lines: l }); };
  s.sales.forEach((x) => {
    const cogs = x.items.reduce((a, i) => a + i.qty * i.cost, 0);
    // A new gas cylinder's deposit is held for the customer (paid back when the cylinder comes back), not sales income.
    const deposits = Math.min(x.total - (x.vat ?? 0), x.items.reduce((a, i) => a + (i.gas?.mode === "new" ? i.gas.deposit * i.qty : 0), 0));
    push(x.at, x.ref, "Sale", [...payParts(x.pay).map(([m, v]) => dr(acc(m), v)), cr("sales", x.total - (x.vat ?? 0) - deposits), cr("cylinderDeposits", deposits), cr("vatPayable", x.vat ?? 0), dr("cogs", cogs), cr("inventory", cogs)]);
  });
  s.returns.forEach((r) => {
    const sale = s.sales.find((x) => x.id === r.saleId);
    const cost = r.items.reduce((a, i) => a + i.qty * (sale?.items.find((y) => y.productId === i.productId)?.cost ?? 0), 0);
    const rv = sale?.vat && sale.total ? r.amount * (sale.vat / sale.total) : 0;
    push(r.at, r.ref, `Return ${r.saleRef}`, [dr("salesReturns", r.amount - rv), dr("vatPayable", rv), cr(acc(r.refund), r.amount), dr("inventory", cost), cr("cogs", cost)]);
  });
  s.purchases.forEach((p) => push(p.at, p.ref, "Purchase", [dr("inventory", p.total), ...payParts(p.pay).filter(([m]) => m !== "credit").map(([m, v]) => cr(acc(m), v)), cr("payables", p.pay.credit)]));
  s.purchaseReturns.forEach((r) => push(r.at, r.ref, `Return ${r.purchaseRef}`, [dr(acc(r.refund) === "receivables" ? "payables" : acc(r.refund), r.amount), cr("inventory", r.amount)]));
  s.payments.forEach((p) => {
    if (p.kind === "OPENING") {
      const v = Math.abs(p.amount);
      if (p.customerId) push(p.at, p.ref, `Opening receivable • ${p.source}`, [dr("receivables", v), cr("equity", v)]);
      else if (p.supplierId) push(p.at, p.ref, `Opening payable • ${p.source}`, [dr("equity", v), cr("payables", v)]);
      else if (p.method !== "credit") push(p.at, p.ref, `Opening balance • ${p.source}`, p.amount >= 0 ? [dr(p.method, v), cr("equity", v)] : [dr("equity", v), cr(p.method, v)]);
      return;
    }
    if (p.method === "credit") return;
    const v = Math.abs(p.amount);
    if (p.kind === "DEBT") push(p.at, p.ref, `Debt • ${p.source}`, [dr(p.method, v), cr("receivables", v)]);
    // Lay-by money is held for the customer: in with each part payment, out when it is collected (as the sale) or refunded.
    if (p.kind === "LAYBY") push(p.at, p.ref, `Lay-by • ${p.source}`, p.amount >= 0 ? [dr(p.method, v), cr("laybyDeposits", v)] : [dr("laybyDeposits", v), cr(p.method, v)]);
    if (p.kind === "REFUND" && p.source.startsWith("CYL")) push(p.at, p.ref, `Cylinder deposit returned • ${p.source}`, [dr("cylinderDeposits", v), cr(p.method, v)]);
    if (p.kind === "SUPPLIER PAYMENT") push(p.at, p.ref, `Supplier • ${p.source}`, [dr("payables", v), cr(p.method, v)]);
    if (p.kind === "EXPENSE") push(p.at, p.source, "Expense", [dr("expenses", v), cr(p.method, v)]);
    if (p.kind === "DEPOSIT" || (p.kind === "TRANSFER" && p.amount > 0)) push(p.at, p.ref, p.kind === "DEPOSIT" ? "Deposit" : `Transfer ${p.source}`, [dr(p.method, v), cr("equity", v)]);
    if (p.kind === "WITHDRAWAL" || (p.kind === "TRANSFER" && p.amount < 0)) push(p.at, p.ref, p.kind === "WITHDRAWAL" ? "Withdrawal" : `Transfer ${p.source}`, [dr("equity", v), cr(p.method, v)]);
  });
  // A cancelled lay-by's fee is kept: it leaves the deposits held and becomes income.
  (s.laybys ?? []).forEach((l) => { if (l.status === "cancelled" && l.fee) push(l.closedAt ?? l.at, l.ref, `Lay-by cancelled • fee`, [dr("laybyDeposits", l.fee), cr("laybyFees", l.fee)]); });
  s.payrolls.forEach((r) => push(r.at, r.ref, "Payroll", [dr("salaries", r.net), cr("salariesPayable", r.net)]));
  s.payrollPayments.forEach((p) => { if (p.method !== "credit") push(p.at, p.ref, "Payroll payment", [dr("salariesPayable", p.amount), cr(p.method, p.amount)]); });
  s.cash.forEach((e) => {
    if (e.type === "CASH IN") push(e.at, "CASH IN", e.note ?? "Cash in", [dr("cash", e.amount), cr("equity", e.amount)]);
    if (e.type === "CASH OUT" && !e.note?.startsWith("Payroll")) push(e.at, "CASH OUT", e.note ?? "Cash out", [dr("equity", e.amount), cr("cash", e.amount)]);
  });
  // Only stock posted above (purchases, sales and their returns) is skipped. A RET movement with no Sales return
  // behind it is an Inventory-only customer return, so it still posts like any other stock-in.
  const saleReturns = new Set(s.returns.map((r) => r.ref));
  s.movements.forEach((m) => {
    const p = s.products.find((x) => x.id === m.productId); const v = Math.abs(m.qty) * (p?.buy ?? 0);
    const linked = m.source?.startsWith("PO") || m.source?.startsWith("PRT") || m.type === "SALE" || (m.source !== undefined && saleReturns.has(m.source)) || m.type.startsWith("TRANSFER");
    if (linked || !v) return;
    if (m.qty > 0) push(m.at, m.source ?? m.type, `${m.type} • ${p?.name ?? ""}`, [dr("inventory", v), cr("equity", v)]);
    else push(m.at, m.source ?? m.type, `${m.type} • ${p?.name ?? ""}`, [dr("stockAdj", v), cr("inventory", v)]);
  });
  return E.sort((a, b) => b.at - a.at);
}

export type Balance = { debit: number; credit: number; net: number };
export type Balances = Record<FixedAccountId, Balance> & { [k: AccountMethod]: Balance };
const NONE: Balance = { debit: 0, credit: 0, net: 0 };
/** One account's totals; an account with no lines reads as zero. */
export const balanceFor = (b: Balances, id: AccountId): Balance => (b as Record<string, Balance | undefined>)[id] ?? NONE;
export function balances(entries: Entry[], from = 0, to = Infinity): Balances {
  const b: Record<string, { debit: number; credit: number }> = Object.fromEntries(Object.keys(ACCOUNT_INFO).map((k) => [k, { debit: 0, credit: 0 }]));
  entries.forEach((e) => { if (e.at < from || e.at > to) return; e.lines.forEach((l) => { const x = (b[l.account] ??= { debit: 0, credit: 0 }); x.debit += l.debit; x.credit += l.credit; }); });
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { debit: r2(v.debit), credit: r2(v.credit), net: r2(v.debit - v.credit) }])) as Balances;
}

export function profitAndLoss(s: ErpState, from = 0, to = Infinity) {
  const b = balances(journal(s), from, to);
  const sales = -b.sales.net, returns = b.salesReturns.net, cogs = b.cogs.net;
  const gross = r2(sales - returns - cogs);
  const opex = { expenses: b.expenses.net, salaries: b.salaries.net, stockAdj: b.stockAdj.net };
  return { sales: r2(sales), returns: r2(returns), cogs: r2(cogs), gross, ...opex, net: r2(gross - opex.expenses - opex.salaries - opex.stockAdj) };
}

export function balanceSheet(s: ErpState) {
  const b = balances(journal(s));
  const assets = accountIds(s).filter((k) => accountInfo(k).type === "Asset").map((k) => ({ id: k, value: balanceFor(b, k).net }));
  const liabilities = (["payables", "salariesPayable", "vatPayable"] as const).map((k) => ({ id: k as AccountId, value: r2(-b[k].net) }));
  const equity = r2(-b.equity.net);
  const profit = profitAndLoss(s).net;
  const totalAssets = r2(assets.reduce((a, x) => a + x.value, 0));
  const totalLiab = r2(liabilities.reduce((a, x) => a + x.value, 0));
  return { assets, liabilities, equity, profit, totalAssets, totalLiab, balanced: Math.abs(totalAssets - totalLiab - equity - profit) < 0.01 };
}
