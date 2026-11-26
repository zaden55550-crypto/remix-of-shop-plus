// Purchases, Expenses, Suppliers and Float — all written through the shared ERP `commit`.
// Money moves are rows in the one `payments` ledger (negative = money out), so Float,
// POS cash-up, Accounting, Dashboard and Summary all read the same records.
import { conversionFactor } from "@/lib/catalog";
import { activeShop, atBusiness, atShop, businessMoneyAccounts, cleanLot, commit, MAIN_BUSINESS, cashSession, checkMethod, checkPayRecord, ErpError, isBuiltInMoney, isWholeUnit, roundQty, uid, METHODS, MONEY_ACCOUNT_LIMIT, methodName, moneyMethods, PAYMENT_CATEGORIES, paymentMethods, payParts, payStatus, type AccountMethod, type MoneyAccount, type PaymentCategory, type ErpState, type Method, type Lot, type MoneyMethod, type PayRecord, type Purchase, type Supplier } from "@/lib/erp";

/** Every money account in use: Cash, M-Pesa, Bank, then the ones the owner named. */
export const accounts = (s: Pick<ErpState, "moneyAccounts">) => moneyMethods(s);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Balances = Record<"cash" | "mpesa" | "bank", number> & { [k: AccountMethod]: number };
/** Live balance of every money account from every recorded money movement. Named accounts are always listed, retired ones too. */
export function floatBalances(s: ErpState): Balances {
  const out: Record<string, number> = { cash: 0, mpesa: 0, bank: 0 };
  for (const m of moneyMethods(s, true)) out[m] = 0;
  const add = (m: Method, v: number) => { if (m !== "credit") out[m] = (out[m] ?? 0) + v; };
  s.payments.forEach((p) => add(p.method, p.amount));
  s.payrollPayments.forEach((p) => add(p.method, -p.amount));
  s.cash.forEach((e) => {
    if (e.type === "CASH IN") add("cash", e.amount);
    if (e.type === "CASH OUT" && !e.note?.startsWith("Payroll")) add("cash", -e.amount);
  });
  for (const k of Object.keys(out)) out[k] = r2(out[k] ?? 0);
  return out as Balances;
}
/** One account's balance (0 for an account with no movements). */
export const balanceOf = (b: Balances, m: MoneyMethod) => (b as Record<string, number>)[m] ?? 0;
/** Accounts to list on a screen: every account in use, plus a retired one that somehow still holds money. */
export const shownAccounts = (s: ErpState, b: Balances = floatBalances(s)) => { const live = moneyMethods(s); return moneyMethods(s, true).filter((m) => live.includes(m) || Math.abs(balanceOf(b, m)) > 0.001); };
/** All money held across every account. */
export const totalMoney = (b: Balances) => r2(Object.values(b).reduce((a, v) => a + v, 0));

function ensureFunds(s: ErpState, m: Method, amount: number) {
  if (m === "credit" || !(amount > 0)) return;
  if (m === "cash" && amount > cashSession(s).expected + 0.001) throw new ErpError("Not enough cash in the drawer");
  const shop = activeShop(s), here = { ...s, payments: s.payments.filter((p) => atShop(p, shop)), payrollPayments: s.payrollPayments.filter((p) => atShop(p, shop)), cash: s.cash.filter((e) => atShop(e, shop)) };
  if (m !== "cash" && amount > balanceOf(floatBalances(here), m) + 0.001) throw new ErpError(`Not enough money in ${methodName(m, s)}`);
}

// ---------- Payment methods (money accounts): Cash, M-Pesa, Bank and the ones the owner adds (EVC, SAAD, Card…) ----------
/** A method name: not empty, at most 40 characters, and not used by another method or Credit (ignoring case and spaces). */
function accountName(s: ErpState, name: string, selfId?: string, business = MAIN_BUSINESS) {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new ErpError("Enter a payment method name");
  if (n.length > 40) throw new ErpError("Name is too long (40 characters at most)");
  const reserved = ["Credit", "Partial Payment", "P.PAY"];
  const taken = [...reserved, ...paymentMethods(view(s, business)).filter((m) => m.id !== selfId).map((m) => m.name)];
  if (taken.some((x) => x.trim().toLowerCase() === n.toLowerCase())) throw new ErpError(reserved.some((x) => x.toLowerCase() === n.toLowerCase()) ? `${n} is a payment state, not a method` : "A payment method with this name already exists");
  return n;
}
const CATEGORY_IDS = new Set<string>(PAYMENT_CATEGORIES.map((c) => c.id));
const category = (c: string | undefined): PaymentCategory => (c && CATEGORY_IDS.has(c) ? (c as PaymentCategory) : "other");
const tooMany = () => new ErpError(`Up to ${MONEY_ACCOUNT_LIMIT} payment methods in use. Disable one you no longer use first`);
/** One business's payment method settings (erp.ts `businessMoneyAccounts`): every check and change below reads and writes these only. */
const view = (s: ErpState, business: string) => ({ moneyAccounts: businessMoneyAccounts(s, business) });
/** The saved row of a method, created for Cash, M-Pesa or Bank the first time the owner changes one (same fixed id, so nothing else moves).
 *  The first business keeps it as a `moneyAccounts` row; another business keeps it on its own record (`paymentSettings`). */
