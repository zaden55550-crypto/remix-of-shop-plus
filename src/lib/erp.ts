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
};

const KEY = "shopbook.erp";
const EVT = "shopbook-erp";
const empty = (): ErpState => ({ products: [], categories: [], brands: [], movements: [], transfers: [], audit: [], seq: {} });
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
  if (input.sku && s.products.some((p) => p.sku?.toLowerCase() === input.sku!.toLowerCase())) throw new ErpError("SKU already used");
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
