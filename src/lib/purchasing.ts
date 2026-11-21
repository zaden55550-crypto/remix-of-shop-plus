// Purchases app records beyond the purchase itself: orders, supplier invoices, combined payments and cancellation.
// An order moves no stock until goods are received. An invoice is a document about a debt the purchase already recorded,
// so it never changes a balance on its own; what it shows as paid is read from the payments on its purchases.
import { commit, ErpError, paidAmount, roundQty, runErpTransaction, uid, type ErpState, type Method, type OrderStatus, type PayRecord, type Payment, type Purchase, type PurchaseOrder, type Supplier, type SupplierInvoice } from "@/lib/erp";
import { confirmPurchase, paySupplier, payPurchase, purchaseBalance, purchaseTotals } from "@/lib/finance";

const r2 = (n: number) => Math.round(n * 100) / 100;
const key = (t: string) => t.trim().toLowerCase();
export const DAY = 86399999;

// ---------- Reading purchases ----------
/** Real money paid: at purchase time plus later payments. A return that reduced the debt is not money paid. */
export const purchasePaid = (p: Purchase) => r2(paidAmount(p.pay) + (p.settled ?? 0));
export const isCancelled = (p: Purchase) => !!p.cancelled || p.items.every((i) => i.returned >= i.qty);
/** What became of the goods; paying for them is a separate status (`purchaseStatus`). */
export function purchaseState(p: Purchase) {
  if (p.cancelled) return "Cancelled";
  if (p.items.every((i) => i.returned >= i.qty)) return "Returned";
  return p.items.some((i) => i.returned > 0) ? "Partly Returned" : "Completed";
}
export const purchaseTotalQty = (p: Purchase) => roundQty(p.items.reduce((a, i) => a + i.qty, 0));

export type Received = { id: string; at: number; ref: string; productId: string; name: string; qty: number; supplierId?: string | undefined };
export const stockReceived = (s: ErpState): Received[] => s.purchases.flatMap((p) => p.items.map((i) => ({ id: `${p.id}-${i.productId}`, at: p.at, ref: p.ref, productId: i.productId, name: i.name, qty: i.qty, supplierId: p.supplierId })));

const ACTIVITY: Record<string, string> = {
  PURCHASE: "New purchase", "PURCHASE EDITED": "Purchase edited", "PURCHASE CANCELLED": "Purchase cancelled", "PURCHASE RETURN": "Return recorded",
  "ORDER CREATED": "Order created", "ORDER SENT": "Order sent", "ORDER EDITED": "Order edited", "ORDER RECEIVED": "Goods received", "ORDER CANCELLED": "Order cancelled",
  "INVOICE ADDED": "Invoice added", "INVOICE EDITED": "Invoice edited", "SUPPLIER PAYMENT": "Supplier paid",
};
export const purchaseActivity = (s: ErpState) => s.audit.filter((a) => ACTIVITY[a.action]).map((a) => ({ ...a, label: ACTIVITY[a.action] as string }));

/** The Overview's four figures. With no period, Outstanding is every supplier's real balance; with one, it is what is still
 *  owed today on the purchases made in that period. Each is read from one kind of record, so nothing is counted twice:
 *  money from the payments ledger (each part of a combined payment is its own row), goods from completed purchases. */
export function purchaseKpis(s: ErpState, range?: { from: number; to: number }) {
  const inside = (at: number) => !range || (at >= range.from && at <= range.to);
  const live = s.purchases.filter((p) => inside(p.at) && !isCancelled(p));
  const money = s.payments.filter((p) => inside(p.at) && (p.kind === "PURCHASE" || p.kind === "SUPPLIER PAYMENT" || p.kind === "SUPPLIER REFUND"));
  return {
    total: r2(live.reduce((a, p) => a + p.total, 0)),
    // A refund is ledger money coming back, so a cancelled purchase's payment doesn't stay counted as paid.
    paid: r2(money.reduce((a, p) => a - p.amount, 0)),
    outstanding: range ? r2(live.reduce((a, p) => a + purchaseBalance(s, p), 0)) : purchaseTotals(s).payables,
    received: r2(live.reduce((a, p) => a + p.items.reduce((b, i) => b + i.qty * i.cost, 0), 0)),
  };
}

