// SHOPBOOK ERP Core — shared business data + one transaction engine.
// Every module (Inventory, Sales, POS, Purchases, Returns, Reports) reads and
// writes through `commit`, which validates and applies a whole transaction or nothing.

export type Product = {
  id: string; name: string; buy: number; sell: number; qty: number;
  sku?: string | undefined; barcode?: string | undefined; categoryId?: string | undefined; brandId?: string | undefined;
  unit?: string | undefined; image?: string | undefined; minStock?: number | undefined; createdAt: number;
};
export type Named = { id: string; name: string };
export type MoveType = "OPENING" | "PURCHASE" | "STOCK IN" | "SALE" | "STOCK OUT" | "ADJUSTMENT" | "RETURN" | "TRANSFER OUT" | "TRANSFER IN" | "TRANSFER CANCEL";
export type Movement = {
  id: string; at: number; type: MoveType; productId: string; qty: number;
  prev: number; next: number; reason?: string | undefined; source?: string | undefined; user: string;
};
export type Transfer = {
  id: string; ref: string; productId: string; qty: number; from: string; to: string;
  status: "PENDING" | "SENT" | "RECEIVED" | "CANCELLED"; at: number; user: string;
};
export type Audit = { id: string; at: number; action: string; detail: string; user: string };
export type ErpState = {
  products: Product[]; categories: Named[]; brands: Named[];
  movements: Movement[]; transfers: Transfer[]; audit: Audit[]; seq: Record<string, number>;
  customers: Customer[]; sales: Sale[]; payments: Payment[]; returns: SaleReturn[]; cash: CashEvent[];
};
export type Method = "cash" | "mpesa" | "bank" | "credit";
export const METHODS: Method[] = ["cash", "mpesa", "bank", "credit"];
export const METHOD_LABEL: Record<Method, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", credit: "Credit" };
export type Customer = { id: string; name: string; phone?: string | undefined; balance: number; createdAt: number };
export type SaleItem = { productId: string; name: string; qty: number; price: number; cost: number; returned: number };
export type Sale = {
  id: string; ref: string; at: number; items: SaleItem[]; subtotal: number; discount: number; total: number;
  pay: Record<Method, number>; customerId?: string | undefined; cashier: string; channel: "POS" | "Sales";
};
export type Payment = { id: string; ref: string; at: number; method: Method; amount: number; kind: "SALE" | "DEBT" | "REFUND"; source: string; customerId?: string | undefined; user: string };
export type SaleReturn = { id: string; ref: string; at: number; saleId: string; saleRef: string; items: { productId: string; name: string; qty: number; amount: number }[]; amount: number; refund: Method; user: string };
export type CashEvent = { id: string; at: number; type: "OPENING" | "CASH IN" | "CASH OUT" | "CASH UP"; amount: number; note?: string | undefined; expected?: number | undefined; counted?: number | undefined; user: string };

const KEY = "shopbook.erp";
const EVT = "shopbook-erp";
const empty = (): ErpState => ({ products: [], categories: [], brands: [], movements: [], transfers: [], audit: [], seq: {}, customers: [], sales: [], payments: [], returns: [], cash: [] });
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function load(): ErpState {
  if (typeof window === "undefined") return empty();
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return empty(); }
}

export class ErpError extends Error {}

/** Atomic transaction: works on a copy; saves only if every step succeeds. */
export function commit<T>(fn: (s: ErpState, ctx: Ctx) => T): T {
  const draft: ErpState = structuredClone(load());
  const ctx = makeCtx(draft);
  const out = fn(draft, ctx); // throws → nothing is saved
  localStorage.setItem(KEY, JSON.stringify(draft));
  window.dispatchEvent(new Event(EVT));
  return out;
}

type Ctx = ReturnType<typeof makeCtx>;
function makeCtx(s: ErpState) {
  const user = currentUser();
  return {
    user,
    nextRef(prefix: string) { s.seq[prefix] = (s.seq[prefix] ?? 0) + 1; return `${prefix}-${String(s.seq[prefix]).padStart(6, "0")}`; },
    audit(action: string, detail: string) { s.audit.unshift({ id: uid(), at: Date.now(), action, detail, user }); },
    move(productId: string, type: MoveType, delta: number, reason?: string, source?: string) {
      const p = s.products.find((x) => x.id === productId);
      if (!p) throw new ErpError("Product not found");
      if (!Number.isFinite(delta) || delta === 0) throw new ErpError("Enter a valid quantity");
      const next = p.qty + delta;
      if (next < 0) throw new ErpError(`Not enough stock for ${p.name} (available ${p.qty})`);
      s.movements.unshift({ id: uid(), at: Date.now(), type, productId, qty: delta, prev: p.qty, next, reason, source, user });
      p.qty = next;
    },
  };
}

