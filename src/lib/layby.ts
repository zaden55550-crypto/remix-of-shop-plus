// Deposits & lay-by (Settings › Features). A customer reserves goods and pays in parts; the goods are kept aside (they leave
// sellable stock at once, as a STOCK OUT "Lay-by held") and the customer collects them when everything is paid. Collecting
// returns the goods to stock and records an ordinary sale paid exactly as the lay-by was paid, then takes the lay-by money
// back out of the deposits (negative LAYBY payments), so every money account, cash-up and the accounts count it once.
// Cancelling returns the goods and pays the customer back what they paid minus the owner's fee (default 0).
// Every step is one ERP transaction. Lay-by money is held for the customer ("Lay-by deposits held") until it is collected.
import { checkMethod, commit, confirmSale, ErpError, isWholeUnit, roundQty, runErpTransaction, shopPrice, shopStock, uid, type CartLine, type ErpState, type Layby, type MoneyMethod, type Sale } from "@/lib/erp";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const laybyBalance = (l: Pick<Layby, "total" | "paid">) => r2(Math.max(0, l.total - l.paid));
/** The lay-by part payments, by money account (for the sale on collection). */
const paidBy = (s: ErpState, l: Layby) => {
  const by: Record<string, number> = {};
  for (const p of s.payments) if (p.kind === "LAYBY" && p.source === l.ref) by[p.method] = r2((by[p.method] ?? 0) + p.amount);
  return by;
};
const OWNER_FEE_KEY = "shopbook.laybyFee";
/** The owner's cancellation fee as a percentage of what was paid (Settings note: default 0). */
export function laybyFeePercent(): number { try { const v = Number(localStorage.getItem(OWNER_FEE_KEY)); return v >= 0 && v <= 100 ? v : 0; } catch { return 0; } }
export function setLaybyFeePercent(v: number) { if (!(v >= 0 && v <= 100)) throw new ErpError("The fee must be 0 to 100%"); localStorage.setItem(OWNER_FEE_KEY, String(v)); }

export type NewLayby = { customerId: string; cart: CartLine[]; deposit: number; method: MoneyMethod; dueAt?: number | undefined; note?: string | undefined };

/** Starts a lay-by: the goods are kept aside and the first deposit is taken. */
export const startLayby = (input: NewLayby) => commit((s, c) => {
  const cust = s.customers.find((x) => x.id === input.customerId);
  if (!cust) throw new ErpError("A lay-by needs a registered customer");
  if (!input.cart.length) throw new ErpError("Add the goods to keep aside");
  checkMethod(s, input.method, false);
  const ref = c.nextRef("LAY");
  const items = input.cart.map((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    if (!p) throw new ErpError("Product not found");
    const qty = roundQty(l.qty);
    if (!(qty > 0)) throw new ErpError(`Invalid quantity for ${p.name}`);
    if (isWholeUnit(p.unit, s.units) && !Number.isInteger(qty)) throw new ErpError(`${p.name} is sold in whole ${p.unit || "pcs"} only`);
    if (qty > shopStock(s, p, c.shop) + 1e-9) throw new ErpError(`Insufficient stock: ${p.name}`);
    if (p.serialTracked || p.gas) throw new ErpError(`${p.name} can't be put on lay-by (sell it at the till)`);
    const price = l.price ?? shopPrice(p, c.shop);
    if (!(price >= 0)) throw new ErpError(`Invalid price for ${p.name}`);
    return { productId: p.id, name: p.name, qty, price };
  });
  const total = r2(items.reduce((a, i) => a + i.qty * i.price, 0));
  const deposit = r2(input.deposit);
  if (!(deposit > 0)) throw new ErpError("Enter the deposit the customer pays now");
  if (deposit > total) throw new ErpError("The deposit can't be more than the total");
  items.forEach((i) => c.move(i.productId, "STOCK OUT", -i.qty, `Lay-by held • ${cust.name}`, ref));
  const now = Date.now();
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: now, method: input.method, amount: deposit, kind: "LAYBY", source: ref, customerId: cust.id, user: c.user, note: "Lay-by deposit" });
  const l: Layby = { id: uid(), ref, at: now, customerId: cust.id, items, total, paid: deposit, status: "open", user: c.user, ...(input.dueAt ? { dueAt: input.dueAt } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}) };
  s.laybys.unshift(l);
  c.audit("LAYBY STARTED", `${ref} • ${cust.name} • ${total} • deposit ${deposit}`);
  return l;
});

