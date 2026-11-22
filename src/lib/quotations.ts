// Quotations (Settings › Features). A priced offer for a customer: it moves no stock and no money. It stays valid for 14 days
// by default; it can be shared (WhatsApp or any app) and turned into a sale in one step, paid or on credit, at the prices
// quoted. Every step is one ERP transaction; the sale is an ordinary sale (recordSale checks stock, serials, gas and payment).
import { paymentLines, printedRef } from "@/lib/ready-setup";
import { commit, confirmSale, ErpError, roundQty, runErpTransaction, shopPrice, uid, type CartLine, type ErpState, type Method, type Quotation, type Sale } from "@/lib/erp";

export const QUOTE_DAYS = 14;
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const quoteExpired = (q: Pick<Quotation, "status" | "validUntil">, now = Date.now()) => q.status === "open" && q.validUntil < now;

export type NewQuotation = { cart: CartLine[]; customerId?: string | undefined; customerName?: string | undefined; days?: number | undefined; note?: string | undefined };
export const createQuotation = (input: NewQuotation) => commit((s, c) => {
  if (!input.cart.length) throw new ErpError("Add the goods to quote");
  const days = input.days ?? QUOTE_DAYS;
  if (!(Number.isInteger(days) && days >= 1 && days <= 365)) throw new ErpError("A quotation is valid for 1 to 365 days");
  const cust = input.customerId ? s.customers.find((x) => x.id === input.customerId) : undefined;
  if (input.customerId && !cust) throw new ErpError("Customer not found");
  const items = input.cart.map((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    if (!p) throw new ErpError("Product not found");
    const qty = roundQty(l.qty), price = l.price ?? shopPrice(p, c.shop);
    if (!(qty > 0)) throw new ErpError(`Invalid quantity for ${p.name}`);
    if (!(price >= 0)) throw new ErpError(`Invalid price for ${p.name}`);
    return { productId: p.id, name: p.name, qty, price };
  });
  const now = Date.now();
  const q: Quotation = { id: uid(), ref: c.nextRef("QT"), at: now, validUntil: now + days * DAY, items, total: r2(items.reduce((a, i) => a + i.qty * i.price, 0)), status: "open", user: c.user,
    ...(cust ? { customerId: cust.id } : input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}) };
  s.quotations.unshift(q);
  c.audit("QUOTATION", `${q.ref} • ${q.total}${cust ? ` • ${cust.name}` : ""}`);
  return q;
});

export const cancelQuotation = (id: string) => commit((s, c) => {
  const q = s.quotations.find((x) => x.id === id);
  if (!q || q.status !== "open") throw new ErpError("This quotation is not open");
  q.status = "cancelled";
  c.audit("QUOTATION CANCELLED", q.ref);
});

/** Turns an open quotation into a sale at the quoted prices: paid in full from one money account, or on credit. */
export function convertQuotation(id: string, how: { method: Method }, vatRate = 0): Sale {
  return runErpTransaction(() => {
    const q = commit((s) => { const x = s.quotations.find((y) => y.id === id); if (!x || x.status !== "open") throw new ErpError("This quotation is not open"); return structuredClone(x); });
    if (how.method === "credit" && !q.customerId) throw new ErpError("Credit needs a registered customer");
    const total = r2(q.total * (1 + Math.min(100, Math.max(0, vatRate)) / 100));
    const pay = { cash: 0, mpesa: 0, bank: 0, credit: 0, [how.method]: total };
    const sale = confirmSale({ cart: q.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, priceReason: `Quotation ${q.ref}` })), discount: 0, pay, customerId: q.customerId, channel: "Sales", vatRate });
    commit((s, c) => { const x = s.quotations.find((y) => y.id === id)!; Object.assign(x, { status: "converted", saleId: sale.id, saleRef: sale.ref }); c.audit("QUOTATION CONVERTED", `${x.ref} → ${sale.ref}`); });
    return sale;
  });
}

/** The quotation as plain text, to share on WhatsApp or print. */
export function quotationText(s: Pick<ErpState, "customers">, q: Quotation, shop: string, money: (n: number) => string, tr: (x: string) => string, phone?: string) {
  const who = q.customerId ? s.customers.find((c) => c.id === q.customerId)?.name : q.customerName;
  const day = (t: number) => new Date(t).toLocaleDateString("en-GB");
  return [`${shop}${phone ? ` · ${tr("Tel")}: ${phone}` : ""}`, `${tr("Quotation")} ${printedRef(q.ref)} · ${day(q.at)}`, ...(who ? [`${tr("For")}: ${who}`] : []), "",
    ...q.items.map((i) => `${i.name}  ${i.qty} × ${money(i.price)} = ${money(r2(i.qty * i.price))}`), "", `${tr("TOTAL")} ${money(q.total)}`,
    `${tr("Valid until")} ${day(q.validUntil)}`, ...paymentLines(tr), ...(q.note ? [q.note] : [])].join("\n");
}
