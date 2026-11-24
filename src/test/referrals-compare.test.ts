import { describe, expect, it } from "vitest";
import { empty, MAIN_LOCATION, type ErpState } from "@/lib/erp";
import { deviceReferralCode, freeMonths, referralPlan } from "@/lib/referrals";
import { compareShops } from "@/lib/shop-compare";

describe("invite a shop, get a free month", () => {
  it("needs 2, 3 or 5 paying shops per free month by the inviter's plan", () => {
    expect(freeMonths(3, "basic")).toEqual({ per: 2, earned: 1, toNext: 1 });
    expect(freeMonths(6, "growth")).toEqual({ per: 3, earned: 2, toNext: 3 });
    expect(freeMonths(4, "business")).toEqual({ per: 5, earned: 0, toNext: 1 });
  });
  it("uses the paid plan, or the trial's chosen plan", () => {
    expect(referralPlan({ plan: "basic" })).toBe("basic");
    expect(referralPlan({ plan: "trial", trialChoice: "business" })).toBe("business");
    expect(referralPlan({ plan: "trial" })).toBe("growth");
  });
  it("makes the same six-character code for the same business", () => {
    localStorage.removeItem("shopbook.refCode");
    const a = deviceReferralCode({ businessId: "b-1", email: "a@x.com", shopName: "A" });
    expect(a).toMatch(/^[A-Z0-9]{6}$/);
    expect(deviceReferralCode({ businessId: "b-1", email: "A@x.com", shopName: "A" })).toBe(a);
    expect(deviceReferralCode({ businessId: "b-2", email: "a@x.com", shopName: "A" })).not.toBe(a);
  });
});

describe("compare shops", () => {
  it("works out each shop from its own stock and sales, and counts a product once in the total", () => {
    const now = new Date(2026, 10, 24, 12).getTime();
    const s: ErpState = {
      ...empty(),
      locations: [{ id: MAIN_LOCATION, name: "Main", code: "S001", type: "shop", createdAt: 1 }, { id: "loc-2", name: "Town", code: "S002", type: "shop", createdAt: 2 }] as ErpState["locations"],
      products: [{ id: "p1", name: "Sugar", buy: 100, sell: 150, qty: 40, createdAt: 1 }] as ErpState["products"],
      movements: [{ id: "m1", productId: "p1", qty: 10, locationId: "loc-2", at: 1, type: "TRANSFER IN", user: "o", ref: "T1", source: "T1", prev: 0, next: 10 }] as unknown as ErpState["movements"],
      sales: [{ id: "s1", ref: "S-1", at: now - 1000, items: [], subtotal: 300, discount: 0, total: 300, pay: { cash: 300, mpesa: 0, bank: 0, credit: 0 }, cashier: "o", channel: "POS" }] as ErpState["sales"],
    };
    const { rows, total } = compareShops(s, now);
    expect(rows.map((r) => [r.name, r.units, r.stockValue, r.salesToday])).toEqual([["Main", 30, 3000, 300], ["Town", 10, 1000, 0]]);
    expect(total).toMatchObject({ products: 1, units: 40, stockValue: 4000, salesToday: 300 });
  });
});
