// Shop tools (owner, 2026-11-23): credit reminders, reorder suggestions, loyalty points, theft alerts and voice product entry.
// Everything here reads real records; the only writes go through the ERP engine (commit), so history stays audited.
import { commit, ErpError, type Customer, type ErpState, type Product } from "@/lib/erp";
import { readSettings, saveSettings } from "@/lib/settings-config";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Credit book reminders ---------- */
/** A polite reminder for a customer who owes, with the business's ways to pay. */
export function creditReminder(c: Pick<Customer, "name" | "balance">, o: { business: string; money: (n: number) => string; tr: (x: string) => string; payLines: string[] }): string {
  const { business, money, tr, payLines } = o;
  return [
    `${tr("Hello")} ${c.name},`,
    `${tr("This is a friendly reminder from")} ${business}: ${tr("your balance is")} ${money(c.balance)}.`,
    ...(payLines.length ? [tr("You can pay by:"), ...payLines] : []),
    tr("Thank you!"),
  ].join("\n");
}
/** Customers who owe, largest first. */
export const debtors = (s: Pick<ErpState, "customers">) => s.customers.filter((c) => c.balance > 0.009).sort((a, b) => b.balance - a.balance);

/* ---------- Reorder suggestions ---------- */
export type Reorder = { product: Product; perDay: number; left: number; daysLeft: number; order: number; supplier?: string | undefined };
/** What to order: daily sales over the last `days`, and enough to cover `cover` days. Products that never sold are left out. */
export function reorderSuggestions(s: Pick<ErpState, "products" | "sales" | "purchases" | "suppliers">, o: { days?: number; cover?: number; now?: number } = {}): Reorder[] {
  const days = o.days ?? 28, cover = o.cover ?? 14, now = o.now ?? Date.now(), from = now - days * DAY;
  const sold = new Map<string, number>();
  for (const x of s.sales) if (x.at >= from) for (const i of x.items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty - (i.returned ?? 0));
  const lastSupplier = new Map<string, string>();
  for (const p of [...s.purchases].sort((a, b) => a.at - b.at)) for (const i of p.items) if (p.supplierId) lastSupplier.set(i.productId, p.supplierId);
  const out: Reorder[] = [];
  for (const p of s.products) {
    if (p.archived) continue;
    const perDay = (sold.get(p.id) ?? 0) / days;
    if (perDay <= 0) continue;
    const order = Math.ceil(perDay * cover - p.qty);
    if (order <= 0) continue;
    const sup = lastSupplier.get(p.id);
    out.push({ product: p, perDay: r2(perDay), left: p.qty, daysLeft: Math.floor(p.qty / perDay), order, supplier: sup ? s.suppliers.find((x) => x.id === sup)?.name : undefined });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
/** One order message per supplier, ready to send. */
export function orderMessage(lines: Reorder[], business: string, tr: (x: string) => string) {
  return [`${business}: ${tr("order please")}`, ...lines.map((l) => `- ${l.product.name} × ${l.order}${l.product.unit ? ` ${l.product.unit}` : ""}`), tr("Thank you!")].join("\n");
}

/* ---------- Loyalty points ---------- */
export type Loyalty = { on: boolean; earnPer: number; pointValue: number };
export const loyalty = (): Loyalty => ({ on: false, earnPer: 100, pointValue: 1, ...readSettings().loyalty });
export function saveLoyalty(l: Loyalty) {
  if (!(l.earnPer > 0) || !(l.pointValue > 0)) throw new ErpError("Enter how much earns a point and what a point is worth");
  saveSettings({ loyalty: l });
}
/** Points a customer has: one per `earnPer` spent on each sale (returns taken off), less points already used. */
export function pointsOf(s: Pick<ErpState, "sales">, c: Pick<Customer, "id" | "pointsUsed">, l: Loyalty = loyalty()) {
  if (!l.on) return 0;
  const earned = s.sales.filter((x) => x.customerId === c.id).reduce((n, x) => {
    const kept = x.items.reduce((a, i) => a + (i.qty - (i.returned ?? 0)) * i.price, 0) - x.discount;
    return n + Math.floor(Math.max(0, kept) / l.earnPer);
  }, 0);
  return Math.max(0, earned - (c.pointsUsed ?? 0));
}
/** Uses a customer's points; the money they are worth is given as a discount at the till. Returns that amount. */
export const redeemPoints = (customerId: string, points: number) => commit((s, c) => {
  const l = loyalty(), cu = s.customers.find((x) => x.id === customerId);
  if (!l.on) throw new ErpError("Loyalty points are switched off");
  if (!cu) throw new ErpError("Customer not found");
  if (!(Number.isInteger(points) && points > 0)) throw new ErpError("Enter the points to use");
  if (points > pointsOf(s, cu, l)) throw new ErpError("Not enough points");
  cu.pointsUsed = (cu.pointsUsed ?? 0) + points;
  c.audit("POINTS REDEEMED", `${cu.name} • ${points} • ${r2(points * l.pointValue)}`);
  return r2(points * l.pointValue);
});

/* ---------- Theft alerts ---------- */
export type TheftAlert = { id: string; at: number; kind: "discount" | "below-cost" | "return" | "short"; text: string; user: string };
/** Things an owner should look at, from the last `days`: big discounts, sales below buying price, returns and short cash-ups. */
export function theftAlerts(s: Pick<ErpState, "sales" | "returns" | "cash">, o: { days?: number; discountPct?: number; money: (n: number) => string; tr: (x: string) => string; now?: number }): TheftAlert[] {
  const { money, tr } = o, from = (o.now ?? Date.now()) - (o.days ?? 7) * DAY, pct = o.discountPct ?? readSettings().alertDiscountPct ?? 20;
  const out: TheftAlert[] = [];
  for (const x of s.sales) {
    if (x.at < from) continue;
    if (x.subtotal > 0 && (x.discount / x.subtotal) * 100 >= pct) out.push({ id: `d-${x.id}`, at: x.at, kind: "discount", user: x.cashier, text: `${x.ref}: ${tr("discount of")} ${money(x.discount)} (${Math.round((x.discount / x.subtotal) * 100)}%)` });
    const below = x.items.filter((i) => i.cost > 0 && i.price < i.cost);
    if (below.length) out.push({ id: `b-${x.id}`, at: x.at, kind: "below-cost", user: x.cashier, text: `${x.ref}: ${tr("sold below buying price")} (${below.map((i) => i.name).join(", ")})` });
  }
  for (const r of s.returns) if (r.at >= from) out.push({ id: `r-${r.id}`, at: r.at, kind: "return", user: r.user ?? "", text: `${r.ref}: ${tr("return of")} ${money(r.amount)}` });
  for (const e of s.cash) if (e.at >= from && e.type === "CASH UP" && e.amount < -0.009) out.push({ id: `c-${e.id}`, at: e.at, kind: "short", user: e.user ?? "", text: `${tr("Cash-up short by")} ${money(-e.amount)}` });
  return out.sort((a, b) => b.at - a.at);
}

/* ---------- Voice entry ---------- */
/** Reads what was said into a product: "sugar 1 kilo 180 shillings 20 pieces" → name, price and quantity. */
export function parseSpokenProduct(text: string): { name: string; sell?: number | undefined; qty?: number | undefined } {
  const t = ` ${text.toLowerCase().replace(/,/g, "")} `;
  const price = /(?:at |for |price |kes |ksh |sh )?(\d+(?:\.\d+)?)\s*(?:shillings|shilling|bob|kes|ksh|\/=)/.exec(t) ?? /(?:price|at|for)\s+(\d+(?:\.\d+)?)/.exec(t);
  const qty = /(\d+)\s*(?:pieces|piece|pcs|units|in stock|items)/.exec(t) ?? /(?:quantity|stock|have)\s+(\d+)/.exec(t);
  let name = t;
  for (const m of [price, qty]) if (m) name = name.replace(m[0], " ");
  name = name.replace(/\b(price|at|for|quantity|stock|have|i|of)\b/g, " ").replace(/\s+/g, " ").trim();
  name = name.replace(/\b\w/g, (m) => m.toUpperCase());
  return { name, ...(price ? { sell: Number(price[1]) } : {}), ...(qty ? { qty: Number(qty[1]) } : {}) };
}