/** Notes on a completed purchase. Its goods and money only change through a return or a cancellation. */
export const editPurchaseNote = (id: string, note: string) => commit((s, c) => {
  const p = s.purchases.find((x) => x.id === id); if (!p) throw new ErpError("Purchase not found");
  p.note = note.trim() || undefined;
  c.audit("PURCHASE EDITED", `${p.ref} • ${p.note ?? "note removed"}`);
});

/** Cancels what is left of a purchase: the stock goes back out, and any debt falls first and paid money is refunded after. The record stays. */
export const cancelPurchase = (id: string, reason: string, refund: Method) => commit((s, c) => {
  const p = s.purchases.find((x) => x.id === id); if (!p) throw new ErpError("Purchase not found");
  if (!reason.trim()) throw new ErpError("A reason is required");
  c.here(p);
  if (p.cancelled) throw new ErpError("This purchase is already cancelled");
  const left = p.items.filter((i) => i.qty - i.returned > 0);
  const value = r2(left.reduce((a, i) => a + (i.qty - i.returned) * i.cost, 0));
  if (!left.length) throw new ErpError("Everything on this purchase was already returned");
  const owed = Math.min(purchaseBalance(s, p), value), money = r2(value - owed);
  if (money > 0.001 && refund === "credit") throw new ErpError("Choose Cash, M-Pesa or Bank for the money to refund");
  const sup = p.supplierId ? s.suppliers.find((x) => x.id === p.supplierId) : undefined;
  if (owed > 0.001) { if (!sup) throw new ErpError("Supplier not found"); sup.balance = r2(sup.balance - owed); }
  const ref = c.nextRef("PRT");
  left.forEach((i) => c.move(i.productId, "STOCK OUT", -roundQty(i.qty - i.returned), `Cancelled ${p.ref}: ${reason.trim()}`, ref));
  // One return per way the value came back, so Accounting posts each to the right account.
  const parts: [Method, number][] = [];
  if (owed > 0.001) parts.push(["credit", owed]);
  if (money > 0.001) parts.push([refund, money]);
  parts.forEach(([method, amount], n) => {
    const share = amount / value;
    s.purchaseReturns.unshift({
      id: uid(), ref: n ? c.nextRef("PRT") : ref, at: Date.now(), purchaseId: p.id, purchaseRef: p.ref, amount, refund: method, reason: `Cancelled: ${reason.trim()}`, user: c.user,
      items: left.map((i) => ({ productId: i.productId, name: i.name, qty: roundQty((i.qty - i.returned) * share), amount: r2((i.qty - i.returned) * i.cost * share) })),
    });
    if (method !== "credit") s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount, kind: "SUPPLIER REFUND", source: ref, user: c.user });
  });
  left.forEach((i) => { i.returned = i.qty; });
  p.cancelled = { at: Date.now(), reason: reason.trim(), user: c.user };
  c.audit("PURCHASE CANCELLED", `${p.ref} • ${value} • ${reason.trim()}`);
});

