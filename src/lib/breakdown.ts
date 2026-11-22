// Bale, carcass & sack breakdown (Settings › Features). Open one bought unit (a mitumba bale, a carcass, a 90 kg sack) into
// the pieces, cuts or kilos it gave, with any waste. The unit leaves stock and the outputs come in; its cost is spread over
// the outputs by their selling value (so a jacket that sells for more carries more of the bale's cost), and each output's
// buying price becomes the weighted average of what it had and this new stock. One ERP transaction; the record is the
// movements (source BRK…) and the audit, which sync like any other.
import { commit, ErpError, isWholeUnit, roundQty, shopStock, type ErpState } from "@/lib/erp";

export type BreakdownOutput = { productId: string; qty: number };
export type BreakdownPreview = { cost: number; lines: { productId: string; name: string; qty: number; unitCost: number; share: number; newBuy: number }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** What each output would cost per unit, before anything is saved. */
export function previewBreakdown(s: Pick<ErpState, "products" | "units">, sourceId: string, sourceQty: number, outputs: BreakdownOutput[]): BreakdownPreview {
  const src = s.products.find((p) => p.id === sourceId);
  if (!src) throw new ErpError("Choose what you are opening");
  const cost = r2(src.buy * sourceQty);
  const lines = outputs.filter((o) => o.qty > 0).map((o) => { const p = s.products.find((x) => x.id === o.productId); if (!p) throw new ErpError("Product not found"); return { p, qty: roundQty(o.qty) }; });
  // Shares by selling value; products with no selling price yet share equally per unit.
  const value = lines.reduce((a, l) => a + l.qty * l.p.sell, 0);
  return { cost, lines: lines.map((l) => {
    const share = value > 0 ? (l.qty * l.p.sell) / value : l.qty / lines.reduce((a, x) => a + x.qty, 0);
    const unitCost = r4((cost * share) / l.qty);
    const newBuy = r4((l.p.qty * l.p.buy + l.qty * unitCost) / (l.p.qty + l.qty));
    return { productId: l.p.id, name: l.p.name, qty: l.qty, unitCost, share: r4(share), newBuy };
  }) };
}

export const breakDown = (sourceId: string, sourceQty: number, outputs: BreakdownOutput[], waste?: string) => commit((s, c) => {
  const src = s.products.find((p) => p.id === sourceId);
  if (!src) throw new ErpError("Choose what you are opening");
  const qty = roundQty(sourceQty);
  if (!(qty > 0)) throw new ErpError("Enter how many you are opening");
  if (isWholeUnit(src.unit, s.units) && !Number.isInteger(qty)) throw new ErpError(`${src.name} is opened in whole ${src.unit || "pcs"} only`);
  if (qty > shopStock(s, src, c.shop) + 1e-9) throw new ErpError(`Insufficient stock: ${src.name}`);
  const out = outputs.filter((o) => o.qty > 0);
  if (!out.length) throw new ErpError("Add what it gave (pieces, cuts or kilos)");
  if (out.some((o) => o.productId === sourceId)) throw new ErpError("An output can't be the item being opened");
  if (new Set(out.map((o) => o.productId)).size !== out.length) throw new ErpError("A product is listed twice");
  for (const o of out) { const p = s.products.find((x) => x.id === o.productId); if (p && isWholeUnit(p.unit, s.units) && !Number.isInteger(roundQty(o.qty))) throw new ErpError(`${p.name} is counted in whole ${p.unit || "pcs"} only`); }
  const plan = previewBreakdown(s, sourceId, qty, out);
  const ref = c.nextRef("BRK");
  c.move(src.id, "STOCK OUT", -qty, `Opened for breakdown${waste?.trim() ? ` • waste ${waste.trim()}` : ""}`, ref);
  for (const l of plan.lines) {
    const p = s.products.find((x) => x.id === l.productId)!;
    p.buy = l.newBuy;
    c.move(p.id, "STOCK IN", l.qty, `From ${src.name} (${ref})`, ref);
  }
  c.audit("BREAKDOWN", `${ref} • ${qty} × ${src.name} (cost ${plan.cost}) → ${plan.lines.map((l) => `${l.qty} ${l.name} @ ${l.unitCost}`).join(", ")}${waste?.trim() ? ` • waste ${waste.trim()}` : ""}`);
  return { ref, ...plan };
});
