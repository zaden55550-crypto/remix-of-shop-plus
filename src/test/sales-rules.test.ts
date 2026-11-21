import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";

// Core selling rules shared by Sales and POS (both go through erp.confirmSale).
const seed = () => erp.commit((s, c) => { s.products.push({ id: "p", name: "Phone Case", buy: 300, sell: 500, qty: 0, createdAt: 1 }); c.move("p", "OPENING", 20); });
const pay = (cash = 0, mpesa = 0, bank = 0, credit = 0) => ({ cash, mpesa, bank, credit });
const stock = () => erp.load().products.find((p) => p.id === "p")!.qty;

describe("sales and POS rules", () => {
  beforeEach(() => { localStorage.clear(); seed(); });

  it("completes a walk-in sale without creating or naming a customer", () => {
    const sale = erp.confirmSale({ cart: [{ productId: "p", qty: 2 }], discount: 0, pay: pay(1000), channel: "POS" });
    expect(sale.customerId).toBeUndefined();
    expect(erp.load().customers).toHaveLength(0);
    expect(stock()).toBe(18);
  });

  it("refuses credit without an identified customer and changes nothing", () => {
    const before = localStorage.getItem("shopbook.erp");
    expect(() => erp.confirmSale({ cart: [{ productId: "p", qty: 1 }], discount: 0, pay: pay(200, 0, 0, 300), channel: "Sales" })).toThrow("Credit needs a registered customer");
    expect(localStorage.getItem("shopbook.erp")).toBe(before);
  });

  it("combines Cash, M-Pesa and Bank with a credit remainder for a known customer", () => {
    const cu = erp.addCustomer("Brian");
    const sale = erp.confirmSale({ cart: [{ productId: "p", qty: 4 }], discount: 0, pay: pay(500, 700, 300, 500), customerId: cu.id, channel: "Sales" });
    expect(sale.total).toBe(2000);
    expect(sale.pay).toEqual(pay(500, 700, 300, 500));
    expect(erp.load().customers.find((c) => c.id === cu.id)!.balance).toBe(500);
    expect(stock()).toBe(16);
  });
});
