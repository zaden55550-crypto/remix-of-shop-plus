import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { journal } from "@/lib/accounting";
import { GAS_BRANDS, addGasCylinder, emptiesOfSize, gasPairs, refundCylinderDeposit, sendEmpties, updateGasPrices } from "@/lib/gas";
import { currentFeatures, defaultFeatures, saveFeatures } from "@/lib/trade-features";

/** An account's balance from the journal: credits minus debits (a liability or income is positive). */
const credit = (account: string) => Math.round(journal(erp.load()).flatMap((e) => e.lines).filter((l) => l.account === account).reduce((a, l) => a + l.credit - l.debit, 0) * 100) / 100;
const cash = (n: number): erp.PayRecord => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });
const qty = (id: string) => erp.load().products.find((p) => p.id === id)!.qty;
const sell = (cart: erp.CartLine[], total: number) => erp.confirmSale({ cart, discount: 0, pay: cash(total), channel: "POS", vatRate: 0 });
let kgas: { fullId: string; emptyId: string }, total: { fullId: string; emptyId: string }, big: { fullId: string; emptyId: string };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru Gas", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
  kgas = addGasCylinder({ brand: "K-Gas", size: 13, refillPrice: 3200, deposit: 3000, refillCost: 2700, full: 10, empty: 2 });
  total = addGasCylinder({ brand: "Total", size: 13, refillPrice: 3300, deposit: 3200, full: 5 });
  big = addGasCylinder({ brand: "K-Gas", size: 50, refillPrice: 11000, deposit: 9000, full: 2 });
});

describe("setting up cylinders", () => {
  it("makes a full and an empty product per brand and size, with opening stock", () => {
    expect(gasPairs(erp.load()).map((x) => `${x.brand} ${x.size} ${x.full.qty}/${x.empty.qty} ${x.deposit}`)).toEqual(["K-Gas 13 10/2 3000", "K-Gas 50 2/0 9000", "Total 13 5/0 3200"]);
    expect(erp.load().products.find((p) => p.id === kgas.emptyId)).toMatchObject({ name: "K-Gas 13kg Empty", buy: 0, sell: 0 });
  });
  it("refuses the same brand and size twice, and starts with the common Kenyan brands", () => {
    expect(() => addGasCylinder({ brand: "k gas", size: 13, refillPrice: 1, deposit: 0 })).toThrow(/already set up/);
    expect(GAS_BRANDS).toContain("K-Gas");
    expect(GAS_BRANDS).toContain("Hashi");
  });
  it("lists the empties of one size, any brand, for the till", () => {
    expect(emptiesOfSize(erp.load(), 13).map((p) => p.id).sort()).toEqual([kgas.emptyId, total.emptyId].sort());
  });
});

describe("selling at the till", () => {
  it("a refill takes the customer's empty in, even of another brand", () => {
    sell([{ productId: kgas.fullId, qty: 2, gas: { mode: "refill", emptyId: total.emptyId } }], 6400);
    expect(qty(kgas.fullId)).toBe(8);
    expect(qty(total.emptyId)).toBe(2);
    expect(qty(kgas.emptyId)).toBe(2);
  });
  it("refuses an empty of another size", () => {
    expect(() => sell([{ productId: kgas.fullId, qty: 1, gas: { mode: "refill", emptyId: big.emptyId } }], 3200)).toThrow(/must be 13 kg/);
  });
  it("a new cylinder holds its deposit for the customer, not as sales income", () => {
    const sale = sell([{ productId: kgas.fullId, qty: 1, price: 6200, priceReason: "Includes cylinder deposit", gas: { mode: "new" } }], 6200);
    expect(sale.items[0]?.gas).toEqual({ mode: "new", deposit: 3000 });
    expect(qty(kgas.emptyId)).toBe(2);
    expect(credit("cylinderDeposits")).toBe(3000);
    expect(credit("sales")).toBe(3200);
  });
  it("won't sell a new cylinder below its deposit", () => {
    expect(() => sell([{ productId: kgas.fullId, qty: 1, price: 2000, gas: { mode: "new" } }], 2000)).toThrow(/below the cylinder deposit/);
  });
  it("returning a refill gives the empty back", () => {
    const sale = sell([{ productId: kgas.fullId, qty: 1, gas: { mode: "refill", emptyId: kgas.emptyId } }], 3200);
    erp.returnSale(sale.id, [{ productId: kgas.fullId, qty: 1 }], "cash");
    expect(qty(kgas.fullId)).toBe(10);
    expect(qty(kgas.emptyId)).toBe(2);
  });
});

describe("deposits and empties", () => {
  it("a returned cylinder pays the deposit back and leaves the deposits held", () => {
    sell([{ productId: kgas.fullId, qty: 2, price: 6200, gas: { mode: "new" } }], 12400);
    const r = refundCylinderDeposit(kgas.emptyId, 1, "cash");
    expect(r.amount).toBe(3000);
    expect(r.ref).toMatch(/^CYL/);
    expect(qty(kgas.emptyId)).toBe(3);
    expect(credit("cylinderDeposits")).toBe(3000);
    expect(journal(erp.load()).some((e) => e.memo.startsWith("Cylinder deposit returned"))).toBe(true);
  });
  it("refuses a refund in whole cylinders only, or to credit", () => {
    expect(() => refundCylinderDeposit(kgas.emptyId, 1.5, "cash")).toThrow(/whole number/);
    expect(() => refundCylinderDeposit(kgas.emptyId, 1, "credit")).toThrow(/money account/);
  });
  it("empties leave for the supplier", () => {
    sendEmpties(kgas.emptyId, 2, "Kenol");
    expect(qty(kgas.emptyId)).toBe(0);
  });
  it("prices can change; sales already made keep their deposit", () => {
    const sale = sell([{ productId: kgas.fullId, qty: 1, price: 6200, gas: { mode: "new" } }], 6200);
    updateGasPrices(kgas.fullId, 3400, 3500);
    expect(erp.load().products.find((p) => p.id === kgas.fullId)).toMatchObject({ sell: 3400, gas: { deposit: 3500 } });
    expect(erp.load().sales.find((x) => x.id === sale.id)?.items[0]?.gas).toEqual({ mode: "new", deposit: 3000 });
  });
});

describe("the feature switch", () => {
  it("starts on for gas dealers", () => {
    expect(defaultFeatures(["Gas / LPG Dealer"]).gas).toBe(true);
    expect(defaultFeatures(["Supermarket"]).gas).toBe(false);
    saveFeatures({ gas: true });
    expect(currentFeatures(["Supermarket"]).gas).toBe(true);
  });
});
