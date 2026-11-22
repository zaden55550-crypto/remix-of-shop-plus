// Prescriptions & controlled drugs (Settings › Features). A product can be prescription-only or a controlled drug
// (Product.rx). A sale with any of them needs the prescription's details (patient, prescriber, optional number and photo):
// the till won't complete without them, and they are saved with the sale in the same transaction. Controlled drugs make up
// the register (every controlled sale with its patient and prescriber), printable for inspection.
import { commit, confirmSale, ErpError, runErpTransaction, uid, type ErpState, type Prescription, type Product, type Sale, type SaleInput } from "@/lib/erp";

export type RxDetails = { patient: string; prescriber: string; number?: string | undefined; photo?: string | undefined };
/** Products in a cart that need a prescription. */
export const rxProducts = (s: Pick<ErpState, "products">, productIds: string[]): Product[] =>
  productIds.map((id) => s.products.find((p) => p.id === id)).filter((p): p is Product => !!p?.rx);

export function checkRx(d: RxDetails | undefined): string {
  if (!d?.patient.trim()) return "Enter the patient's name";
  if (!d.prescriber.trim()) return "Enter the prescriber (doctor or clinic)";
  if (d.photo && d.photo.length > 900_000) return "The prescription photo is too large";
  return "";
}

/** Sells, and keeps the prescription with the sale when the cart has prescription-only or controlled products. */
export function sellWithPrescription(input: SaleInput, rx: RxDetails | undefined): Sale {
  return runErpTransaction(() => {
    const sale = confirmSale(input);
    commit((s, c) => {
      const need = rxProducts(s, input.cart.map((l) => l.productId));
      if (!need.length) return;
      const problem = checkRx(rx);
      if (problem) throw new ErpError(problem);
      const rec: Prescription = { id: uid(), at: sale.at, saleId: sale.id, saleRef: sale.ref, patient: rx!.patient.trim(), prescriber: rx!.prescriber.trim(), user: c.user,
        items: need.map((p) => ({ productId: p.id, name: p.name, qty: input.cart.find((l) => l.productId === p.id)!.qty, controlled: p.rx === "controlled" })),
        ...(rx!.number?.trim() ? { number: rx!.number.trim() } : {}), ...(rx!.photo ? { photo: rx!.photo } : {}) };
      s.prescriptions.unshift(rec);
      c.audit(rec.items.some((i) => i.controlled) ? "CONTROLLED DRUG SOLD" : "PRESCRIPTION", `${sale.ref} • ${rec.patient} • ${rec.prescriber}${rec.number ? ` • ${rec.number}` : ""}`);
    });
    return sale;
  });
}

/** The controlled-drugs register: one row per controlled product sold, newest first. */
export function controlledRegister(s: Pick<ErpState, "prescriptions">) {
  return s.prescriptions.flatMap((r) => r.items.filter((i) => i.controlled).map((i) => ({ at: r.at, saleRef: r.saleRef, product: i.name, qty: i.qty, patient: r.patient, prescriber: r.prescriber, number: r.number, user: r.user })));
}
