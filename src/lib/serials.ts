// Serial / IMEI numbers & warranty (Settings › Features). A serial-tracked product keeps one SerialUnit per unit it has had:
// in stock until a sale names it, then sold to that sale (recordSale in erp.ts checks and marks it, also for staff sales on
// the server); a return puts it back in stock. An IMEI belongs to one unit, so a serial is unique across all products.
// All changes go through the ERP engine (commit), so they are audited, synced and backed up like any other record.
import { commit, ErpError, serialKey, type Customer, type ErpState, type Product, type Sale, type SerialUnit } from "@/lib/erp";

/** The serials of a product still in stock, oldest first (the order they were added). */
export const serialsInStock = (p: Pick<Product, "serials">): SerialUnit[] => (p.serials ?? []).filter((u) => !u.sold);

/** Splits pasted or typed text into serials: one per line, or separated by commas, semicolons or tabs. */
export function parseSerials(text: string): string[] {
  return [...new Set(text.split(/[\n,;\t]+/).map(serialKey).filter(Boolean))];
}

/** Adds serials to a product. Ones already on any product are skipped and reported, so one IMEI is never two units. */
export const addSerials = (productId: string, codes: string[]) => commit((s, c) => {
  const p = s.products.find((x) => x.id === productId);
  if (!p) throw new ErpError("Product not found");
  const clean = [...new Set(codes.map(serialKey).filter(Boolean))];
  if (!clean.length) throw new ErpError("Type at least one serial / IMEI number");
  if (clean.some((x) => x.length > 64)) throw new ErpError("A serial / IMEI is too long (64 characters at most)");
  const taken = new Set(s.products.flatMap((x) => (x.serials ?? []).map((u) => serialKey(u.code))));
  const added = clean.filter((x) => !taken.has(x)), skipped = clean.filter((x) => taken.has(x));
  if (!added.length) throw new ErpError("These serials are already recorded");
  const now = Date.now();
  p.serials = [...(p.serials ?? []), ...added.map((code) => ({ code, addedAt: now }))];
  c.audit("SERIALS ADDED", `${p.name} • ${added.length}${skipped.length ? ` (skipped ${skipped.length} already recorded)` : ""}`);
  return { added, skipped };
});

/** Removes a serial typed by mistake. A sold serial stays, because a sale names it. */
export const removeSerial = (productId: string, code: string) => commit((s, c) => {
  const p = s.products.find((x) => x.id === productId);
  if (!p) throw new ErpError("Product not found");
  const key = serialKey(code), unit = p.serials?.find((u) => serialKey(u.code) === key);
  if (!unit) throw new ErpError("Serial not found");
  if (unit.sold) throw new ErpError(`${unit.code} was sold (${unit.sold.ref}) and stays on record`);
  p.serials = (p.serials ?? []).filter((u) => u !== unit);
  c.audit("SERIAL REMOVED", `${p.name} • ${unit.code}`);
});

export type SerialFound = { product: Product; unit: SerialUnit; sale?: Sale | undefined; customer?: Customer | undefined; warrantyUntil?: number | undefined };
/** Where a serial / IMEI is: its product, and if sold, the sale, the customer and the warranty end. */
export function findSerial(s: Pick<ErpState, "products" | "sales" | "customers">, code: string): SerialFound | undefined {
  const key = serialKey(code);
  if (!key) return undefined;
  for (const product of s.products) {
    const unit = product.serials?.find((u) => serialKey(u.code) === key);
    if (!unit) continue;
    const sale = unit.sold ? s.sales.find((x) => x.id === unit.sold!.saleId) : undefined;
    const item = sale?.items.find((i) => i.productId === product.id);
    const customer = sale?.customerId ? s.customers.find((x) => x.id === sale.customerId) : undefined;
    return { product, unit, sale, customer, warrantyUntil: item?.warrantyUntil };
  }
  return undefined;
}
