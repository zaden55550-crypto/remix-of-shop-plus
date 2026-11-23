import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { saveSettings } from "@/lib/settings-config";
import { creditReminder, debtors, parseSpokenProduct, pointsOf, redeemPoints, reorderSuggestions, saveLoyalty, theftAlerts } from "@/lib/shop-tools";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
});
const money = (n: number) => `KSh ${n}`, tr = (x: string) => x;
const sell = (productId: string, qty: number, price: number, customerId?: string, discount = 0) =>
  erp.confirmSale({ cart: [{ productId, qty, ...(price ? { price } : {}) }], discount, pay: { cash: qty * price - discount, mpesa: 0, bank: 0, credit: 0 }, channel: "POS", ...(customerId ? { customerId } : {}) } as unknown as erp.SaleInput);

describe("shop tools", () => {
  it("writes a credit reminder and lists who owes most first", () => {
    const s = { ...erp.empty(), customers: [{ id: "a", name: "Asha", balance: 300, createdAt: 1 }, { id: "b", name: "Baraka", balance: 900, createdAt: 1 }, { id: "c", name: "Chebet", balance: 0, createdAt: 1 }] };
    expect(debtors(s).map((c) => c.name)).toEqual(["Baraka", "Asha"]);
    expect(creditReminder(s.customers[0]!, { business: "Kifaru", money, tr, payLines: ["M-Pesa Till: 123456"] })).toBe("Hello Asha,\nThis is a friendly reminder from Kifaru: your balance is KSh 300.\nYou can pay by:\nM-Pesa Till: 123456\nThank you!");
  });
  it("suggests what to reorder from recent sales", () => {
    const p = erp.addProduct({ name: "Sugar", buy: 150, sell: 180, qty: 30, unit: "pcs" });
    sell(p.id, 28, 180);
    const r = reorderSuggestions(erp.load());
    expect(r[0]).toMatchObject({ left: 2, perDay: 1, daysLeft: 2, order: 12 });
  });
  it("earns and redeems loyalty points", () => {
    saveLoyalty({ on: true, earnPer: 100, pointValue: 1 });
    const cu = erp.addCustomer("Asha", "0711000000");
    const p = erp.addProduct({ name: "Oil", buy: 200, sell: 350, qty: 10, unit: "pcs" });
    sell(p.id, 2, 350, cu.id);
    expect(pointsOf(erp.load(), erp.load().customers[0]!)).toBe(7);
    expect(redeemPoints(cu.id, 5)).toBe(5);
    expect(pointsOf(erp.load(), erp.load().customers[0]!)).toBe(2);
    expect(() => redeemPoints(cu.id, 5)).toThrow(/Not enough points/);
  });
  it("raises alerts for big discounts and sales below cost", () => {
    saveSettings({ alertDiscountPct: 20 });
    const p = erp.addProduct({ name: "Soap", buy: 50, sell: 60, qty: 10, unit: "pcs" });
    sell(p.id, 2, 60, undefined, 30);
    const kinds = theftAlerts(erp.load(), { money, tr }).map((a) => a.kind);
    expect(kinds).toContain("discount");
  });
  it("reads a spoken product", () => {
    expect(parseSpokenProduct("sugar 1 kilo 180 shillings 20 pieces")).toEqual({ name: "Sugar 1 Kilo", sell: 180, qty: 20 });
    expect(parseSpokenProduct("bread price 65")).toEqual({ name: "Bread", sell: 65 });
  });
});
