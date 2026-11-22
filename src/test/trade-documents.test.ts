// Trade features 5-8: lay-by, quotations, bale/carcass/sack breakdown, prescriptions & controlled drugs.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { journal } from "@/lib/accounting";
import { cancelLayby, collectLayby, laybyBalance, laybyDepositsHeld, payLayby, startLayby } from "@/lib/layby";
import { cancelQuotation, convertQuotation, createQuotation, QUOTE_DAYS, quoteExpired, quotationText } from "@/lib/quotations";
import { breakDown, previewBreakdown } from "@/lib/breakdown";
import { checkRx, controlledRegister, sellWithPrescription } from "@/lib/prescriptions";
import { diffRecords, HELD_ON_DEVICE } from "@/lib/outbox";
import { FEATURE_GROUPS, featureEntry } from "@/lib/trade-features";

const credit = (account: string) => Math.round(journal(erp.load()).flatMap((e) => e.lines).filter((l) => l.account === account).reduce((a, l) => a + l.credit - l.debit, 0) * 100) / 100;
const debit = (account: string) => -credit(account);
const qty = (id: string) => erp.load().products.find((p) => p.id === id)!.qty;
const cash = (n: number): erp.PayRecord => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });
let sofa: erp.Product, bale: erp.Product, jacket: erp.Product, tshirt: erp.Product, amox: erp.Product, morphine: erp.Product, cust: erp.Customer;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
  sofa = erp.addProduct({ name: "Sofa", buy: 20000, sell: 30000, qty: 3, unit: "pcs" });
  bale = erp.addProduct({ name: "Mitumba bale", buy: 12000, sell: 0, qty: 2, unit: "pcs" });
  jacket = erp.addProduct({ name: "Jacket", buy: 0, sell: 500, qty: 0, unit: "pcs" });
  tshirt = erp.addProduct({ name: "T-shirt", buy: 0, sell: 100, qty: 0, unit: "pcs" });
  amox = erp.addProduct({ name: "Amoxicillin", buy: 50, sell: 120, qty: 40, unit: "pcs", rx: "prescription" });
  morphine = erp.addProduct({ name: "Morphine", buy: 200, sell: 400, qty: 10, unit: "pcs", rx: "controlled" });
  cust = erp.addCustomer("Asha", "0711000000");
});

describe("5 · lay-by", () => {
  it("keeps the goods aside, takes part payments, and the customer collects when paid", () => {
    const l = startLayby({ customerId: cust.id, cart: [{ productId: sofa.id, qty: 1 }], deposit: 10000, method: "cash" });
    expect(qty(sofa.id)).toBe(2);
    expect(laybyBalance(l)).toBe(20000);
    expect(credit("laybyDeposits")).toBe(10000);
    expect(credit("sales")).toBe(0);
    expect(() => collectLayby(l.id)).toThrow(/still to pay/);
    payLayby(l.id, 15000, "mpesa");
    expect(() => payLayby(l.id, 6000, "cash")).toThrow(/Only 5000/);
    payLayby(l.id, 5000, "cash");
    const sale = collectLayby(l.id);
    expect(sale.total).toBe(30000);
    expect(sale.pay).toMatchObject({ cash: 15000, mpesa: 15000, credit: 0 });
    expect(qty(sofa.id)).toBe(2);
    expect(erp.load().laybys[0]).toMatchObject({ status: "collected", saleRef: sale.ref });
    // Money counted once: deposits held back to 0, sales 30000, cash and M-Pesa 15000 each.
    expect(credit("laybyDeposits")).toBe(0);
    expect(credit("sales")).toBe(30000);
    expect(debit("cash")).toBe(15000);
    expect(debit("mpesa")).toBe(15000);
    expect(erp.cashSession(erp.load()).expected).toBe(15000);
  });
  it("cancelled: goods back, paid back minus the owner's fee, the fee becomes income", () => {
    const l = startLayby({ customerId: cust.id, cart: [{ productId: sofa.id, qty: 1 }], deposit: 10000, method: "cash" });
    const r = cancelLayby(l.id, "cash", 10);
    expect(r).toEqual({ refund: 9000, fee: 1000 });
    expect(qty(sofa.id)).toBe(3);
    expect(credit("laybyDeposits")).toBe(0);
    expect(credit("laybyFees")).toBe(1000);
    expect(debit("cash")).toBe(1000);
    expect(laybyDepositsHeld(erp.load())).toBe(0);
  });
  it("needs a customer, and a deposit no larger than the total", () => {
    expect(() => startLayby({ customerId: "x", cart: [{ productId: sofa.id, qty: 1 }], deposit: 1, method: "cash" })).toThrow(/customer/);
    expect(() => startLayby({ customerId: cust.id, cart: [{ productId: sofa.id, qty: 1 }], deposit: 40000, method: "cash" })).toThrow(/more than the total/);
  });
});

