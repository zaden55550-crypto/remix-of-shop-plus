// Gas cylinder exchange (Settings › Features). Each brand and size is two products: its full cylinders (sold at the refill
// price; a new cylinder adds the deposit) and its empty cylinders (worth nothing in stock value). At the till a refill takes
// the customer's empty in (any brand, same size) and a new cylinder holds its deposit for the customer (recordSale and the
// accounts in erp.ts / accounting.ts). Here: adding a cylinder type, paying a deposit back when a customer returns a
// cylinder, and sending empties to the supplier. Every change goes through the ERP engine (commit), so it is audited,
// synced and backed up like any other record.
import { commit, ErpError, uid, type ErpState, type Method, type Product } from "@/lib/erp";

/** The brands offered first (owners can type any other). */
export const GAS_BRANDS = ["K-Gas", "Total", "Pro Gas", "Afrigas", "Hashi", "Lake Gas", "Mpishi"] as const;
/** The usual cylinder sizes in kg (owners can type any other). */
export const GAS_SIZES = [6, 13, 50] as const;

export type GasPair = { full: Product; empty: Product; brand: string; size: number; deposit: number };
/** Every brand and size the business has, full and empty together, by brand then size. */
export function gasPairs(s: Pick<ErpState, "products">): GasPair[] {
  return s.products.filter((p) => p.gas?.kind === "full" && !p.archived).flatMap((full) => {
    const empty = s.products.find((p) => p.id === full.gas!.pairId && p.gas?.kind === "empty");
    return empty ? [{ full, empty, brand: full.gas!.brand, size: full.gas!.size, deposit: full.gas!.deposit ?? 0 }] : [];
  }).sort((a, b) => a.brand.localeCompare(b.brand) || a.size - b.size);
}
/** The empties of one size (any brand), for the till's "empty brought in" choice. */
export const emptiesOfSize = (s: Pick<ErpState, "products">, size: number) => gasPairs(s).filter((x) => x.size === size).map((x) => x.empty);

export type NewGasCylinder = { brand: string; size: number; refillPrice: number; deposit: number; refillCost?: number | undefined; full?: number | undefined; empty?: number | undefined };
/** Adds one brand and size: its full and empty cylinder products, with any cylinders already in the shop as opening stock. */
export const addGasCylinder = (input: NewGasCylinder) => commit((s, c) => {
  const brand = input.brand.trim().replace(/\s+/g, " ");
  if (!brand) throw new ErpError("Enter the gas brand");
  if (brand.length > 40) throw new ErpError("The brand name is too long");
  if (!(input.size > 0 && input.size <= 1000)) throw new ErpError("Enter the cylinder size in kg");
  if (!(input.refillPrice > 0)) throw new ErpError("Enter the refill price");
  if (!(input.deposit >= 0)) throw new ErpError("The deposit can't be negative");
  const cost = input.refillCost ?? 0, full = input.full ?? 0, empty = input.empty ?? 0;
  if (!(cost >= 0) || !(full >= 0) || !(empty >= 0) || !Number.isInteger(full) || !Number.isInteger(empty)) throw new ErpError("Enter whole numbers of cylinders and a cost of 0 or more");
  const key = (b: string) => b.toLowerCase().replace(/[\s-]/g, "");
  if (gasPairs(s).some((x) => key(x.brand) === key(brand) && x.size === input.size)) throw new ErpError(`${brand} ${input.size} kg is already set up`);
  const now = Date.now(), fullId = uid(), emptyId = uid();
  const name = `${brand} ${input.size}kg`;
  s.products.unshift(
    { id: fullId, name: `${name} Full`, unit: "pcs", qty: 0, buy: cost, sell: input.refillPrice, createdAt: now, gas: { brand, size: input.size, kind: "full", pairId: emptyId, deposit: input.deposit } },
    { id: emptyId, name: `${name} Empty`, unit: "pcs", qty: 0, buy: 0, sell: 0, createdAt: now, gas: { brand, size: input.size, kind: "empty", pairId: fullId } },
  );
  if (full > 0) c.move(fullId, "OPENING", full, "Opening stock");
  if (empty > 0) c.move(emptyId, "OPENING", empty, "Opening stock");
  c.audit("GAS CYLINDER ADDED", `${name} • refill ${input.refillPrice} • deposit ${input.deposit}`);
  return { fullId, emptyId };
});

/** Changes a brand and size's refill price and deposit. Sales already made keep the deposit they charged. */
export const updateGasPrices = (fullId: string, refillPrice: number, deposit: number) => commit((s, c) => {
  const full = s.products.find((p) => p.id === fullId && p.gas?.kind === "full");
  if (!full?.gas) throw new ErpError("Gas cylinder not found");
  if (!(refillPrice > 0) || !(deposit >= 0)) throw new ErpError("Enter a refill price above 0 and a deposit of 0 or more");
  c.audit("GAS PRICES", `${full.name} • refill ${full.sell} → ${refillPrice} • deposit ${full.gas.deposit ?? 0} → ${deposit}`);
  full.sell = refillPrice;
  full.gas = { ...full.gas, deposit };
});

/** A customer brings cylinders back for their deposit: the empties come in and the deposit is paid out (and leaves the
 *  cylinder deposits held). Returns the reference printed for the customer. */
export const refundCylinderDeposit = (emptyId: string, qty: number, method: Method, customerId?: string) => commit((s, c) => {
  const empty = s.products.find((p) => p.id === emptyId && p.gas?.kind === "empty");
  const full = empty && s.products.find((p) => p.id === empty.gas!.pairId);
  if (!empty || !full?.gas) throw new ErpError("Choose the cylinder brand and size");
  if (!(qty > 0) || !Number.isInteger(qty)) throw new ErpError("Enter a whole number of cylinders");
  if (method === "credit") throw new ErpError("Pay the deposit back from a money account");
  const amount = Math.round((full.gas.deposit ?? 0) * qty * 100) / 100;
  if (!(amount > 0)) throw new ErpError(`${full.gas.brand} ${full.gas.size} kg has no deposit to pay back`);
  const cust = customerId ? s.customers.find((x) => x.id === customerId) : undefined;
  const ref = c.nextRef("CYL");
  c.move(empty.id, "STOCK IN", qty, "Cylinder returned for its deposit", ref);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount: -amount, kind: "REFUND", source: ref, customerId: cust?.id, user: c.user, note: `Cylinder deposit • ${qty} × ${empty.name}` });
  c.audit("CYLINDER DEPOSIT RETURNED", `${ref} • ${qty} × ${empty.name} • ${amount}${cust ? ` • ${cust.name}` : ""}`);
  return { ref, amount };
});

/** Empties leave for the supplier to be refilled; the full ones come back in through a normal purchase. */
export const sendEmpties = (emptyId: string, qty: number, supplierName?: string) => commit((s, c) => {
  const empty = s.products.find((p) => p.id === emptyId && p.gas?.kind === "empty");
  if (!empty) throw new ErpError("Choose the cylinder brand and size");
  if (!(qty > 0) || !Number.isInteger(qty)) throw new ErpError("Enter a whole number of cylinders");
  c.move(empty.id, "STOCK OUT", -qty, `Empties sent to supplier${supplierName?.trim() ? ` • ${supplierName.trim()}` : ""}`, c.nextRef("SO"));
  c.audit("EMPTIES SENT", `${qty} × ${empty.name}${supplierName?.trim() ? ` • ${supplierName.trim()}` : ""}`);
});