// ---------- Purchase orders ----------
export type OrderInput = { id?: string | undefined; supplierId: string; at: number; expectedAt?: number | undefined; note?: string | undefined; status?: "Draft" | "Sent" | undefined; lines: { productId: string; qty: number; cost: number }[] };
export const saveOrder = (input: OrderInput) => commit((s, c) => {
  const sup = s.suppliers.find((x) => x.id === input.supplierId); if (!sup) throw new ErpError("Choose a supplier");
  if (!input.lines.length) throw new ErpError("Add products to the order");
  const old = input.id ? s.purchaseOrders.find((x) => x.id === input.id) : undefined;
  if (input.id && !old) throw new ErpError("Order not found");
  if (old && !["Draft", "Sent"].includes(old.status)) throw new ErpError("Only a draft or sent order can be edited");
  const lines = input.lines.map((l) => {
    const p = s.products.find((x) => x.id === l.productId); if (!p) throw new ErpError("Product not found");
    if (!(l.qty > 0)) throw new ErpError(`Invalid quantity for ${p.name}`);
    if (!(l.cost >= 0)) throw new ErpError(`Invalid cost for ${p.name}`);
    return { productId: p.id, name: p.name, qty: roundQty(l.qty), cost: l.cost, received: 0 };
  });
  const fields = { supplierId: sup.id, at: input.at, expectedAt: input.expectedAt, note: input.note?.trim() || undefined, lines, total: r2(lines.reduce((a, l) => a + l.qty * l.cost, 0)), status: (input.status ?? old?.status ?? "Draft") as OrderStatus };
  if (old) { Object.assign(old, fields); c.audit("ORDER EDITED", `${old.ref} • ${sup.name}`); return old; }
  const order: PurchaseOrder = { id: uid(), ref: c.nextRef("LPO"), user: c.user, ...fields };
  s.purchaseOrders.unshift(order);
  c.audit("ORDER CREATED", `${order.ref} • ${sup.name} • ${order.total}`);
  return order;
});
export const sendOrder = (id: string) => commit((s, c) => {
  const o = s.purchaseOrders.find((x) => x.id === id); if (!o) throw new ErpError("Order not found");
  if (o.status !== "Draft") throw new ErpError("Only a draft order can be sent");
  o.status = "Sent"; c.audit("ORDER SENT", o.ref);
});
export const cancelOrder = (id: string, reason: string) => commit((s, c) => {
  const o = s.purchaseOrders.find((x) => x.id === id); if (!o) throw new ErpError("Order not found");
  if (!reason.trim()) throw new ErpError("A reason is required");
  if (o.status === "Completed" || o.status === "Cancelled") throw new ErpError("This order can't be cancelled");
  o.status = "Cancelled"; o.cancelReason = reason.trim(); c.audit("ORDER CANCELLED", `${o.ref} • ${reason.trim()}`);
});
/** The one moment an order changes stock: goods counted in become a purchase, in one step with the order's progress. */
export const receiveOrder = (id: string, receive: { productId: string; qty: number }[], pay: PayRecord) => runErpTransaction(() => {
  const start = commit((s, c) => { const o = s.purchaseOrders.find((x) => x.id === id); if (o) c.here(o); return o; });
  if (!start) throw new ErpError("Order not found");
  if (start.status !== "Sent" && start.status !== "Partially Received" && start.status !== "Draft") throw new ErpError("This order can't receive goods");
  const lines = receive.filter((r) => r.qty > 0).map((r) => {
    const l = start.lines.find((x) => x.productId === r.productId); if (!l) throw new ErpError("Item not on this order");
    if (r.qty > roundQty(l.qty - l.received) + 1e-9) throw new ErpError(`Only ${roundQty(l.qty - l.received)} of ${l.name} is still to come`);
    return { productId: r.productId, qty: roundQty(r.qty), cost: l.cost };
  });
  if (!lines.length) throw new ErpError("Enter what was received");
  const purchase = confirmPurchase({ lines, pay, supplierId: start.supplierId, updateCost: true, orderId: id });
  commit((s, c) => {
    const o = s.purchaseOrders.find((x) => x.id === id)!;
    lines.forEach((r) => { const l = o.lines.find((x) => x.productId === r.productId)!; l.received = roundQty(l.received + r.qty); });
    o.status = o.lines.every((l) => l.received >= l.qty) ? "Completed" : "Partially Received";
    c.audit("ORDER RECEIVED", `${o.ref} • ${purchase.ref}`);
  });
  return purchase;
});