function methodRow(s: ErpState, id: string, business = MAIN_BUSINESS): MoneyAccount {
  const found = businessMoneyAccounts(s, business).find((x) => x.id === id); if (found) return found;
  const info = paymentMethods(view(s, business)).find((m) => m.id === id);
  if (!info || !isBuiltInMoney(id)) throw new ErpError("Payment method not found");
  const row: MoneyAccount = { id, name: info.name, createdAt: Date.now(), category: info.category, order: info.order };
  if (business === MAIN_BUSINESS) { s.moneyAccounts.push(row); return row; }
  const b = s.businesses.find((x) => x.id === business);
  if (!b) throw new ErpError("Business not found");
  b.paymentSettings = { ...(b.paymentSettings ?? {}), [id]: row };
  return row;
}
/** Money held in one method by one business, so disabling a method only looks at that business's money. */
const businessBalance = (s: ErpState, business: string, id: Parameters<typeof balanceOf>[1]) => balanceOf(floatBalances({ ...s, payments: s.payments.filter((p) => atBusiness(p, business)), payrollPayments: s.payrollPayments.filter((p) => atBusiness(p, business)), cash: s.cash.filter((e) => atBusiness(e, business)), moneyAccounts: businessMoneyAccounts(s, business) }), id);
/** Adds a payment method. It shows at the end of every money screen's choices until the owner moves it. */
const cleanNumber = (n: string | undefined) => (n ?? "").trim().slice(0, 40) || undefined;
export const addMoneyAccount = (name: string, cat: PaymentCategory = "other", accountNumber?: string) => commit((s, c) => {
  const n = accountName(s, name, undefined, c.business);
  if (moneyMethods(view(s, c.business)).length >= MONEY_ACCOUNT_LIMIT) throw tooMany();
  const last = paymentMethods(view(s, c.business)).reduce((a, m) => Math.max(a, m.order), -1);
  const acct: MoneyAccount = { id: `acct-${uid()}` as AccountMethod, name: n, createdAt: Date.now(), category: category(cat), order: last + 1, ...(cleanNumber(accountNumber) ? { accountNumber: cleanNumber(accountNumber) } : {}) };
  s.moneyAccounts.push(acct);
  c.audit("MONEY ACCOUNT ADDED", n);
  return acct;
});
/** The method's optional account or till number (bank account, Paybill…). Information only: it never changes balances. */
export const setMoneyAccountNumber = (id: string, accountNumber: string) => commit((s, c) => {
  const a = methodRow(s, id, c.business), next = cleanNumber(accountNumber);
  if (next) a.accountNumber = next; else delete a.accountNumber;
  c.audit("MONEY ACCOUNT NUMBER", `${a.name}: ${next ?? "removed"}`);
  return a;
});
/** A new name only; every record keeps pointing at the same method. Works for Cash, M-Pesa and Bank too. */
export const renameMoneyAccount = (id: string, name: string) => commit((s, c) => {
  const mine = view(s, c.business), old = methodName(id, mine), n = accountName(s, name, id, c.business);
  if (n === old && mine.moneyAccounts.some((x) => x.id === id)) return methodRow(s, id, c.business);
  if (n === old) return paymentMethods(mine).find((m) => m.id === id) ?? methodRow(s, id, c.business);
  const a = methodRow(s, id, c.business); a.name = n; c.audit("MONEY ACCOUNT RENAMED", `${old} → ${n}`); return a;
});
/** What kind of money the method is (cash, mobile money, bank transfer…). Information only: it never changes balances. */
export const setMoneyAccountCategory = (id: string, cat: PaymentCategory) => commit((s, c) => {
  const a = methodRow(s, id, c.business), next = category(cat);
  if (a.category === next) return a;
  a.category = next; c.audit("MONEY ACCOUNT CATEGORY", `${a.name} → ${next}`); return a;
});
/** Disabling hides a method from every picker; its history and records stay. Only an empty one can be disabled, so no money disappears
 *  from the balances, and at least one method must stay in use. */