function currentUser() {
  try { const a = JSON.parse(localStorage.getItem("shopbook.account") || "null"); return a?.shopName ? `Admin` : "Admin"; } catch { return "Admin"; }
}

export function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}

// ---------- Shared product search (Inventory, Sales, POS, Purchases) ----------
export function searchProducts(s: ErpState, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return s.products;
  return s.products.filter((p) => [p.name, p.sku, p.barcode].some((v) => v?.toLowerCase().includes(t)));
}
export const findByCode = (s: ErpState, code: string) =>
  s.products.find((p) => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase());

export function stockStatus(p: Product): "OK" | "LOW" | "OUT" {
  if (p.qty <= 0) return "OUT";
  if (p.qty <= (p.minStock ?? 5)) return "LOW";
  return "OK";
}

// ---------- Inventory actions ----------
export type NewProduct = Omit<Product, "id" | "createdAt">;
export const addProduct = (input: NewProduct) => commit((s, c) => {
  if (!input.name.trim()) throw new ErpError("Product name is required");
  if (input.buy < 0 || input.sell < 0 || input.qty < 0) throw new ErpError("Prices and quantity can't be negative");
  if (input.barcode && s.products.some((p) => p.barcode === input.barcode)) throw new ErpError("Barcode already used by another product");
  const suppliedSku = input.sku;
  if (suppliedSku && s.products.some((p) => p.sku?.toLowerCase() === suppliedSku.toLowerCase())) throw new ErpError("SKU already used");
  const sku = input.sku || c.nextRef("SKU").replace("SKU-0000", "SKU-");
  const p: Product = { ...input, qty: 0, sku, id: uid(), createdAt: Date.now() };
  s.products.unshift(p);
  if (input.qty > 0) c.move(p.id, "OPENING", input.qty, "Opening stock");
  c.audit("PRODUCT CREATED", `${p.name} (${sku})`);
  return p;
});

export const updateProduct = (id: string, patch: Partial<Omit<Product, "qty" | "id">>) => commit((s, c) => {
  const p = s.products.find((x) => x.id === id); if (!p) throw new ErpError("Product not found");
  Object.assign(p, patch); c.audit("PRODUCT EDITED", p.name);
});

export const deleteProduct = (id: string) => commit((s, c) => {
  const p = s.products.find((x) => x.id === id); if (!p) return;
  if (s.transfers.some((t) => t.productId === id && (t.status === "PENDING" || t.status === "SENT"))) throw new ErpError("Product has an open transfer");
  s.products = s.products.filter((x) => x.id !== id); c.audit("PRODUCT DELETED", p.name);
});

export const stockIn = (productId: string, qty: number, reason: string) => commit((_s, c) => {
  if (qty <= 0) throw new ErpError("Quantity must be more than 0");
  c.move(productId, reason === "Purchase" ? "PURCHASE" : reason === "Return" ? "RETURN" : "STOCK IN", qty, reason, c.nextRef("SI"));
  c.audit("STOCK IN", `+${qty} • ${reason}`);
});

export const stockOut = (productId: string, qty: number, reason: string) => commit((_s, c) => {
  if (qty <= 0) throw new ErpError("Quantity must be more than 0");
  c.move(productId, "STOCK OUT", -qty, reason, c.nextRef("SO"));
  c.audit("STOCK OUT", `-${qty} • ${reason}`);
});

export const adjustStock = (productId: string, counted: number, reason: string) => commit((s, c) => {
  const p = s.products.find((x) => x.id === productId); if (!p) throw new ErpError("Product not found");
  if (!reason.trim()) throw new ErpError("A reason is required");
  if (counted < 0) throw new ErpError("Counted stock can't be negative");
  const delta = counted - p.qty; if (delta === 0) throw new ErpError("Counted stock matches the system");
  const prev = p.qty;
  c.move(productId, "ADJUSTMENT", delta, reason, c.nextRef("ADJ"));
  c.audit("STOCK ADJUSTMENT", `${p.name} • Previous ${prev} • Adjustment ${delta > 0 ? "+" : ""}${delta} • New ${counted} • ${reason}`);
});