// ---------- Supplier invoices ----------
export type InvoiceInput = { id?: string | undefined; number: string; supplierId: string; purchaseId?: string | undefined; orderId?: string | undefined; at: number; dueAt?: number | undefined; amount: number; note?: string | undefined };
export const saveInvoice = (input: InvoiceInput) => commit((s, c) => {
  const number = input.number.trim(); if (!number) throw new ErpError("Enter the invoice number");
  const sup = s.suppliers.find((x) => x.id === input.supplierId); if (!sup) throw new ErpError("Choose a supplier");
  if (!(input.amount > 0)) throw new ErpError("Enter the invoice amount");
  if (!input.purchaseId && !input.orderId) throw new ErpError("Link the invoice to a purchase or an order");
  const pur = input.purchaseId ? s.purchases.find((x) => x.id === input.purchaseId) : undefined;
  const ord = input.orderId ? s.purchaseOrders.find((x) => x.id === input.orderId) : undefined;
  if ((input.purchaseId && !pur) || (input.orderId && !ord)) throw new ErpError("That purchase or order was not found");
  if ((pur && pur.supplierId !== sup.id) || (ord && ord.supplierId !== sup.id)) throw new ErpError("That purchase or order belongs to another supplier");
  if (s.supplierInvoices.some((x) => x.id !== input.id && x.supplierId === sup.id && key(x.number) === key(number))) throw new ErpError("This supplier already has an invoice with that number");
  const fields = { number, supplierId: sup.id, purchaseId: input.purchaseId, orderId: input.orderId, at: input.at, dueAt: input.dueAt, amount: r2(input.amount), note: input.note?.trim() || undefined };
  if (input.id) {
    const old = s.supplierInvoices.find((x) => x.id === input.id); if (!old) throw new ErpError("Invoice not found");
    Object.assign(old, fields); c.audit("INVOICE EDITED", `${number} • ${sup.name} • ${fields.amount}`); return old;
  }
  const inv: SupplierInvoice = { id: uid(), user: c.user, createdAt: Date.now(), ...fields };
  s.supplierInvoices.unshift(inv);
  c.audit("INVOICE ADDED", `${number} • ${sup.name} • ${fields.amount}`);
  return inv;
});
/** The purchases an invoice is about: the one it names, or everything received against its order. */
export const invoicePurchases = (s: ErpState, inv: SupplierInvoice) => s.purchases.filter((p) => (inv.purchaseId && p.id === inv.purchaseId) || (inv.orderId && p.orderId === inv.orderId)).sort((a, b) => a.at - b.at);
/** Paid on those purchases, shared out to their invoices oldest first, so two invoices on one purchase don't both claim the same money. */
export function invoicePaid(s: ErpState, inv: SupplierInvoice) {
  const mine = new Set(invoicePurchases(s, inv).map((p) => p.id));
  const paid = s.purchases.filter((p) => mine.has(p.id)).reduce((a, p) => a + purchasePaid(p), 0);
  const earlier = s.supplierInvoices.filter((x) => x.id !== inv.id && (x.createdAt < inv.createdAt) && invoicePurchases(s, x).some((p) => mine.has(p.id))).reduce((a, x) => a + x.amount, 0);
  return r2(Math.min(inv.amount, Math.max(0, paid - earlier)));
}
export const invoiceBalance = (s: ErpState, inv: SupplierInvoice) => r2(inv.amount - invoicePaid(s, inv));
export type InvoiceStatus = "Paid" | "Partially Paid" | "Unpaid" | "Overdue";
export function invoiceStatus(s: ErpState, inv: SupplierInvoice, now = Date.now()): InvoiceStatus {
  const bal = invoiceBalance(s, inv);
  if (bal <= 0.001) return "Paid";
  if (inv.dueAt && inv.dueAt + DAY < now) return "Overdue";
  return bal < inv.amount ? "Partially Paid" : "Unpaid";
}

// ---------- Supplier payments ----------
export type PaymentInput = { supplierId: string; purchaseId?: string | undefined; invoiceId?: string | undefined; parts: { method: Method; amount: number }[]; note?: string | undefined };
/** All the parts of a combined payment go through together or not at all. */
export const recordSupplierPayment = (input: PaymentInput) => runErpTransaction(() => {
  const parts = input.parts.filter((p) => p.amount > 0);
  if (!parts.length) throw new ErpError("Enter an amount");
  const before = commit((s) => {
    const sup = s.suppliers.find((x) => x.id === input.supplierId); if (!sup) throw new ErpError("Choose a supplier");
    // A double tap or a resubmitted form must not pay twice.
    if (s.payments.some((p) => p.kind === "SUPPLIER PAYMENT" && p.source === sup.name && Date.now() - p.at < 5000 && parts.some((x) => x.method === p.method && Math.abs(p.amount + x.amount) < 0.001))) throw new ErpError("This payment was just recorded");
    const inv = input.invoiceId ? s.supplierInvoices.find((x) => x.id === input.invoiceId) : undefined;
    if (input.invoiceId && !inv) throw new ErpError("Invoice not found");
    if (inv && parts.reduce((a, p) => a + p.amount, 0) > invoiceBalance(s, inv) + 0.001) throw new ErpError("Amount is more than the outstanding balance");
    return { inv, targets: inv ? invoicePurchases(s, inv).map((p) => p.id) : [], count: s.payments.length };
  });
  for (const part of parts) {
    if (input.purchaseId) { payPurchase(input.purchaseId, part.amount, part.method); continue; }
    if (!before.inv) { paySupplier(input.supplierId, part.amount, part.method); continue; }
    // An invoice is paid through its purchases, oldest first, so the supplier's balance and theirs stay one figure.
    let left = part.amount;
    for (const id of before.targets) {
      if (left <= 0.001) break;
      const s0 = commit((s) => { const p = s.purchases.find((x) => x.id === id); return p ? purchaseBalance(s, p) : 0; });
      if (s0 <= 0.001) continue;
      const take = Math.min(s0, left);
      payPurchase(id, r2(take), part.method);
      left = r2(left - take);
    }
    if (left > 0.001) throw new ErpError("Goods on this invoice have not been received, so nothing is owed on it yet");
  }
  return commit((s, c) => {
    const rows = s.payments.slice(0, s.payments.length - before.count);
    const doc = before.inv?.number ?? (input.purchaseId ? s.purchases.find((x) => x.id === input.purchaseId)?.ref : undefined);
    rows.forEach((r) => { r.docRef = doc; r.note = input.note?.trim() || undefined; });
    if (rows.length > 1) c.audit("SUPPLIER PAYMENT", `Combined • ${rows.map((r) => `${r.method} ${-r.amount}`).join(" + ")}`);
    return rows;
  });
});
/** The amount and account of a recorded payment never change here; only what it says about itself. */
export const editPaymentNote = (id: string, note: string) => commit((s, c) => {
  const p = s.payments.find((x) => x.id === id); if (!p) throw new ErpError("Payment not found");
  p.note = note.trim() || undefined;
  c.audit("SUPPLIER PAYMENT EDITED", `${p.ref} • ${p.note ?? "note removed"}`);
});
/** What a payment row was for, from the record or, for older rows, from what it can be traced to. */
export const paymentFor = (s: ErpState, p: Payment) => p.docRef ?? (p.kind === "PURCHASE" ? p.source : "");
export const supplierOfPayment = (s: ErpState, p: Payment) => (p.kind === "PURCHASE" ? s.suppliers.find((x) => x.id === s.purchases.find((y) => y.ref === p.source)?.supplierId) : s.suppliers.find((x) => x.name === p.source));
export const supplierPaymentRows = (s: ErpState) => s.payments.filter((p) => p.kind === "SUPPLIER PAYMENT" || p.kind === "PURCHASE");

