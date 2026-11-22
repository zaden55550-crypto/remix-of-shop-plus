import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { WHOLESALE_AUTO, WHOLESALE_CHOSEN, applyPriceLevels, chooseWholesale, moreForWholesale, qualifies } from "@/lib/price-levels";
import { readWholesale } from "@/components/shopbook/wholesale-fields";
import { currentFeatures, defaultFeatures, saveFeatures } from "@/lib/trade-features";

// Soda: retail 60, wholesale 50 each from 6 bottles.
const soda: erp.Product = { id: "soda", name: "Soda", unit: "pcs", qty: 100, sell: 60, buy: 40, createdAt: 1, wholesale: { price: 50, from: 6 } };
const bread: erp.Product = { id: "bread", name: "Bread", unit: "pcs", qty: 50, sell: 65, buy: 50, createdAt: 1 };
const s = { products: [soda, bread] };

beforeEach(() => localStorage.clear());

describe("the wholesale rule", () => {
  it("6 and above is wholesale; below is retail", () => {
    expect(qualifies(soda, 6)).toBe(true);
    expect(qualifies(soda, 12)).toBe(true);
    expect(qualifies(soda, 5)).toBe(false);
    expect(moreForWholesale(soda, 4)).toBe(2);
    expect(moreForWholesale(soda, 6)).toBe(0);
  });
  it("a wholesale customer gets it at any quantity", () => {
    expect(qualifies(soda, 1, { wholesale: true })).toBe(true);
    expect(moreForWholesale(soda, 1, { wholesale: true })).toBe(0);
  });
  it("a product without a wholesale price never qualifies", () => {
    expect(qualifies(bread, 100, { wholesale: true })).toBe(false);
  });
});

describe("the till applies it by itself", () => {
  it("applies at 6, and takes it off again below 6", () => {
    const at6 = applyPriceLevels(s, [{ productId: "soda", qty: 6 }], true);
    expect(at6[0]).toEqual({ productId: "soda", qty: 6, price: 50, priceReason: WHOLESALE_AUTO });
    const back = applyPriceLevels(s, [{ ...at6[0]!, qty: 3 }], true);
    expect(back[0]).toEqual({ productId: "soda", qty: 3 });
  });
  it("does nothing while the feature is off", () => {
    expect(applyPriceLevels(s, [{ productId: "soda", qty: 10 }], false)[0]).toEqual({ productId: "soda", qty: 10 });
  });
  it("never changes a price the cashier typed", () => {
    const typed: erp.CartLine = { productId: "soda", qty: 10, price: 55, priceReason: "Manual price" };
    expect(applyPriceLevels(s, [typed], true)[0]).toBe(typed);
  });
  it("lets the cashier choose wholesale below 6, and keeps that choice", () => {
    const chosen = chooseWholesale(soda, { productId: "soda", qty: 2 });
    expect(chosen).toEqual({ productId: "soda", qty: 2, price: 50, priceReason: WHOLESALE_CHOSEN });
    expect(applyPriceLevels(s, [chosen], true)[0]).toBe(chosen);
  });
  it("leaves lines unchanged when nothing applies (no endless updates)", () => {
    const cart: erp.CartLine[] = [{ productId: "bread", qty: 2 }];
    expect(applyPriceLevels(s, cart, true)[0]).toBe(cart[0]);
    const done = applyPriceLevels(s, [{ productId: "soda", qty: 6 }], true);
    expect(applyPriceLevels(s, done, true)[0]).toBe(done[0]);
  });
});

describe("a real sale records the wholesale price", () => {
  it("charges and saves 50 each for 6 sodas", () => {
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
    localStorage.setItem("shopbook.session", "1");
    localStorage.setItem("shopbook.erp", JSON.stringify({ products: [soda, bread] }));
    const cart = applyPriceLevels(erp.load(), [{ productId: "soda", qty: 6 }, { productId: "bread", qty: 1 }], true);
    const sale = erp.confirmSale({ cart, discount: 0, pay: { cash: 365, mpesa: 0, bank: 0, credit: 0 }, channel: "POS", vatRate: 0 });
    expect(sale.items.find((i) => i.productId === "soda")).toMatchObject({ qty: 6, price: 50 });
    expect(sale.items.find((i) => i.productId === "bread")).toMatchObject({ qty: 1, price: 65 });
    expect(sale.total).toBe(365);
    expect(erp.load().audit.some((a) => a.action === "PRICE OVERRIDE" && a.detail.includes("Wholesale price"))).toBe(true);
  });
});

describe("setting it up", () => {
  it("reads the product form's two boxes", () => {
    expect(readWholesale({ price: "", from: "" }, "pcs")).toEqual({ ok: true, value: undefined });
    expect(readWholesale({ price: "50", from: "6" }, "pcs")).toEqual({ ok: true, value: { price: 50, from: 6 } });
    expect(readWholesale({ price: "50", from: "2.5" }, "kg")).toEqual({ ok: true, value: { price: 50, from: 2.5 } });
    expect(readWholesale({ price: "50", from: "2.5" }, "pcs").ok).toBe(false);
    expect(readWholesale({ price: "0", from: "6" }, "pcs").ok).toBe(false);
    expect(readWholesale({ price: "50", from: "" }, "pcs").ok).toBe(false);
  });
  it("starts on for shops that sell wholesale, and follows the owner's choice", () => {
    expect(defaultFeatures(["Wholesale Business"]).priceLevels).toBe(true);
    expect(defaultFeatures(["Pharmacy"]).priceLevels).toBe(false);
    saveFeatures({ priceLevels: true });
    expect(currentFeatures(["Pharmacy"]).priceLevels).toBe(true);
  });
});
