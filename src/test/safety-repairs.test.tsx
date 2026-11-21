// The critical repairs from the technical audit: no pretend payments, no readable passwords, one trial per shop, and hidden costs stay hidden.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword, isHashed } from "@/lib/device-password";
import { empty, type ErpState } from "@/lib/erp";
import { filterForStaff } from "@/lib/staff-access";

describe("owner's device password", () => {
  it("is stored as a salted hash that still signs in", async () => {
    const stored = await hashPassword("my-secret");
    expect(isHashed(stored)).toBe(true);
    expect(stored).not.toContain("my-secret");
    expect(await hashPassword("my-secret")).not.toBe(stored);
    expect((await checkPassword("my-secret", stored)).ok).toBe(true);
    expect((await checkPassword("wrong", stored)).ok).toBe(false);
  });
  it("accepts an older plain-text password once and offers its hash in its place", async () => {
    const r = await checkPassword("old-pass", "old-pass");
    expect(r.ok).toBe(true);
    expect(isHashed(r.upgrade ?? "")).toBe(true);
    expect((await checkPassword("old-pass", r.upgrade)).ok).toBe(true);
    expect((await checkPassword("nope", "old-pass")).ok).toBe(false);
  });
  it("refuses when there is nothing stored", async () => expect((await checkPassword("", "")).ok).toBe(false));
});

describe("the plans page", () => {
  const page = readFileSync(resolve("src/routes/plans.tsx"), "utf8");
  it("activates a plan only through the payment step and never asks for card details", () => {
    expect(page).not.toMatch(/store\.update\(\{\s*plan:\s*(chosenPlanId|plan\.id)/);
    expect(page).toContain("buyPlan(");
    expect(page).not.toMatch(/Payment confirmed|cardNumber|cardCvc/);
  });
  it("doesn't restart the trial", () => {
    expect(page).toContain("trialStart: started ?? Date.now()");
  });
});

describe("staff without cost access", () => {
  const state = { ...empty(),
    products: [{ id: "p", name: "P", buy: 100, sell: 150, qty: 1, createdAt: 1 }],
    purchases: [{ id: "x", ref: "PO-1", at: 1, items: [{ productId: "p", name: "P", qty: 10, cost: 100, returned: 0 }], total: 1000, pay: { cash: 700, mpesa: 0, bank: 0, credit: 300 }, settled: 100, user: "A" }],
    purchaseReturns: [{ id: "r", ref: "PRT-1", at: 1, purchaseId: "x", purchaseRef: "PO-1", items: [{ productId: "p", name: "P", qty: 1, amount: 100 }], amount: 100, refund: "cash", user: "A" }],
    purchaseOrders: [{ id: "o", ref: "LPO-1", at: 1, supplierId: "s", lines: [{ productId: "p", name: "P", qty: 2, cost: 100, received: 0 }], total: 200, status: "Sent", user: "A" }],
    supplierInvoices: [{ id: "i", number: "1", supplierId: "s", at: 1, amount: 200, user: "A", createdAt: 1 }],
  } as unknown as ErpState;
  const access = (extra: string[] = []) => ({ permissions: ["module.purchases.view", ...extra], locationRefs: ["loc-main"] });

  it("can't work out a cost from a document's total", () => {
    const text = JSON.stringify(filterForStaff(state, access()));
    for (const figure of ["1000", "700", "300", "200", ":100"]) expect(text).not.toContain(figure);
    const f = filterForStaff(state, access());
    expect(f.purchases[0]?.items[0]?.qty).toBe(10);
    expect(f.purchases[0]?.pay).toEqual({ cash: 0, mpesa: 0, bank: 0, credit: 0 });
  });
  it("sees the figures once they are allowed cost access", () => {
    const f = filterForStaff(state, access(["products.view_buying_price"]));
    expect(f.purchases[0]?.total).toBe(1000);
    expect(f.purchaseOrders[0]?.total).toBe(200);
    expect(f.purchases[0]?.items[0]?.cost).toBe(100);
  });
});
