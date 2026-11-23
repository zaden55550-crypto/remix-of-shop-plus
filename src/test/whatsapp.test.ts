import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { dailySummary, waLink, waNumber } from "@/lib/whatsapp";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1", country: "KEN" }));
  localStorage.setItem("shopbook.session", "1");
});

describe("WhatsApp and the daily summary", () => {
  it("turns a local number into a WhatsApp number", () => {
    expect(waNumber("0722 569460", "KEN")).toBe("254722569460");
    expect(waNumber("+254722569460", "KEN")).toBe("254722569460");
    expect(waNumber("254722569460", "KEN")).toBe("254722569460");
    expect(waNumber("", "KEN")).toBe("");
    expect(waLink("Hi there", "0722569460", "KEN")).toBe("https://wa.me/254722569460?text=Hi%20there");
  });
  it("sums today's sales, payments, cash and low stock", () => {
    const p = erp.addProduct({ name: "Soap", buy: 40, sell: 60, qty: 2, unit: "pcs", minStock: 5 });
    erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: 60, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
    const text = dailySummary(erp.load(), { business: "Kifaru", money: (n) => `KSh ${n}`, tr: (x) => x });
    expect(text).toContain("Sales: 1 · KSh 60");
    expect(text).toContain("Cash in the drawer: KSh 60");
    expect(text).toContain("Soap (1)");
  });
});