// Transfers: stock leaves on SEND, arrives (to the other shop) on RECEIVE, returns on CANCEL.
export const createTransfer = (productId: string, qty: number, to: string, from: string) => commit((s, c) => {
  if (qty <= 0) throw new ErpError("Quantity must be more than 0");
  if (!to.trim()) throw new ErpError("Choose a destination shop");
  const t: Transfer = { id: uid(), ref: c.nextRef("TR"), productId, qty, from, to: to.trim(), status: "PENDING", at: Date.now(), user: c.user };
  s.transfers.unshift(t); c.audit("TRANSFER CREATED", `${t.ref} • ${qty} → ${t.to}`); return t;
});
export const sendTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id); if (!t || t.status !== "PENDING") throw new ErpError("Transfer can't be sent");
  c.move(t.productId, "TRANSFER OUT", -t.qty, `To ${t.to}`, t.ref); t.status = "SENT"; c.audit("TRANSFER SENT", t.ref);
});
export const receiveTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id);
  if (!t || t.status !== "SENT") throw new ErpError("Already received or not sent"); // prevents double receiving
  t.status = "RECEIVED"; c.audit("TRANSFER RECEIVED", `${t.ref} at ${t.to}`);
});
export const cancelTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id);
  if (!t || t.status === "RECEIVED" || t.status === "CANCELLED") throw new ErpError("Transfer can't be cancelled");
  if (t.status === "SENT") c.move(t.productId, "TRANSFER CANCEL", t.qty, "Transfer cancelled", t.ref);
  t.status = "CANCELLED"; c.audit("TRANSFER CANCELLED", t.ref);
});

export const addNamed = (kind: "categories" | "brands", name: string) => commit((s, c) => {
  const n = name.trim(); if (!n) throw new ErpError("Enter a name");
  if (s[kind].some((x) => x.name.toLowerCase() === n.toLowerCase())) throw new ErpError("Already exists");
  s[kind].push({ id: uid(), name: n }); c.audit(kind === "brands" ? "BRAND CREATED" : "CATEGORY CREATED", n);
});
export const renameNamed = (kind: "categories" | "brands", id: string, name: string) => commit((s) => {
  const x = s[kind].find((v) => v.id === id); if (x && name.trim()) x.name = name.trim();
});
export const removeNamed = (kind: "categories" | "brands", id: string) => commit((s) => {
  s[kind] = s[kind].filter((v) => v.id !== id);
  const key = kind === "brands" ? "brandId" : "categoryId";
  s.products.forEach((p) => { if (p[key] === id) delete p[key]; });
});

// ---------- Selling engine (shared by Sales → Billing and POS → Sell) ----------
export type CartLine = { productId: string; qty: number };
export const lineTotal = (s: ErpState, cart: CartLine[]) =>
  cart.reduce((a, l) => a + (s.products.find((p) => p.id === l.productId)?.sell ?? 0) * l.qty, 0);
export const methodOf = (pay: Record<Method, number>) => {
  const used = METHODS.filter((m) => pay[m] > 0);
  return used.length > 1 ? "Mixed" : used[0] ? METHOD_LABEL[used[0]] : "—";
};

export const confirmSale = (input: { cart: CartLine[]; discount: number; pay: Record<Method, number>; customerId?: string | undefined; channel: "POS" | "Sales" }) => commit((s, c) => {
  if (!input.cart.length) throw new ErpError("Cart is empty");
  const items: SaleItem[] = input.cart.map((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    if (!p) throw new ErpError("Product not found");
    if (!(l.qty > 0)) throw new ErpError(`Invalid quantity for ${p.name}`);
    if (l.qty > p.qty) throw new ErpError(`Insufficient stock: ${p.name} (available ${p.qty})`);
    return { productId: p.id, name: p.name, qty: l.qty, price: p.sell, cost: p.buy, returned: 0 };
  });
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const discount = Math.round(input.discount * 100) / 100;
  if (discount < 0 || discount > subtotal) throw new ErpError("Discount can't exceed the subtotal");
  const total = subtotal - discount;
  if (METHODS.some((m) => !(input.pay[m] >= 0))) throw new ErpError("Payment amounts can't be negative");
  const allocated = METHODS.reduce((a, m) => a + input.pay[m], 0);
  if (allocated > total + 0.001) throw new ErpError("Payments exceed the total");
  if (allocated < total - 0.001) throw new ErpError("Allocate the full total (use Credit for the unpaid part)");
  const cust = input.customerId ? s.customers.find((x) => x.id === input.customerId) : undefined;
  if (input.pay.credit > 0 && !cust) throw new ErpError("Credit needs a registered customer");
  const ref = c.nextRef("S");
  items.forEach((i) => c.move(i.productId, "SALE", -i.qty, "Sale", ref));
  (["cash", "mpesa", "bank"] as Method[]).forEach((m) => { if (input.pay[m] > 0) s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: m, amount: input.pay[m], kind: "SALE", source: ref, customerId: cust?.id, user: c.user }); });
  if (cust && input.pay.credit > 0) cust.balance += input.pay.credit;
  const sale: Sale = { id: uid(), ref, at: Date.now(), items, subtotal, discount, total, pay: { ...input.pay }, customerId: cust?.id, cashier: c.user, channel: input.channel };
  s.sales.unshift(sale);
  c.audit("SALE", `${ref} • ${total}${cust ? ` • ${cust.name}` : ""}`);
  return sale;
});