export const setMoneyAccountActive = (id: string, active: boolean) => commit((s, c) => {
  const mine = view(s, c.business);
  const info = paymentMethods(mine).find((m) => m.id === id); if (!info) throw new ErpError("Payment method not found");
  if (info.active === active) return methodRow(s, id, c.business);
  if (active && moneyMethods(mine).length >= MONEY_ACCOUNT_LIMIT) throw tooMany();
  if (!active) {
    if (moneyMethods(mine).length <= 1) throw new ErpError("Keep at least one payment method in use");
    const left = businessBalance(s, c.business, info.id);
    if (Math.abs(left) > 0.001) throw new ErpError(`Move the money out of ${info.name} first (balance ${left})`);
  }
  const a = methodRow(s, id, c.business);
  a.active = active ? undefined : false;
  c.audit(active ? "MONEY ACCOUNT RESTORED" : "MONEY ACCOUNT RETIRED", a.name);
  return a;
});
/** Moves a method one place up or down in the order every screen shows. Rewrites the order of every method so it stays unambiguous. */
export const moveMoneyAccount = (id: string, by: -1 | 1) => commit((s, c) => {
  const mine = view(s, c.business), list = paymentMethods(mine), i = list.findIndex((m) => m.id === id), j = i + by;
  if (i < 0) throw new ErpError("Payment method not found");
  if (j < 0 || j >= list.length) return list.map((m) => m.id);
  [list[i], list[j]] = [list[j]!, list[i]!];
  list.forEach((m, k) => { const existing = mine.moneyAccounts.find((x) => x.id === m.id); if (existing) { if (existing.order !== k) existing.order = k; } else if (m.order !== k) methodRow(s, m.id, c.business).order = k; });
  c.audit("MONEY ACCOUNT ORDER", list.map((m) => m.name).join(" · "));
  return list.map((m) => m.id);
});

// ---------- Suppliers ----------
export type SupplierExtra = { email?: string; address?: string; info?: string; notes?: string };
export const addSupplier = (name: string, phone?: string, extra: SupplierExtra = {}) => commit((s, c) => {
  const n = name.trim(); if (!n) throw new ErpError("Enter a supplier name");
  if (n.length > 100) throw new ErpError("Name is too long");
  if (s.suppliers.some((x) => x.name.toLowerCase() === n.toLowerCase())) throw new ErpError("This supplier already exists");
  const sup: Supplier = { id: uid(), name: n, phone: phone?.trim() || undefined, email: extra.email?.trim() || undefined, address: extra.address?.trim() || undefined, info: extra.info?.trim() || undefined, notes: extra.notes?.trim() || undefined, balance: 0, createdAt: Date.now() };
  s.suppliers.unshift(sup); c.audit("SUPPLIER CREATED", n); return sup;
});

export const paySupplier = (supplierId: string, amount: number, method: Method) => commit((s, c) => {
  const sup = s.suppliers.find((x) => x.id === supplierId); if (!sup) throw new ErpError("Supplier not found");
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > sup.balance + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  ensureFunds(s, method, amount);
  sup.balance = r2(sup.balance - amount);
  allocateToPurchases(s, sup.id, amount);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount: -amount, kind: "SUPPLIER PAYMENT", source: sup.name, user: c.user });
  c.audit("SUPPLIER PAYMENT", `${sup.name} • ${amount}`);
});

