import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { readSettings } from "@/lib/settings-config";
import { store } from "@/lib/shopbook";
import { hashPassword } from "@/lib/device-password";
import { tillLimited, tillMayOpen } from "@/lib/till-cashier";
import { getTax } from "@/lib/prefs";
import { suggestMapping } from "@/lib/import-center";
import {
  READY_STEPS, endCashier, financialYearStart, paymentLines, printedRef, readyProgress, readyStatus, saveHours, saveNumbering, savePayments,
  saveTax, setOpeningFloat, setStaffPin, skipStep, switchCashier, tillCashier,
} from "@/lib/ready-setup";
import { currentFeatures, defaultFeatures, saveFeatures } from "@/lib/trade-features";

const tr = (x: string) => x;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
});

describe("Ready to sell", () => {
  it("starts with every step to do and counts skipped steps as handled", () => {
    const st = readyStatus(erp.load());
    expect(READY_STEPS.every((k) => st[k] === "todo")).toBe(true);
    skipStep("pins");
    expect(readyStatus(erp.load()).pins).toBe("skipped");
    expect(readyProgress(readyStatus(erp.load()))).toBe(1);
    skipStep("pins", false);
    expect(readyStatus(erp.load()).pins).toBe("todo");
  });

  it("saves payment details and prints them", () => {
    expect(() => savePayments({ tillNumber: "12" })).toThrow("5 to 8 digits");
    expect(() => savePayments({ paybillAccount: "ACC" })).toThrow("Paybill number");
    savePayments({ tillNumber: "123456", paybill: "400200", paybillAccount: "SHOP1", bankName: "KCB", bankAccount: "1100" });
    expect(paymentLines(tr)).toEqual(["M-Pesa Till: 123456", "M-Pesa Paybill: 400200 · Account: SHOP1", "KCB Account: 1100"]);
    expect(readyStatus(erp.load()).payments).toBe("done");
  });

  it("sets VAT and checks the KRA PIN", () => {
    expect(() => saveTax(true, 16, "123")).toThrow("KRA PIN");
    saveTax(true, 16, "p051234567x");
    expect(getTax()).toEqual({ on: true, rate: 16 });
    expect(readSettings().taxPin).toBe("P051234567X");
    expect(readyStatus(erp.load()).tax).toBe("done");
  });

  it("records opening cash per till", () => {
    erp.commit((st) => { st.locations = [{ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 2 } as erp.Location]; });
    setOpeningFloat(1, 2000); setOpeningFloat(2, 500);
    const s = erp.load();
    expect(s.cash.filter((e) => e.type === "OPENING").map((e) => [e.counter ?? 1, e.amount]).sort()).toEqual([[1, 2000], [2, 500]]);
    expect(() => setOpeningFloat(3, 100)).toThrow("till");
    expect(readyStatus(s).cash).toBe("done");
  });

  it("continues numbering forward only and prints the prefix", () => {
    saveNumbering("kif", 1500, 40);
    const s = erp.load();
    expect(s.seq["S"]).toBe(1499);
    expect(s.seq["QT"]).toBe(39);
    expect(printedRef("S-001500")).toBe("KIF/S-001500");
    expect(() => saveNumbering("KIF", 10)).toThrow("already used");
    expect(() => saveNumbering("TOO-LONG")).toThrow("1 to 6");
  });

  it("works out the financial year start", () => {
    saveHours("Mon–Sat 8–8", 7);
    expect(new Date(financialYearStart(new Date(2026, 10, 22))).toISOString().slice(0, 7)).toBe(new Date(2026, 6, 1).toISOString().slice(0, 7));
    expect(new Date(financialYearStart(new Date(2026, 2, 1))).getFullYear()).toBe(2025);
    expect(readyStatus(erp.load()).hours).toBe("done");
  });

  it("switches the till's cashier by PIN and records their name on sales", async () => {
    erp.commit((st) => { st.employees = [{ id: "e1", name: "Amina", active: true } as erp.Employee, { id: "e2", name: "Juma", active: true } as erp.Employee]; });
    await setStaffPin("e1", "1234"); await setStaffPin("e2", "9876");
    expect(erp.load().employees[0]!.pin).not.toBe("1234");
    await expect(switchCashier(erp.load(), "0000")).rejects.toThrow("Wrong PIN");
    expect((await switchCashier(erp.load(), "9876")).name).toBe("Juma");
    expect(tillCashier()?.name).toBe("Juma");
    erp.commit((_s, c) => c.audit("TEST", "x"));
    expect(erp.load().audit[0]!.user).toBe("Juma");
    await endCashier(erp.load(), "x"); // the test owner's device password
    expect(tillCashier()).toBeNull();
  });

  it("limits a cashier to selling screens and needs the owner or a manager to end their turn", async () => {
    store.update({ password: await hashPassword("owner-secret") });
    erp.commit((st) => { st.employees = [{ id: "c1", name: "Amina", role: "shopkeeper", active: true } as erp.Employee, { id: "m1", name: "Baraka", role: "manager", active: true } as erp.Employee]; });
    await setStaffPin("c1", "1111"); await setStaffPin("m1", "2222");
    await switchCashier(erp.load(), "1111");
    expect(tillLimited()).toBe(true);
    expect(tillMayOpen("/pos")).toBe(true);
    expect(tillMayOpen("/settings")).toBe(false);
    expect(tillMayOpen("/setup")).toBe(false);
    await expect(endCashier(erp.load(), "1111")).rejects.toThrow("owner or a manager");
    await expect(endCashier(erp.load(), "wrong")).rejects.toThrow("owner or a manager");
    await endCashier(erp.load(), "2222");
    expect(tillCashier()).toBeNull();
    await switchCashier(erp.load(), "1111");
    await endCashier(erp.load(), "owner-secret");
    expect(tillCashier()).toBeNull();
    await switchCashier(erp.load(), "2222");
    expect(tillLimited()).toBe(false);
  });

  it("puts the cashier's employee id on the sale", async () => {
    erp.commit((st) => { st.employees = [{ id: "c1", name: "Amina", role: "shopkeeper", active: true } as erp.Employee]; });
    await setStaffPin("c1", "1111");
    await switchCashier(erp.load(), "1111");
    const p = erp.addProduct({ name: "Soap", buy: 50, sell: 80, qty: 5, unit: "pcs" });
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], pay: { cash: 80, mpesa: 0, bank: 0, credit: 0 }, channel: "POS", discount: 0 } as unknown as erp.SaleInput);
    expect(sale.cashier).toBe("Amina");
    expect(sale.cashierId).toBe("c1");
  });
});

