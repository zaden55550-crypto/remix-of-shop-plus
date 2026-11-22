// Selling by weight on screens: the unit shown beside a weighed line's quantity and price ("1.25 kg × KSh 700/kg").
// Only when the feature is on and the product is weighed (kg, g, or a shop unit of type Weight); otherwise "" and the line reads
// as before. A sale line keeps the unit it was sold in (SaleItem.unit); older sales fall back to the product's unit.
import { isWeightUnit, type ErpState } from "@/lib/erp";

export function weighedUnit(s: Pick<ErpState, "products" | "units">, productId: string, unit: string | undefined, on: boolean): string {
  if (!on) return "";
  const u = unit ?? s.products.find((p) => p.id === productId)?.unit;
  return u && isWeightUnit(u, s.units) ? u : "";
}

/** "1.25 kg × 700/kg" for a weighed line, "1 × 700" otherwise. `price` is already formatted. */
export function qtyTimesPrice(qty: number, price: string, unit: string): string {
  return unit ? `${qty} ${unit} × ${price}/${unit}` : `${qty} × ${price}`;
}