// ---------- Purchase balances (P.PAY = part paid) ----------
export function purchaseBalance(s: ErpState, p: Purchase) {
  const credRet = s.purchaseReturns.filter((r) => r.purchaseId === p.id && r.refund === "credit").reduce((a, r) => a + r.amount, 0);
  return Math.max(0, r2(p.pay.credit - (p.settled ?? 0) - credRet));
}
export const purchaseStatus = (s: ErpState, p: Purchase) => payStatus(p.total, purchaseBalance(s, p), p.items.every((i) => i.returned >= i.qty));
function allocateToPurchases(s: ErpState, supplierId: string, amount: number, only?: string) {
  let left = amount;
  for (const p of s.purchases.filter((x) => x.supplierId === supplierId && (!only || x.id === only)).sort((a, b) => a.at - b.at)) {
    if (left <= 0.001) break; const b = purchaseBalance(s, p); if (b <= 0) continue;
    const take = Math.min(b, left); p.settled = r2((p.settled ?? 0) + take); left -= take;
  }
}
/** Pays one P.PAY/Credit purchase; supplier balance and money ledger move together. */
export const payPurchase = (purchaseId: string, amount: number, method: Method) => commit((s, c) => {
  const p = s.purchases.find((x) => x.id === purchaseId); if (!p) throw new ErpError("Purchase not found");
  c.here(p);
  const sup = s.suppliers.find((x) => x.id === p.supplierId); if (!sup) throw new ErpError("Supplier not found");
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > purchaseBalance(s, p) + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  ensureFunds(s, method, amount);
  sup.balance = r2(sup.balance - amount);
  allocateToPurchases(s, sup.id, amount, p.id);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount: -amount, kind: "SUPPLIER PAYMENT", source: sup.name, user: c.user });
  c.audit("SUPPLIER PAYMENT", `${p.ref} • ${sup.name} • ${amount}`);
});

// ---------- Purchases ----------
/** `unit` is what was bought in, when it isn't the product's own: qty and cost are per that unit, and become stock units here. */
export type PurchaseLine = Lot & { productId: string; qty: number; cost: number; unit?: string | undefined;
  /** Bought by money ("100 shillings' worth"): the cost is only rounding from that amount, so the product's buying price stays. */
  keepCost?: boolean | undefined };
export const confirmPurchase = (input: { lines: PurchaseLine[]; pay: PayRecord; supplierId?: string | undefined; updateCost: boolean; note?: string | undefined; orderId?: string | undefined }) => commit((s, c) => {
  if (!input.lines.length) throw new ErpError("Add products to the purchase");
  const items = input.lines.map((l) => {
    const p = s.products.find((x) => x.id === l.productId); if (!p) throw new ErpError("Product not found");
    if (!(l.qty > 0)) throw new ErpError(`Invalid quantity for ${p.name}`);
    if (!(l.cost >= 0)) throw new ErpError(`Invalid cost for ${p.name}`);
    const factor = l.unit ? conversionFactor(s, l.unit, p.unit) : 1;
    if (factor === null) throw new ErpError(`${l.unit} can't be converted to ${p.unit || "pcs"}`);
    const qty = roundQty(l.qty * factor);
    // Kilos, litres, metres and yards may be bought in part; pieces, boxes and the like only whole.
    if (isWholeUnit(p.unit, s.units) && !Number.isInteger(qty)) throw new ErpError(`${p.name} is counted in whole ${p.unit || "pcs"} only`);
    const lot = cleanLot(l);
    if (factor === 1) return { productId: p.id, name: p.name, qty, cost: l.cost, returned: 0, ...lot };
    return { productId: p.id, name: p.name, qty, cost: Math.round((l.cost / factor) * 1e6) / 1e6, returned: 0, bought: { qty: l.qty, unit: l.unit as string }, ...lot };
  });
  // From what was entered, so a converted line's rounded unit cost can't shift the total.
  const total = r2(input.lines.reduce((a, l) => a + l.qty * l.cost, 0));
  if (METHODS.some((m) => !(input.pay[m] >= 0))) throw new ErpError("Payment amounts can't be negative");
  checkPayRecord(s, input.pay);
  const allocated = payParts(input.pay).reduce((a, [, v]) => a + v, 0);
  if (Math.abs(allocated - total) > 0.001) throw new ErpError("Allocate the full total (use Credit for the unpaid part)");
  const sup = input.supplierId ? s.suppliers.find((x) => x.id === input.supplierId) : undefined;
  if (input.pay.credit > 0 && !sup) throw new ErpError("Credit needs a supplier");
  payParts(input.pay).forEach(([m, v]) => ensureFunds(s, m, v));
  const ref = c.nextRef("PO");
  items.forEach((i, n) => {
    c.move(i.productId, "PURCHASE", i.qty, "Purchase", ref, undefined, { batch: i.batch, expiry: i.expiry });
    if (input.updateCost && !input.lines[n]?.keepCost) { const p = s.products.find((x) => x.id === i.productId); if (p) p.buy = i.cost; }
  });
  payParts(input.pay).forEach(([m, v]) => { if (m !== "credit") s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: m, amount: -v, kind: "PURCHASE", source: ref, user: c.user }); });
  if (sup && input.pay.credit > 0) sup.balance = r2(sup.balance + input.pay.credit);
  const pur: Purchase = { id: uid(), ref, at: Date.now(), supplierId: sup?.id, items, total, pay: { ...input.pay }, user: c.user, note: input.note?.trim() || undefined, orderId: input.orderId };
  s.purchases.unshift(pur);
  c.audit("PURCHASE", `${ref} • ${total}${sup ? ` • ${sup.name}` : ""}`);
  return pur;
});