describe("Quotations are built in", () => {
  it("is on for every business and ignores an older saved off", () => {
    expect(defaultFeatures(["Butchery"]).quotations).toBe(true);
    saveFeatures({ quotations: false });
    expect(currentFeatures(["Hardware Shop"]).quotations).toBe(true);
  });
});

describe("moving from another system", () => {
  it("matches Odoo, QuickBooks and Zoho product columns", () => {
    const odoo = suggestMapping(["Name", "Internal Reference", "Barcode", "Sales Price", "Cost", "Quantity On Hand", "Product Category", "Unit of Measure"], "Products");
    expect(odoo).toMatchObject({ "Name": "name", "Internal Reference": "sku", "Barcode": "barcode", "Sales Price": "sell", "Cost": "buy", "Quantity On Hand": "qty", "Product Category": "category", "Unit of Measure": "unit" });
    const qb = suggestMapping(["Product/Service Name", "SKU", "Sales Price / Rate", "Purchase Cost", "Quantity On Hand"], "Products");
    expect(qb).toMatchObject({ "Product/Service Name": "name", "Sales Price / Rate": "sell", "Purchase Cost": "buy", "Quantity On Hand": "qty" });
    const zoho = suggestMapping(["Item Name", "SKU", "Selling Price", "Purchase Price", "Stock On Hand"], "Products");
    expect(zoho).toMatchObject({ "Item Name": "name", "Selling Price": "sell", "Purchase Price": "buy", "Stock On Hand": "qty" });
  });
});