describe("6 · quotations", () => {
  it("prices goods for 14 days, changes nothing, and turns into a sale at the quoted prices", () => {
    const q = createQuotation({ cart: [{ productId: sofa.id, qty: 2, price: 28000 }], customerId: cust.id });
    expect(q.validUntil - q.at).toBe(QUOTE_DAYS * 86_400_000);
    expect(q.total).toBe(56000);
    expect(qty(sofa.id)).toBe(3);
    expect(erp.load().payments).toHaveLength(0);
    expect(quotationText(erp.load(), q, "Kifaru", (n) => `KSh ${n}`, (x) => x)).toContain("Sofa  2 × KSh 28000 = KSh 56000");
    const sale = convertQuotation(q.id, { method: "credit" });
    expect(sale.items[0]).toMatchObject({ qty: 2, price: 28000 });
    expect(qty(sofa.id)).toBe(1);
    expect(erp.load().quotations[0]).toMatchObject({ status: "converted", saleRef: sale.ref });
    expect(() => convertQuotation(q.id, { method: "cash" })).toThrow(/not open/);
  });
  it("can be cancelled, and is marked expired after its date", () => {
    const q = createQuotation({ cart: [{ productId: sofa.id, qty: 1 }], customerName: "Walk-in" });
    expect(quoteExpired(q, q.validUntil + 1)).toBe(true);
    cancelQuotation(q.id);
    expect(erp.load().quotations[0]?.status).toBe("cancelled");
    expect(() => convertQuotation(q.id, { method: "cash" })).toThrow(/not open/);
  });
  it("credit needs a registered customer", () => {
    const q = createQuotation({ cart: [{ productId: sofa.id, qty: 1 }], customerName: "Walk-in" });
    expect(() => convertQuotation(q.id, { method: "credit" })).toThrow(/registered customer/);
  });
});

describe("7 · breakdown", () => {
  it("opens a bale into pieces and spreads its cost by selling value", () => {
    const p = previewBreakdown(erp.load(), bale.id, 1, [{ productId: jacket.id, qty: 20 }, { productId: tshirt.id, qty: 100 }]);
    expect(p.cost).toBe(12000);
    // Jackets are 10000 of 20000 selling value: half the cost over 20 jackets = 300 each; T-shirts 6000 / 100 = 60.
    expect(p.lines.map((l) => [l.name, l.unitCost])).toEqual([["Jacket", 300], ["T-shirt", 60]]);
    const r = breakDown(bale.id, 1, [{ productId: jacket.id, qty: 20 }, { productId: tshirt.id, qty: 100 }], "4 kg rags");
    expect(r.ref).toMatch(/^BRK/);
    expect([qty(bale.id), qty(jacket.id), qty(tshirt.id)]).toEqual([1, 20, 100]);
    expect(erp.load().products.find((x) => x.id === jacket.id)?.buy).toBe(300);
  });
  it("averages the cost with stock already there", () => {
    erp.stockIn(jacket.id, 10, "Stock In", 400);
    breakDown(bale.id, 1, [{ productId: jacket.id, qty: 20 }, { productId: tshirt.id, qty: 100 }]);
    expect(erp.load().products.find((x) => x.id === jacket.id)?.buy).toBeCloseTo((10 * 400 + 20 * 300) / 30, 3);
  });
  it("refuses an output that is the item itself, or more than is in stock", () => {
    expect(() => breakDown(bale.id, 1, [{ productId: bale.id, qty: 1 }])).toThrow(/can't be the item/);
    expect(() => breakDown(bale.id, 5, [{ productId: jacket.id, qty: 1 }])).toThrow(/Insufficient stock/);
  });
});

describe("8 · prescriptions & controlled drugs", () => {
  it("won't sell a prescription-only product without the prescription", () => {
    expect(checkRx({ patient: "", prescriber: "Dr Otieno" })).toMatch(/patient/);
    expect(() => sellWithPrescription({ cart: [{ productId: amox.id, qty: 2 }], discount: 0, pay: cash(240), channel: "POS" }, undefined)).toThrow(/patient/);
    expect(erp.load().sales).toHaveLength(0); // nothing is saved when the prescription is missing
  });
  it("keeps the prescription with the sale, and controlled drugs go in the register", () => {
    const sale = sellWithPrescription({ cart: [{ productId: amox.id, qty: 2 }, { productId: morphine.id, qty: 1 }, { productId: sofa.id, qty: 1 }], discount: 0, pay: cash(30640), channel: "POS" },
      { patient: "John Kamau", prescriber: "Dr Otieno, KNH", number: "RX-551" });
    const rx = erp.load().prescriptions[0]!;
    expect(rx).toMatchObject({ saleRef: sale.ref, patient: "John Kamau", number: "RX-551" });
    expect(rx.items.map((i) => [i.name, i.controlled])).toEqual([["Amoxicillin", false], ["Morphine", true]]);
    expect(controlledRegister(erp.load())).toEqual([expect.objectContaining({ product: "Morphine", qty: 1, patient: "John Kamau", saleRef: sale.ref })]);
  });
  it("a sale without such products needs no prescription", () => {
    expect(sellWithPrescription({ cart: [{ productId: sofa.id, qty: 1 }], discount: 0, pay: cash(30000), channel: "POS" }, undefined).total).toBe(30000);
    expect(erp.load().prescriptions).toHaveLength(0);
  });
});

describe("all features are built, and the new documents stay on the device until the server takes them", () => {
  it("no feature is Coming soon any more", () => {
    expect(FEATURE_GROUPS.flatMap((g) => g.features).every((id) => featureEntry(id).built)).toBe(true);
  });
  it("lay-bys, quotations and prescriptions never go to the server yet; their money and stock do", () => {
    const before = erp.load();
    startLayby({ customerId: cust.id, cart: [{ productId: sofa.id, qty: 1 }], deposit: 1000, method: "cash" });
    createQuotation({ cart: [{ productId: sofa.id, qty: 1 }] });
    const changes = diffRecords(before, erp.load());
    expect(changes.some((c) => HELD_ON_DEVICE.includes(c.collection))).toBe(false);
    expect(changes.map((c) => c.collection)).toEqual(expect.arrayContaining(["payments", "movements", "products"]));
  });
});
