// Day-to-day helpers (owner, 2026-11-23): close the day per counter, automatic supplier orders, expiry alerts, barcode labels and
// receipt QR links. Reading helpers only, except `assignBarcodes`, which saves new barcodes through the normal `updateProduct`.
import * as erp from "@/lib/erp";
import { expiringStock } from "@/lib/batches";
import { orderMessage, reorderSuggestions, type Reorder } from "@/lib/shop-tools";

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/* ---------- 6. Close the day ---------- */
export type DayClose = { sales: number; total: number; byMethod: [string, number][]; expected: number; opening: number };
/** Today's figures for the active shop and the chosen counter: sales, money by method, and the cash the drawer should hold. */
export function dayAtCounter(s: erp.ErpState, counter = erp.activeCounter(s), now = new Date()): DayClose {
  const from = startOfDay(now), shop = erp.activeShop(s);
  const at = <T extends { locationId?: string | undefined; counter?: number | undefined }>(x: T) => (!shop || (x.locationId ?? erp.MAIN_LOCATION) === shop) && (x.counter ?? 1) === counter;
  const sales = s.sales.filter((x) => x.at >= from && at(x));
  const byMethod = new Map<string, number>();
  for (const p of s.payments) if (p.at >= from && at(p) && (p.kind === "SALE" || p.kind === "REFUND")) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
  const cs = erp.cashSession(s, counter);
  return { sales: sales.length, total: sales.reduce((a, x) => a + x.total, 0), byMethod: [...byMethod.entries()].filter(([, v]) => Math.abs(v) > 0.001), expected: cs.expected, opening: cs.opening };
}
export function closeDayText(o: { business: string; counter: number; day: DayClose; counted: number; label: (m: string) => string; money: (n: number) => string; tr: (x: string) => string; when?: Date }) {
  const { tr, money, day } = o, diff = o.counted - day.expected;
  return [
    `${o.business} · ${tr("Day closed")} · ${(o.when ?? new Date()).toLocaleDateString("en-GB")} · ${tr("Counter")} ${o.counter}`,
    `${tr("Sales")}: ${day.sales} · ${money(day.total)}`,
    ...day.byMethod.map(([m, v]) => `${o.label(m)}: ${money(v)}`),
    `${tr("Expected cash")}: ${money(day.expected)}`,
    `${tr("Counted cash")}: ${money(o.counted)}`,
    `${tr(diff === 0 ? "Cash is correct" : diff > 0 ? "Cash over by" : "Cash short by")}${diff === 0 ? "" : `: ${money(Math.abs(diff))}`}`,
  ].join("\n");
}

/* ---------- 2. Automatic supplier orders ---------- */
export type SupplierOrder = { supplier: string; phone: string; lines: Reorder[]; text: string };
/** Products at or below their reorder level, grouped by a supplier that has a phone number, with the order message. */
export function supplierOrdersDue(s: erp.ErpState, business: string, tr: (x: string) => string): SupplierOrder[] {
  const low = new Set(s.products.filter((p) => erp.stockStatus(p) !== "OK").map((p) => p.id));
  const groups = new Map<string, Reorder[]>();
  for (const r of reorderSuggestions(s)) if (low.has(r.product.id) && r.supplier && r.order > 0) groups.set(r.supplier, [...(groups.get(r.supplier) ?? []), r]);
  return [...groups.entries()].flatMap(([supplier, lines]) => {
    const phone = s.suppliers.find((x) => x.name === supplier)?.phone?.trim();
    return phone ? [{ supplier, phone, lines, text: orderMessage(lines, business, tr) }] : [];
  });
}

/* ---------- 5. Expiry alerts ---------- */
export function expiryAlertText(s: erp.ErpState, business: string, tr: (x: string) => string, days = 30) {
  const rows = expiringStock(s, days).filter((r) => r.daysLeft >= 0);
  if (!rows.length) return "";
  return [`${business}: ${tr("Expiring within 30 days")}`, ...rows.slice(0, 15).map((r) => `- ${r.name}${r.batch ? ` (${r.batch})` : ""} · ${r.qty} ${r.unit} · ${r.expiry} · ${r.daysLeft} ${tr("days")}`)].join("\n");
}

/* ---------- 3. Barcode labels ---------- */
/** EAN-13 check digit for 12 digits. */
export function eanCheck(d12: string) {
  const sum = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}
/** A new in-store barcode (EAN-13 starting 20, the range kept for a shop's own codes) not used by any product. */
export function newBarcode(s: Pick<erp.ErpState, "products">, seed = Date.now()) {
  const used = new Set(s.products.map((p) => p.barcode).filter(Boolean));
  for (let n = 0; n < 1000; n++) {
    const body = `20${String((seed + n * 7919) % 1e10).padStart(10, "0")}`, code = body + eanCheck(body);
    if (!used.has(code)) return code;
  }
  throw new erp.ErpError("Could not make a new barcode");
}
/** Gives every chosen product without a barcode its own new one (saved through updateProduct). Returns how many were given. */
export function assignBarcodes(ids: readonly string[]) {
  let n = 0;
  for (const id of ids) {
    const s = erp.load(), p = s.products.find((x) => x.id === id);
    if (!p || p.barcode) continue;
    erp.updateProduct(id, { barcode: newBarcode(s, Date.now() + n) }); n++;
  }
  return n;
}

// Code 128 (set B), drawn as SVG bars: widths of each symbol's 6 bars/spaces (plus the 7-module stop).
const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
/** The bar pattern for a text in Code 128 B: a list of [isBar, modules]. Characters outside printable ASCII become "?". */
export function code128(text: string): [boolean, number][] {
  const vals = [...text].map((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c - 32 : 31; });
  const check = (104 + vals.reduce((a, v, i) => a + v * (i + 1), 0)) % 103;
  const out: [boolean, number][] = [];
  for (const code of [104, ...vals, check, 106]) [...C128[code]!].forEach((w, i) => out.push([i % 2 === 0, Number(w)]));
  return out;
}

/* ---------- 4. Receipt QR ---------- */
/** The online shop link printed as a QR code on receipts, when the owner has published one (settings `shopLink`). */
export const shopLinkUrl = (slug: string | undefined, origin: string) => (slug ? `${origin.replace(/\/$/, "")}/shop/${slug}` : "");