// ---------- Suppliers ----------
export function supplierTotals(s: ErpState, sup: Supplier) {
  const purchases = s.purchases.filter((p) => p.supplierId === sup.id);
  const ids = new Set(purchases.map((p) => p.id));
  return {
    count: purchases.length,
    total: r2(purchases.reduce((a, p) => a + p.total, 0)),
    paid: r2(supplierPaymentRows(s).filter((p) => supplierOfPayment(s, p)?.id === sup.id).reduce((a, p) => a - p.amount, 0)),
    returns: r2(s.purchaseReturns.filter((r) => ids.has(r.purchaseId)).reduce((a, r) => a + r.amount, 0)),
  };
}
export type StatementRow = { id: string; at: number; ref: string; what: string; debit: number; credit: number; balance: number };
/** Every line of the account in date order, ending on the supplier's own balance. Anything from before these records opens the statement. */
export function supplierStatement(s: ErpState, sup: Supplier): StatementRow[] {
  const lines: Omit<StatementRow, "balance">[] = [];
  s.purchases.filter((p) => p.supplierId === sup.id).forEach((p) => {
    lines.push({ id: p.id, at: p.at, ref: p.ref, what: "Purchase", debit: p.total, credit: 0 });
    const paid = paidAmount(p.pay);
    if (paid > 0) lines.push({ id: `${p.id}-paid`, at: p.at, ref: p.ref, what: "Paid with purchase", debit: 0, credit: paid });
    s.purchaseReturns.filter((r) => r.purchaseId === p.id && r.refund === "credit").forEach((r) => lines.push({ id: r.id, at: r.at, ref: r.ref, what: "Return", debit: 0, credit: r.amount }));
    // A return refunded in money takes the goods off and brings the money back: the account is unchanged.
  });
  s.payments.filter((p) => p.kind === "SUPPLIER PAYMENT" && p.source === sup.name).forEach((p) => lines.push({ id: p.id, at: p.at, ref: p.ref, what: "Payment", debit: 0, credit: -p.amount }));
  lines.sort((a, b) => a.at - b.at);
  const end = r2(lines.reduce((a, l) => a + l.debit - l.credit, 0));
  let bal = r2(sup.balance - end);
  const rows: StatementRow[] = bal ? [{ id: "opening", at: lines[0]?.at ?? sup.createdAt, ref: "", what: "Opening balance", debit: Math.max(0, bal), credit: Math.max(0, -bal), balance: bal }] : [];
  lines.forEach((l) => { bal = r2(bal + l.debit - l.credit); rows.push({ ...l, balance: bal }); });
  return rows;
}