/** Items go back to the supplier: stock out, then refund in money or reduce what we owe. */
export const returnPurchase = (purchaseId: string, lines: { productId: string; qty: number }[], refund: Method, reason?: string) => commit((s, c) => {
  const pur = s.purchases.find((x) => x.id === purchaseId); if (!pur) throw new ErpError("Purchase not found");
  c.here(pur);
  const picked = lines.filter((l) => l.qty > 0); if (!picked.length) throw new ErpError("Choose items to return");
  checkMethod(s, refund);
  const ref = c.nextRef("PRT");
  const items = picked.map((l) => {
    const it = pur.items.find((i) => i.productId === l.productId); if (!it) throw new ErpError("Item not in purchase");
    if (l.qty > it.qty - it.returned) throw new ErpError(`Only ${it.qty - it.returned} of ${it.name} can be returned`);
    it.returned += l.qty;
    c.move(it.productId, "STOCK OUT", -l.qty, `Return to supplier ${pur.ref}`, ref);
    return { productId: it.productId, name: it.name, qty: l.qty, amount: r2(l.qty * it.cost) };
  });
  const amount = r2(items.reduce((a, i) => a + i.amount, 0));
  const sup = pur.supplierId ? s.suppliers.find((x) => x.id === pur.supplierId) : undefined;
  if (refund === "credit") {
    if (!sup) throw new ErpError("Supplier credit needs a supplier");
    sup.balance = r2(sup.balance - amount);
  } else {
    s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: refund, amount, kind: "SUPPLIER REFUND", source: ref, user: c.user });
  }
  s.purchaseReturns.unshift({ id: uid(), ref, at: Date.now(), purchaseId, purchaseRef: pur.ref, items, amount, refund, reason: reason?.trim() || undefined, user: c.user });
  c.audit("PURCHASE RETURN", `${ref} for ${pur.ref} • ${amount}`);
});