/** A later part payment. */
export const payLayby = (id: string, amount: number, method: MoneyMethod) => commit((s, c) => {
  const l = s.laybys.find((x) => x.id === id);
  if (!l || l.status !== "open") throw new ErpError("This lay-by is not open");
  checkMethod(s, method, false);
  const a = r2(amount);
  if (!(a > 0)) throw new ErpError("Enter an amount");
  if (a > laybyBalance(l) + 0.001) throw new ErpError(`Only ${laybyBalance(l)} is left to pay`);
  c.here(l);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount: a, kind: "LAYBY", source: l.ref, customerId: l.customerId, user: c.user, note: "Lay-by payment" });
  l.paid = r2(l.paid + a);
  c.audit("LAYBY PAYMENT", `${l.ref} • ${a} • balance ${laybyBalance(l)}`);
  return l;
});

/** The customer collects a fully paid lay-by: the goods are sold to them, paid with the lay-by money. */
export function collectLayby(id: string): Sale {
  return runErpTransaction(() => {
    const before = commit((s) => { const l = s.laybys.find((x) => x.id === id); if (!l || l.status !== "open") throw new ErpError("This lay-by is not open"); if (laybyBalance(l) > 0.001) throw new ErpError(`${laybyBalance(l)} is still to pay`); return structuredClone(l); });
    commit((s, c) => { c.here(before); before.items.forEach((i) => { if (s.products.some((p) => p.id === i.productId)) c.move(i.productId, "STOCK IN", i.qty, "Lay-by released for collection", before.ref); }); });
    const by = commit((s) => paidBy(s, before));
    const pay = { cash: by["cash"] ?? 0, mpesa: by["mpesa"] ?? 0, bank: by["bank"] ?? 0, credit: 0, ...Object.fromEntries(Object.entries(by).filter(([m]) => m.startsWith("acct-"))) };
    const sale = confirmSale({ cart: before.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, priceReason: `Lay-by ${before.ref}` })), discount: 0, pay, customerId: before.customerId, channel: "Sales" });
    commit((s, c) => {
      const l = s.laybys.find((x) => x.id === id)!;
      // The lay-by money becomes the sale's money: take it out of the deposits so it is counted once.
      for (const [method, amount] of Object.entries(by)) if (amount > 0) s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: method as MoneyMethod, amount: -amount, kind: "LAYBY", source: l.ref, customerId: l.customerId, user: c.user, note: `Lay-by applied to ${sale.ref}` });
      Object.assign(l, { status: "collected", saleId: sale.id, saleRef: sale.ref, closedAt: Date.now() });
      c.audit("LAYBY COLLECTED", `${l.ref} → ${sale.ref}`);
    });
    return sale;
  });
}

/** Cancels an open lay-by: the goods go back to stock and the customer gets what they paid minus the fee. */
export const cancelLayby = (id: string, method: MoneyMethod, feePercent = laybyFeePercent()) => commit((s, c) => {
  const l = s.laybys.find((x) => x.id === id);
  if (!l || l.status !== "open") throw new ErpError("This lay-by is not open");
  if (!(feePercent >= 0 && feePercent <= 100)) throw new ErpError("The fee must be 0 to 100%");
  checkMethod(s, method, false);
  c.here(l);
  l.items.forEach((i) => { if (s.products.some((p) => p.id === i.productId)) c.move(i.productId, "STOCK IN", i.qty, "Lay-by cancelled", l.ref); });
  const fee = r2(l.paid * feePercent / 100), refund = r2(l.paid - fee);
  if (refund > 0) s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount: -refund, kind: "LAYBY", source: l.ref, customerId: l.customerId, user: c.user, note: "Lay-by refund" });
  Object.assign(l, { status: "cancelled", fee: fee || undefined, refunded: refund, closedAt: Date.now() });
  c.audit("LAYBY CANCELLED", `${l.ref} • refund ${refund}${fee ? ` • fee ${fee}` : ""}`);
  return { refund, fee };
});

/** What a business holds for open lay-bys (paid in, not yet collected or refunded). */
export const laybyDepositsHeld = (s: Pick<ErpState, "laybys">) => r2(s.laybys.filter((l) => l.status === "open").reduce((a, l) => a + l.paid, 0));