export const addCustomer = (name: string, phone?: string) => commit((s, c) => {
  const n = name.trim(); if (!n) throw new ErpError("Enter a customer name");
  if (n.length > 100) throw new ErpError("Name is too long");
  const cu: Customer = { id: uid(), name: n, phone: phone?.trim() || undefined, balance: 0, createdAt: Date.now() };
  s.customers.unshift(cu); c.audit("CUSTOMER CREATED", n); return cu;
});

export const receiveDebt = (customerId: string, amount: number, method: Method) => commit((s, c) => {
  const cu = s.customers.find((x) => x.id === customerId); if (!cu) throw new ErpError("Customer not found");
  if (method === "credit") throw new ErpError("Choose Cash, M-Pesa or Bank");
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > cu.balance + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  cu.balance -= amount;
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount, kind: "DEBT", source: cu.name, customerId, user: c.user });
  c.audit("DEBT PAYMENT", `${cu.name} • ${amount}`);
});

/** Partial returns supported; the original sale stays intact apart from the returned counter. */
export const returnSale = (saleId: string, lines: { productId: string; qty: number }[], refund: Method) => commit((s, c) => {
  const sale = s.sales.find((x) => x.id === saleId); if (!sale) throw new ErpError("Sale not found");
  const picked = lines.filter((l) => l.qty > 0); if (!picked.length) throw new ErpError("Choose items to return");
  const ratio = sale.subtotal ? sale.total / sale.subtotal : 1;
  const ref = c.nextRef("RET");
  const items = picked.map((l) => {
    const it = sale.items.find((i) => i.productId === l.productId); if (!it) throw new ErpError("Item not in sale");
    if (l.qty > it.qty - it.returned) throw new ErpError(`Only ${it.qty - it.returned} of ${it.name} can be returned`);
    it.returned += l.qty;
    if (s.products.some((p) => p.id === it.productId)) c.move(it.productId, "RETURN", l.qty, `Return of ${sale.ref}`, ref);
    return { productId: it.productId, name: it.name, qty: l.qty, amount: Math.round(l.qty * it.price * ratio * 100) / 100 };
  });
  const amount = items.reduce((a, i) => a + i.amount, 0);
  const cust = sale.customerId ? s.customers.find((x) => x.id === sale.customerId) : undefined;
  if (refund === "credit") {
    if (!cust) throw new ErpError("Customer credit needs a registered customer");
    cust.balance = Math.round((cust.balance - amount) * 100) / 100; // reduces debt or creates credit in the customer's favour
  } else {
    s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: refund, amount: -amount, kind: "REFUND", source: ref, customerId: cust?.id, user: c.user });
  }
  s.returns.unshift({ id: uid(), ref, at: Date.now(), saleId, saleRef: sale.ref, items, amount, refund, user: c.user });
  c.audit("SALES RETURN", `${ref} for ${sale.ref} • ${amount}`);
});

// ---------- POS cash drawer ----------
export function cashSession(s: ErpState) {
  const lastUp = s.cash.find((e) => e.type === "CASH UP")?.at ?? 0;
  const ev = s.cash.filter((e) => e.at > lastUp);
  const opening = ev.filter((e) => e.type === "OPENING").reduce((a, e) => a + e.amount, 0);
  const cin = ev.filter((e) => e.type === "CASH IN").reduce((a, e) => a + e.amount, 0);
  const cout = ev.filter((e) => e.type === "CASH OUT").reduce((a, e) => a + e.amount, 0);
  const cashPay = s.payments.filter((p) => p.at > lastUp && p.method === "cash");
  const sales = cashPay.filter((p) => p.kind !== "REFUND").reduce((a, p) => a + p.amount, 0);
  const refunds = -cashPay.filter((p) => p.kind === "REFUND").reduce((a, p) => a + p.amount, 0);
  return { opening, cin, cout, sales, refunds, expected: opening + sales - refunds + cin - cout, since: lastUp };
}
export const cashEvent = (type: "OPENING" | "CASH IN" | "CASH OUT", amount: number, note?: string) => commit((s, c) => {
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (type === "CASH OUT" && amount > cashSession(s).expected) throw new ErpError("Not enough cash in the drawer");
  s.cash.unshift({ id: uid(), at: Date.now(), type, amount, note: note?.trim() || undefined, user: c.user });
  c.audit(type, String(amount));
});
export const cashUp = (counted: number) => commit((s, c) => {
  if (!(counted >= 0)) throw new ErpError("Enter the counted cash");
  const expected = cashSession(s).expected;
  s.cash.unshift({ id: uid(), at: Date.now(), type: "CASH UP", amount: counted - expected, expected, counted, user: c.user });
  c.audit("CASH UP", `Expected ${expected} • Counted ${counted}`);
});
