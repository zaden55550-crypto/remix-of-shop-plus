// Batches and expiry dates (Trade feature "expiry", trade-features.ts). Stock still changes only through movements (erp.ts):
// a purchase or stock-in line may carry a batch and an expiry date, and an expired write-off is a Stock Out with that lot.
//
// What is left of each batch is worked out from the movements, never stored, so selling, returns, transfers and an employee's
// offline sales stay exactly as they are. The rule is "earliest expiry sells first": the product's whole stock is shared out
// to its batches starting from the one that expires last, so whatever has gone (sold, moved, written off without a lot) has
// come from the earliest-expiring batches and from stock that was bought without a lot. A product's stock is counted across
// all its locations (Product.qty), because transfers move stock between locations without changing what will expire.
import { commit, ErpError, roundQty, type ErpState, type Movement, type Product } from "@/lib/erp";

export type BatchStock = { batch: string; expiry: string; qty: number };
export type ExpiryRow = BatchStock & { productId: string; name: string; unit: string; daysLeft: number; value: number };

const IN_TYPES = new Set<Movement["type"]>(["OPENING", "PURCHASE", "STOCK IN"]);
const lotKey = (m: { batch?: string | undefined; expiry?: string | undefined }) => `${m.expiry ?? ""}|${m.batch ?? ""}`;

/** The batches of one product still in stock, earliest expiry first. Stock bought without an expiry date isn't listed. */
export function productBatches(s: Pick<ErpState, "movements">, p: Pick<Product, "id" | "qty">): BatchStock[] {
  const lots = new Map<string, BatchStock & { room: number }>();
  for (const m of s.movements) {
    if (m.productId !== p.id || !m.expiry) continue;
    const k = lotKey(m), lot = lots.get(k) ?? { batch: m.batch ?? "", expiry: m.expiry, qty: 0, room: 0 };
    // Stock that came in with this lot, less what was written off from this lot by name.
    if (m.qty > 0 && IN_TYPES.has(m.type)) lot.room += m.qty;
    else if (m.qty < 0) lot.room += m.qty;
    lots.set(k, lot);
  }
  let left = Math.max(0, p.qty);
  const latestFirst = [...lots.values()].sort((a, b) => b.expiry.localeCompare(a.expiry) || b.batch.localeCompare(a.batch));
  for (const lot of latestFirst) { const take = Math.min(Math.max(0, roundQty(lot.room)), left); lot.qty = roundQty(take); left = roundQty(left - take); }
  return latestFirst.filter((l) => l.qty > 0).reverse().map(({ batch, expiry, qty }) => ({ batch, expiry, qty }));
}

/** Whole days from `today` (YYYY-MM-DD, local) to the expiry date: 0 is today, negative has expired. */
export function daysUntil(expiry: string, today = localDay()) {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
export const localDay = (at = Date.now()) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Every batch in stock that has expired or expires within `days`, soonest first, valued at the buying price. Archived products are left out. */
export function expiringStock(s: Pick<ErpState, "movements" | "products">, days = 30, today = localDay()): ExpiryRow[] {
  const withLots = new Set(s.movements.filter((m) => m.expiry).map((m) => m.productId));
  const out: ExpiryRow[] = [];
  for (const p of s.products) {
    if (!withLots.has(p.id) || p.archived) continue;
    for (const b of productBatches(s, p)) {
      const daysLeft = daysUntil(b.expiry, today);
      if (daysLeft <= days) out.push({ ...b, productId: p.id, name: p.name, unit: p.unit ?? "", daysLeft, value: Math.round(b.qty * p.buy * 100) / 100 });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

/** Expired and expiring-soon counts for alerts. */
export function expirySummary(s: Pick<ErpState, "movements" | "products">, days = 30, today = localDay()) {
  const rows = expiringStock(s, days, today);
  const expired = rows.filter((r) => r.daysLeft < 0);
  return { expired: expired.length, expiredValue: expired.reduce((a, r) => a + r.value, 0), soon: rows.length - expired.length };
}

/** Takes what is left of one batch out of stock as a Stock Out with its lot (reason "Expired"), so the books and the batch list
 *  both show it. `qty` defaults to everything left of that batch. The stock leaves the shared pool the shops sell from. */
export const writeOffBatch = (productId: string, batch: string, expiry: string, qty?: number, reason = "Expired") => commit((s, c) => {
  const p = s.products.find((x) => x.id === productId);
  if (!p) throw new ErpError("Product not found");
  const lot = productBatches(s, p).find((b) => b.batch === batch && b.expiry === expiry);
  if (!lot) throw new ErpError("That batch has no stock left");
  const amount = roundQty(qty ?? lot.qty);
  if (!(amount > 0) || amount > lot.qty + 0.0005) throw new ErpError(`Only ${lot.qty} of this batch is left`);
  c.move(productId, "STOCK OUT", -amount, reason, c.nextRef("SO"), undefined, { batch: batch || undefined, expiry });
  c.audit("STOCK OUT", `${p.name} • -${amount} • ${reason}${batch ? ` • ${batch}` : ""} • ${expiry}`);
  return amount;
});
