// Wholesale & retail prices (Settings › Features). A product may have a wholesale price from a set quantity ("6 and above at
// KSh 50"). At the till:
//   - a line at or above that quantity, or any line for a wholesale customer, gets the wholesale price by itself;
//   - below it the line keeps the retail price, and the cashier may choose the wholesale price for it (or type any price);
//   - a price the cashier typed (or an amount in KSh) is never changed.
// The price is set on the cart line with a reason, so the sale, receipt, reports and staff sales on the server all record what
// was charged, and the selling engine audits it like any other price ("PRICE OVERRIDE … • Wholesale price").
import { roundQty, type CartLine, type Customer, type ErpState, type Product } from "@/lib/erp";

/** Set by the till when the quantity or the customer qualifies; taken off again when they no longer do. */
export const WHOLESALE_AUTO = "Wholesale price";
/** Chosen by the cashier for a line below the wholesale quantity; kept like a typed price. */
export const WHOLESALE_CHOSEN = "Wholesale price (chosen)";

/** A usable wholesale setting: a price above zero from a quantity of at least 1. */
export function wholesaleOf(p: Pick<Product, "wholesale"> | undefined) {
  const w = p?.wholesale;
  return w && w.price > 0 && w.from >= 1 ? w : undefined;
}

/** Whether this line, for this customer, qualifies for the wholesale price by itself. */
export function qualifies(p: Product, qty: number, customer?: Pick<Customer, "wholesale">): boolean {
  const w = wholesaleOf(p);
  return !!w && (!!customer?.wholesale || roundQty(qty) >= w.from);
}

/** How many more of a product make the line wholesale (0 when it already is, or has no wholesale price). */
export function moreForWholesale(p: Product, qty: number, customer?: Pick<Customer, "wholesale">): number {
  const w = wholesaleOf(p);
  if (!w || qualifies(p, qty, customer)) return 0;
  return roundQty(w.from - qty);
}

/** The cart with each line's wholesale price applied or taken off. Lines the cashier priced by hand are left as they are. */
export function applyPriceLevels(s: Pick<ErpState, "products">, cart: CartLine[], on: boolean, customer?: Pick<Customer, "wholesale">): CartLine[] {
  return cart.map((line) => {
    const auto = line.priceReason === WHOLESALE_AUTO;
    if (line.price !== undefined && !auto) return line; // typed price, KSh amount or a chosen wholesale price
    const p = s.products.find((x) => x.id === line.productId);
    const w = on && p ? wholesaleOf(p) : undefined;
    if (p && w && qualifies(p, line.qty, customer)) return auto && line.price === w.price ? line : { ...line, price: w.price, priceReason: WHOLESALE_AUTO };
    if (!auto) return line;
    const { price: _price, priceReason: _reason, ...retail } = line;
    return retail;
  });
}

/** The cashier chooses the wholesale price for a line below the wholesale quantity. */
export function chooseWholesale(p: Product, line: CartLine): CartLine {
  const w = wholesaleOf(p);
  return w ? { ...line, price: w.price, priceReason: WHOLESALE_CHOSEN } : line;
}

/** Whether a line is being charged the wholesale price (by itself or chosen). */
export const isWholesaleLine = (line: CartLine) => line.priceReason === WHOLESALE_AUTO || line.priceReason === WHOLESALE_CHOSEN;