// ---------- Expenses ----------
export const DEFAULT_EXPENSE_CATEGORIES = ["Rent", "Electricity", "Water", "Transport", "Internet", "Airtime", "Repairs", "Supplies", "Other"];
/** An expense may be fully paid, part paid (P.PAY) or unpaid (Credit); each money account paid is its own ledger row. */
export const addExpense = (input: { category: string; amount: number; method: Method; note?: string | undefined; description?: string | undefined; at?: number | undefined; pay?: Partial<Record<Method, number>> | undefined }) => commit((s, c) => {
  const usable = moneyMethods(s);
  const cat = input.category.trim(); if (!cat) throw new ErpError("Choose a category");
  if (!(input.amount > 0)) throw new ErpError("Enter an amount");
  const pay = input.pay ?? (input.method === "credit" ? {} : { [input.method]: input.amount });
  for (const [m, v] of Object.entries(pay)) if (m !== "credit" && (v ?? 0) > 0) checkMethod(s, m as Method);
  const parts = usable.map((m) => [m, r2(pay[m] ?? 0)] as const).filter(([, v]) => v > 0);
  if (parts.some(([, v]) => v < 0)) throw new ErpError("Payment amounts can't be negative");
  const paid = parts.reduce((a, [, v]) => a + v, 0);
  if (paid > input.amount + 0.001) throw new ErpError("Paid amount is more than the total");
  if (input.method === "credit" && !input.pay) throw new ErpError("Choose where the money comes from");
  parts.forEach(([m, v]) => ensureFunds(s, m, v));
  const ref = c.nextRef("EXP");
  const at = input.at && input.at <= Date.now() ? input.at : Date.now();
  s.expenses.unshift({ id: uid(), ref, at, category: cat, description: input.description?.trim() || undefined, note: input.note?.trim() || undefined, amount: r2(input.amount), method: parts[0]?.[0] ?? "credit", user: c.user });
  parts.forEach(([m, v]) => s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at, method: m, amount: -v, kind: "EXPENSE", source: ref, user: c.user }));
  c.audit("EXPENSE", `${ref} • ${cat} • ${input.amount}`);
  return s.expenses[0]!;
});
export const expensePaid = (s: ErpState, x: { ref: string }) => r2(s.payments.filter((p) => p.kind === "EXPENSE" && p.source === x.ref).reduce((a, p) => a - p.amount, 0));
export const expenseBalance = (s: ErpState, x: { ref: string; amount: number }) => Math.max(0, r2(x.amount - expensePaid(s, x)));
export const expenseStatus = (s: ErpState, x: { ref: string; amount: number }) => payStatus(x.amount, expenseBalance(s, x), false);
/** Pays (part of) what is still owed on an expense. */
export const payExpense = (expenseId: string, amount: number, method: Method, at?: number) => commit((s, c) => {
  const x = s.expenses.find((v) => v.id === expenseId); if (!x) throw new ErpError("Expense not found");
  c.here(x);
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > expenseBalance(s, x) + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  ensureFunds(s, method, amount);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: at && at <= Date.now() ? at : Date.now(), method, amount: -r2(amount), kind: "EXPENSE", source: x.ref, user: c.user });
  c.audit("EXPENSE PAYMENT", `${x.ref} • ${amount}`);
});
export const addExpenseCategory = (name: string) => commit((s, c) => {
  const n = name.trim(); if (!n) throw new ErpError("Enter a name");
  if ([...DEFAULT_EXPENSE_CATEGORIES, ...s.expenseCategories.map((x) => x.name)].some((x) => x.toLowerCase() === n.toLowerCase())) throw new ErpError("Category already exists");
  s.expenseCategories.push({ id: uid(), name: n }); c.audit("EXPENSE CATEGORY", n); return n;
});
export const expenseCategories = (s: ErpState) => [...DEFAULT_EXPENSE_CATEGORIES, ...s.expenseCategories.map((x) => x.name)];

// ---------- Float ----------
export const floatDeposit = (method: Method, amount: number, kind: "DEPOSIT" | "WITHDRAWAL", note: string) => commit((s, c) => {
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (kind === "WITHDRAWAL") ensureFunds(s, method, amount);
  s.payments.unshift({ id: uid(), ref: c.nextRef("FL"), at: Date.now(), method, amount: kind === "DEPOSIT" ? amount : -amount, kind, source: note.trim() || (kind === "DEPOSIT" ? "Owner deposit" : "Owner withdrawal"), user: c.user });
  c.audit(`FLOAT ${kind}`, `${methodName(method, s)} • ${amount}`);
});
export const floatTransfer = (from: Method, to: Method, amount: number) => commit((s, c) => {
  if (from === to) throw new ErpError("Choose two different accounts");
  checkMethod(s, from, false); checkMethod(s, to, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  ensureFunds(s, from, amount);
  const ref = c.nextRef("FT");
  s.payments.unshift({ id: uid(), ref, at: Date.now(), method: from, amount: -amount, kind: "TRANSFER", source: `→ ${methodName(to, s)}`, user: c.user });
  s.payments.unshift({ id: uid(), ref, at: Date.now(), method: to, amount, kind: "TRANSFER", source: `← ${methodName(from, s)}`, user: c.user });
  c.audit("FLOAT TRANSFER", `${methodName(from, s)} → ${methodName(to, s)} • ${amount}`);
});

// ---------- Read-only totals ----------
export function purchaseTotals(s: ErpState, from = 0, to = Date.now()) {
  const inR = (at: number) => at >= from && at <= to;
  const purchases = r2(s.purchases.filter((x) => inR(x.at)).reduce((a, x) => a + x.total, 0) - s.purchaseReturns.filter((x) => inR(x.at)).reduce((a, x) => a + x.amount, 0));
  const expenses = r2(s.expenses.filter((x) => inR(x.at)).reduce((a, x) => a + x.amount, 0));
  const payroll = r2(s.payrollPayments.filter((x) => inR(x.at)).reduce((a, x) => a + x.amount, 0));
  const payables = r2(s.suppliers.reduce((a, x) => a + Math.max(0, x.balance), 0));
  return { purchases, expenses, payroll, payables };
}
